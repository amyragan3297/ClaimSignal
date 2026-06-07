import { db } from "../server/db";
import { normalizeAdjusterName } from "../server/adjuster-linking";
import { adjusters, claimAdjusters, adjusterAggregatedMetrics, type Adjuster } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { computeAggregatedMetrics } from "../server/aggregation";

/**
 * One-time deduplication script for adjuster profiles created before name
 * normalization was in place.
 *
 * Safe to re-run: already-merged duplicates are soft-deleted (deleted_at IS NOT
 * NULL) and are therefore excluded from the initial load on every subsequent run.
 *
 * Merge strategy:
 *   - Group adjusters by (organizationId, nameKey) — carrier is not part of
 *     the match key so the same person with different carrier spellings is
 *     still caught.
 *   - Within each duplicate group the earliest createdAt is the canonical record.
 *   - Every claim_adjusters row pointing at a duplicate is re-pointed to the
 *     canonical.  If the canonical already owns that (claimId, roleOnClaim) pair
 *     the conflicting link is deleted instead.
 *   - The duplicate adjuster row is soft-deleted (deleted_at = NOW()).
 *   - adjuster_aggregated_metrics rows for the soft-deleted duplicate are deleted
 *     (those keyed by a name/carrier pair that no longer belongs to any active
 *     adjuster), and the current time-period metrics are fully recomputed so the
 *     canonical adjuster's aggregated row reflects the now-complete claim set.
 *
 * Run with:
 *   npx tsx scripts/dedupe-adjusters.ts
 */

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

async function run() {
  console.log("=== Adjuster deduplication script ===\n");

  const all = await db
    .select()
    .from(adjusters)
    .where(sql`deleted_at IS NULL`);

  console.log(`Loaded ${all.length} active adjuster record(s).`);

  // Group by (organizationId, normalizedNameKey) only — matching the task
  // requirement that any two records whose normalized names are equivalent
  // within the same org are duplicates, regardless of carrier name.
  const groups = new Map<string, Adjuster[]>();
  for (const adj of all) {
    const key = `${adj.organizationId}||${nameKey(adj.adjusterName)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(adj);
  }

  const dupGroups = Array.from(groups.values()).filter((g) => g.length > 1);
  console.log(`Found ${dupGroups.length} duplicate group(s) requiring a merge.\n`);

  let mergedCount = 0;

  // Collect (adjusterName, carrierName) pairs that become orphaned after each
  // merge so we can clean up adjuster_aggregated_metrics afterwards.
  const orphanedMetricKeys: OrphanedMetricKey[] = [];

  for (const members of dupGroups) {
    members.sort((a, b) => {
      const ta = a.createdAt?.getTime() ?? 0;
      const tb = b.createdAt?.getTime() ?? 0;
      return ta - tb;
    });

    const canonical = members[0];
    const duplicates = members.slice(1);

    console.log(`Group — canonical: id=${canonical.id} name="${canonical.adjusterName}" carrier="${canonical.carrierName}" org=${canonical.organizationId}`);

    for (const dup of duplicates) {
      console.log(`  Duplicate: id=${dup.id} name="${dup.adjusterName}" createdAt=${dup.createdAt?.toISOString() ?? "unknown"}`);

      const dupLinks = await db
        .select()
        .from(claimAdjusters)
        .where(eq(claimAdjusters.adjusterId, dup.id));

      console.log(`  claim_adjusters rows to migrate: ${dupLinks.length}`);

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
          console.log(`    Deleted conflicting link id=${link.id} (claimId=${link.claimId}, role=${link.roleOnClaim}) — canonical already has this link`);
        } else {
          await db
            .update(claimAdjusters)
            .set({ adjusterId: canonical.id })
            .where(eq(claimAdjusters.id, link.id));
          console.log(`    Re-pointed link id=${link.id} claimId=${link.claimId} role=${link.roleOnClaim} → canonical ${canonical.id}`);
        }
      }

      await db.execute(
        sql`UPDATE adjusters SET deleted_at = NOW() WHERE id = ${dup.id}`,
      );

      console.log(`  Soft-deleted duplicate adjuster id=${dup.id}`);

      // Track orphaned metric keys: a (name, carrier) pair belonging to the
      // duplicate is orphaned when it differs from the canonical's pair.
      // If they share the same (name, carrier) the metric row already
      // represents the canonical and will be refreshed by Phase 3.
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

    console.log();
  }

  console.log(`=== Done. Merged ${mergedCount} duplicate adjuster profile(s). ===`);

  // ── Phase 2: clean up truly orphaned adjuster_aggregated_metrics rows ────
  // Metric rows are keyed by (adjusterName, carrier, timePeriod), not by
  // adjuster ID, so they are not automatically removed when an adjuster is
  // soft-deleted.  However, the same (name, carrier) pair can legitimately
  // appear in another org — aggregation is cross-tenant — so we must verify
  // that NO active adjuster anywhere still uses that pair before deleting.
  if (orphanedMetricKeys.length > 0) {
    console.log(`\nChecking ${orphanedMetricKeys.length} candidate (name, carrier) pair(s) for orphaned metrics…`);

    for (const { adjusterName, carrier } of orphanedMetricKeys) {
      // Check if any active (non-soft-deleted) adjuster across ALL orgs still
      // carries this (name, carrier) pair.
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
        console.log(`  Skipping name="${adjusterName}" carrier="${carrier}" — still referenced by active adjuster id=${stillActive[0].id}`);
        continue;
      }

      // Safe to delete: no active adjuster holds this (name, carrier) pair.
      const result = await db
        .delete(adjusterAggregatedMetrics)
        .where(
          and(
            eq(adjusterAggregatedMetrics.adjusterName, adjusterName),
            eq(adjusterAggregatedMetrics.carrier, carrier),
          ),
        )
        .returning({ id: adjusterAggregatedMetrics.id });

      console.log(`  Deleted ${result.length} truly-orphaned metric row(s) for name="${adjusterName}" carrier="${carrier}"`);
    }
  }

  // ── Phase 3: recompute current-period aggregated metrics ─────────────────
  // This rebuilds the canonical adjuster's row for the current month using
  // the full (post-merge) claim set.  Soft-deleted duplicates are excluded
  // from the source query inside computeAggregatedMetrics(), so their claims
  // are now attributed to the canonical and reflected correctly.
  if (mergedCount > 0) {
    const timePeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    console.log(`\nRecomputing aggregated metrics for time period "${timePeriod}"…`);
    const { computed } = await computeAggregatedMetrics(timePeriod);
    console.log(`  Recomputed ${computed} aggregated metric row(s).`);
  } else {
    console.log("\nNo merges performed — skipping metrics recompute.");
  }

  process.exit(0);
}

run().catch((e) => {
  console.error("Dedup script failed:", e);
  process.exit(1);
});
