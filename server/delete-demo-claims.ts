import { db } from "./db";
import { eq } from "drizzle-orm";
import { claims, adjusters, claimAdjusters, evidenceFiles, timelineEvents, supplements, aiInsights, auditLogs } from "@shared/schema";
import { storage } from "./storage";

async function main() {
  const testUser = await storage.getUserByEmail("user@claimsignal.test");
  if (!testUser) {
    console.log("[delete-demo] user@claimsignal.test not found, nothing to delete");
    process.exit(0);
  }

  const orgId = testUser.organizationId;
  console.log(`[delete-demo] orgId = ${orgId}`);

  // Find all claims for this demo org
  const orgClaims = await db.select().from(claims).where(eq(claims.organizationId, orgId));
  console.log(`[delete-demo] found ${orgClaims.length} claims for demo org`);

  if (orgClaims.length === 0) {
    console.log("[delete-demo] no claims to delete");
    process.exit(0);
  }

  const claimIds = orgClaims.map((c) => c.id);

  for (const claimId of claimIds) {
    console.log(`[delete-demo] deleting claim ${claimId} ...`);

    // Delete child tables in order
    await db.delete(aiInsights).where(eq(aiInsights.claimId, claimId));
    await db.delete(timelineEvents).where(eq(timelineEvents.claimId, claimId));
    await db.delete(supplements).where(eq(supplements.claimId, claimId));
    await db.delete(evidenceFiles).where(eq(evidenceFiles.claimId, claimId));
    await db.delete(claimAdjusters).where(eq(claimAdjusters.claimId, claimId));

    // Delete the claim
    await db.delete(claims).where(eq(claims.id, claimId));
  }

  // Delete adjusters created by demo data (they are scoped to orgId)
  await db.delete(adjusters).where(eq(adjusters.organizationId, orgId));
  console.log(`[delete-demo] deleted adjusters for org`);

  // Delete audit logs related to these claims
  await db.delete(auditLogs).where(eq(auditLogs.organizationId, orgId));
  console.log(`[delete-demo] deleted audit logs for org`);

  console.log(`[delete-demo] done — removed ${claimIds.length} demo claims and all related data`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[delete-demo] failed:", err);
  process.exit(1);
});
