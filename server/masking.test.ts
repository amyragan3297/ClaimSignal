/**
 * Masking model verification.
 * Run with:  npx tsx server/masking.test.ts
 *
 * Proves:
 *   1. Master (super_admin) receives fully unmasked data.
 *   2. Non-Master users receive masked shared claim data (homeowner PII).
 *   3. Contractor identity is stripped in shared views.
 *   4. Adjuster intelligence is preserved in shared views.
 */
import {
  MASTER_ROLE,
  isMaster,
  canViewUnmasked,
  applyPiiMasking,
  sanitizeSharedClaimRecord,
  sanitizeSharedClaimList,
} from "./masking";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.error(`  \u2717 FAIL: ${name}`);
  }
}

// A realistic cross-tenant claim record contributed to the shared library.
const sampleClaim = {
  id: "claim-1",
  organizationId: "org-roofing-firm-99",
  clientId: "client-77",
  adjusterId: "adj-42",
  claimNumber: "800816754",
  carrier: "State Farm",
  policyNumber: "PF9921",
  homeownerName: "John Smith",
  homeownerPhone: "555-123-4567",
  homeownerEmail: "john@example.com",
  insuredName: "John Smith",
  propertyAddress: "604 Milton Road, Athens, AL",
  address: "604 Milton Road",
  city: "Athens",
  state: "AL",
  zipCode: "35611",
  lossType: "wind",
  dateOfLoss: new Date("2026-01-15"),
  status: "open",
  currentPhase: "filed",
  notes: "Apex Roofing internal: homeowner referred by rep Dave Carter, push supplement hard.",
  aiClaimSummary: "Apex Roofing handling; rep Dave Carter; homeowner John Smith at 604 Milton Road.",
  // adjuster intelligence
  frictionScore: 72,
  adjusterFrictionScore: 68.5,
  escalationLevel: 2,
  riskScore: 81,
  scopeDeltaScore: 0.34,
  approvalProbability: 0.55,
  supplementProbabilityScore: 0.7,
  rcvAmount: 42000,
};

console.log("\n=== 0. Role mapping (Master === super_admin) ===");
check("MASTER_ROLE is 'super_admin'", MASTER_ROLE === "super_admin");
check("isMaster('super_admin') is true", isMaster("super_admin") === true);
check("isMaster('founder') is false", isMaster("founder") === false);
check("canViewUnmasked('super_admin') is true", canViewUnmasked("super_admin") === true);
check("canViewUnmasked('standard') is false", canViewUnmasked("standard") === false);

console.log("\n=== 1. Master receives UNMASKED data ===");
const masterRow = sanitizeSharedClaimRecord(sampleClaim, "super_admin");
check("homeownerName intact", masterRow.homeownerName === "John Smith");
check("claimNumber intact", masterRow.claimNumber === "800816754");
check("propertyAddress intact", masterRow.propertyAddress === "604 Milton Road, Athens, AL");
check("homeownerPhone intact", masterRow.homeownerPhone === "555-123-4567");
check("homeownerEmail intact", masterRow.homeownerEmail === "john@example.com");
check("organizationId intact", masterRow.organizationId === "org-roofing-firm-99");
check("notes intact", typeof masterRow.notes === "string" && masterRow.notes.includes("Apex Roofing"));
check("returns identical object reference (no copy)", masterRow === sampleClaim);

console.log("\n=== 2. Non-Master receives MASKED shared homeowner PII ===");
for (const role of ["founder", "standard", "team_owner", "admin", "carrier_analyst"]) {
  const r = sanitizeSharedClaimRecord(sampleClaim, role);
  check(`[${role}] homeownerName masked to initials`, r.homeownerName === "J. S.");
  check(`[${role}] insuredName masked to initials`, r.insuredName === "J. S.");
  check(`[${role}] claimNumber partially masked`, r.claimNumber === "8008*****");
  check(`[${role}] propertyAddress generalized to city/state`, r.propertyAddress === "Athens, AL");
  check(`[${role}] policyNumber masked`, r.policyNumber === "PF****");
  check(`[${role}] homeownerPhone removed`, r.homeownerPhone === null);
  check(`[${role}] homeownerEmail removed`, r.homeownerEmail === null);
  check(`[${role}] NO full homeowner name leaks`, !JSON.stringify(r).includes("John Smith"));
  check(`[${role}] NO full claim number leaks`, !JSON.stringify(r).includes("800816754"));
  check(`[${role}] NO full street address leaks`, !JSON.stringify(r).includes("604 Milton Road"));
  check(`[${role}] NO phone leaks`, !JSON.stringify(r).includes("555-123-4567"));
  check(`[${role}] NO email leaks`, !JSON.stringify(r).includes("john@example.com"));
}

console.log("\n=== 3. Contractor identity STRIPPED in shared views ===");
const contractorView = sanitizeSharedClaimRecord(sampleClaim, "founder");
check("organizationId (roofing firm) stripped", contractorView.organizationId === undefined);
check("clientId stripped", contractorView.clientId === undefined);
check("internal notes sanitized", contractorView.notes === null);
check("aiClaimSummary sanitized", contractorView.aiClaimSummary === null);
check("exact street address removed", contractorView.address === null);
check("zipCode removed", contractorView.zipCode === null);
check("NO contractor firm name (Apex Roofing) leaks", !JSON.stringify(contractorView).includes("Apex Roofing"));
check("NO contractor rep name (Dave Carter) leaks", !JSON.stringify(contractorView).includes("Dave Carter"));
check("NO org id leaks", !JSON.stringify(contractorView).includes("org-roofing-firm-99"));

console.log("\n=== 4. Adjuster intelligence PRESERVED in shared views ===");
check("carrier preserved", contractorView.carrier === "State Farm");
check("adjusterId preserved", contractorView.adjusterId === "adj-42");
check("lossType preserved", contractorView.lossType === "wind");
check("status preserved", contractorView.status === "open");
check("currentPhase preserved", contractorView.currentPhase === "filed");
check("city preserved (generalized location)", contractorView.city === "Athens");
check("state preserved (generalized location)", contractorView.state === "AL");
check("frictionScore preserved", contractorView.frictionScore === 72);
check("adjusterFrictionScore preserved", contractorView.adjusterFrictionScore === 68.5);
check("escalationLevel preserved", contractorView.escalationLevel === 2);
check("riskScore preserved", contractorView.riskScore === 81);
check("scopeDeltaScore preserved", contractorView.scopeDeltaScore === 0.34);
check("approvalProbability preserved", contractorView.approvalProbability === 0.55);
check("supplementProbabilityScore preserved", contractorView.supplementProbabilityScore === 0.7);

console.log("\n=== 5. List sanitizer applies per-record ===");
const list = sanitizeSharedClaimList([sampleClaim, sampleClaim], "standard");
check("list length preserved", list.length === 2);
check("every record masked", list.every((r) => r.homeownerName === "J. S."));
check("every record strips contractor identity", list.every((r) => r.notes === null && r.organizationId === undefined));

console.log(`\n================ RESULT: ${passed} passed, ${failed} failed ================\n`);
process.exit(failed === 0 ? 0 : 1);
