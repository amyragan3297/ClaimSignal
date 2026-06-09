import { db } from "./db";
import { normalizeAdjusterName } from "./adjuster-linking";
import { adjusters, claimAdjusters, adjusterAggregatedMetrics, type Adjuster } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { computeAggregatedMetrics } from "./aggregation";

export interface DedupeResult {
  totalActive: number;
  duplicateGroups: number;
  mergedCount: number;
  orphanedMetricsDeleted: number;
  metricsRecomputed: number;
  log: string[];
}

function nameKey(name: string): string {
  return normalizeAdjusterName(name)
    .toLowerCase()
    .replace(/\s+[a-z]\.\s+/g, " ")
    .replace(/\s+[a-z]\s+(?=[a-z])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface OrphanedMetricKey {
  adjusterName: string;
  carrier: string;
}

/**
 * Runs adjuster deduplication across all organizations.
 * Idempotent — safe to run multiple times.
 *
 * Merge strategy:
 *  - Group by (organizationId, normalizedNameKey)
 *  - Earliest createdAt is canonical
 *  - claim_adjusters rows re-pointed to canonical (conflicts deleted)
 *  - Duplicates soft-deleted (deleted_at = NOW())
 *  - Orphaned aggregated_metrics rows cleaned up
 *  - Current-period metrics recomputed for merged canonicals
 *
 * @param orgId — optional organization filter; if provided, only dedupes within that org
 */
export async function runAdjusterDedup(orgId?: string): Promise<DedupeResult> {
  const log: string[] = [];

  const whereClause = orgId
    ? and(sql`${adjusters.deletedAt} IS NULL`, eq(adjusters.organizationId, orgId))
    : sql`${adjusters.deletedAt} IS NULL`;

  const all = await db
    .select()
    .from(adjusters)
    .where(whereClause);

  log.push(`Loaded ${all.length} active adjuster record(s).${orgId ? ` (orgId: ${orgId})` : ""}`);

  const groups = new Map<string, Adjuster[]>();
  for (const adj of all) {
    const key = `${adj.organizationId}||${nameKey(adj.adjusterName)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(adj);
  }

  const dupGroups = Array.from(groups.values()).filter((g) => g.length > 1);
  log.push(`Found ${dupGroups.length} duplicate group(s) requiring a merge.`);

  let mergedCount = 0;
  const orphanedMetricKeys: OrphanedMetricKey[] = [];

  for (const members of dupGroups) {
    members.sort((a, b) => {
      const ta = a.createdAt?.getTime() ?? 0;
      const tb = b.createdAt?.getTime() ?? 0;
      return ta - tb;
    });

    const canonical = members[0];
    const duplicates = members.slice(1);

    log.push(`Group — canonical: id=${canonical.id} name="${canonical.adjusterName}" carrier="${canonical.carrierName}" org=${canonical.organizationId}`);

    for (const dup of duplicates) {
      log.push(`  Duplicate: id=${dup.id} name="${dup.adjusterName}" createdAt=${dup.createdAt?.toISOString() ?? "unknown"}`);

      const dupLinks = await db
        .select()
        .from(claimAdjusters)
        .where(eq(claimAdjusters.adjusterId, dup.id));

      log.push(`  claim_adjusters rows to migrate: ${dupLinks.length}`);

      for (const link of dupLinks) {
        const conflict = await db
          .select({ id: claimAdjusters.id })
          .from(claimAdjusters)
          .where(
            and(
              eq(claimAdjusters.claimId, link.claimId),
              eq(claimAdjusters.adjusterId, canonical.id),
              eq(claimAdjusters.roleOnClaim, link.roleOnClaim),
            ),
          );

        if (conflict.length > 0) {
          await db
            .delete(claimAdjusters)
            .where(eq(claimAdjusters.id, link.id));
          log.push(`    Deleted conflicting link id=${link.id} (claimId=${link.claimId}, role=${link.roleOnClaim}) — canonical already has this link`);
        } else {
          await db
            .update(claimAdjusters)
            .set({ adjusterId: canonical.id })
            .where(eq(claimAdjusters.id, link.id));
          log.push(`    Re-pointed link id=${link.id} claimId=${link.claimId} role=${link.roleOnClaim} → canonical ${canonical.id}`);
        }
      }

      await db.execute(
        sql`UPDATE adjusters SET deleted_at = NOW() WHERE id = ${dup.id}`,
      );

      log.push(`  Soft-deleted duplicate adjuster id=${dup.id}`);

      const dupName = dup.adjusterName ?? "";
      const dupCarrier = dup.carrierName ?? "";
      const canonName = canonical.adjusterName ?? "";
      const canonCarrier = canonical.carrierName ?? "";
      const alreadyTracked = orphanedMetricKeys.some(
        (k) => k.adjusterName === dupName && k.carrier === dupCarrier,
      );
      if (!alreadyTracked && (dupName !== canonName || dupCarrier !== canonCarrier)) {
        orphanedMetricKeys.push({ adjusterName: dupName, carrier: dupCarrier });
      }

      mergedCount++;
    }
  }

  log.push(`Merged ${mergedCount} duplicate adjuster profile(s).`);

  let orphanedMetricsDeleted = 0;

  if (orphanedMetricKeys.length > 0) {
    log.push(`Checking ${orphanedMetricKeys.length} candidate (name, carrier) pair(s) for orphaned metrics…`);

    for (const { adjusterName, carrier } of orphanedMetricKeys) {
      const stillActive = await db
        .select({ id: adjusters.id })
        .from(adjusters)
        .where(
          and(
            eq(adjusters.adjusterName, adjusterName),
            eq(adjusters.carrierName, carrier),
            sql`${adjusters.deletedAt} IS NULL`,
          ),
        )
        .limit(1);

      if (stillActive.length > 0) {
        log.push(`  Skipping name="${adjusterName}" carrier="${carrier}" — still referenced by active adjuster id=${stillActive[0].id}`);
        continue;
      }

      const result = await db
        .delete(adjusterAggregatedMetrics)
        .where(
          and(
            eq(adjusterAggregatedMetrics.adjusterName, adjusterName),
            eq(adjusterAggregatedMetrics.carrier, carrier),
          ),
        )
        .returning({ id: adjusterAggregatedMetrics.id });

      orphanedMetricsDeleted += result.length;
      log.push(`  Deleted ${result.length} orphaned metric row(s) for name="${adjusterName}" carrier="${carrier}"`);
    }
  }

  let metricsRecomputed = 0;

  if (mergedCount > 0) {
    const timePeriod = new Date().toISOString().slice(0, 7);
    log.push(`Recomputing aggregated metrics for time period "${timePeriod}"…`);
    const { computed } = await computeAggregatedMetrics(timePeriod);
    metricsRecomputed = computed;
    log.push(`Recomputed ${computed} aggregated metric row(s).`);
  } else {
    log.push("No merges performed — skipping metrics recompute.");
  }

  return {
    totalActive: all.length,
    duplicateGroups: dupGroups.length,
    mergedCount,
    orphanedMetricsDeleted,
    metricsRecomputed,
    log,
  };
}

export interface DedupStatus {
  totalActive: number;
  duplicateGroups: number;
  duplicatesInGroups: number;
  lastRun: string | null;
}

/**
 * Returns a lightweight read-only status for the duplicate-review panel.
 * Does not perform any merges or recompute metrics.
 */
export async function getDedupStatus(orgId: string): Promise<DedupStatus> {
  const all = await db
    .select()
    .from(adjusters)
    .where(and(sql`${adjusters.deletedAt} IS NULL`, eq(adjusters.organizationId, orgId)));

  const groups = new Map<string, Adjuster[]>();
  for (const adj of all) {
    const key = nameKey(adj.adjusterName);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(adj);
  }

  const dupGroups = Array.from(groups.values()).filter((g) => g.length > 1);
  const duplicatesInGroups = dupGroups.reduce((sum, g) => sum + g.length - 1, 0);

  // Last time any adjuster was soft-deleted in this org (approximate "last run")
  const lastDeleted = await db
    .select({ deletedAt: adjusters.deletedAt })
    .from(adjusters)
    .where(and(eq(adjusters.organizationId, orgId), sql`${adjusters.deletedAt} IS NOT NULL`))
    .orderBy(sql`${adjusters.deletedAt} DESC`)
    .limit(1);

  return {
    totalActive: all.length,
    duplicateGroups: dupGroups.length,
    duplicatesInGroups,
    lastRun: lastDeleted[0]?.deletedAt ? new Date(lastDeleted[0].deletedAt).toISOString() : null,
  };
}
