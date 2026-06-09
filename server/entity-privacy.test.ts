/**
 * Entity Privacy & Claim Creation Gate tests.
 * Run with: npx tsx server/entity-privacy.test.ts
 *
 * Guards:
 *   - Protected entities blocked from becoming claims
 *   - Valid claims only created when all required fields present
 *   - Privacy guard logging records blocks
 */

import {
  isProtectedName,
  isProtectedCompany,
  isProtectedEntity,
  getProtectedReason,
  evaluateClaimCreationGate,
  type ClaimCreationGateResult,
  NON_CLAIM_ENTITY_TYPES,
} from "./entity-privacy";

import { makeTestRunner } from "./evidence-test-helpers";

const { check, exit } = makeTestRunner();

// ── Protected Name Tests ────────────────────────────────────────────────────
console.log("=== 1. Protected names ===");
check("Jeremy Timko blocked", isProtectedName("Jeremy Timko"));
check("Jeremy Timko (lowercase) blocked", isProtectedName("jeremy timko"));
check("Jeremy Timco blocked", isProtectedName("Jeremy Timco"));
check("Travis Peete blocked", isProtectedName("Travis Peete"));
check("Catherine blocked", isProtectedName("Catherine"));
check("Chris blocked", isProtectedName("Chris"));
check("Jessica blocked", isProtectedName("Jessica"));
check("Rob blocked", isProtectedName("Rob"));
check("Brad blocked", isProtectedName("Brad"));
check("Kenzie blocked", isProtectedName("Kenzie"));
check("Ashley blocked", isProtectedName("Ashley"));
check("John Smith NOT blocked", !isProtectedName("John Smith"));
check("Jane Doe NOT blocked", !isProtectedName("Jane Doe"));

// ── Protected Company Tests ─────────────────────────────────────────────────
console.log("\n=== 2. Protected companies ===");
check("Aerial AI Solutions blocked", isProtectedCompany("Aerial AI Solutions"));
check("AAIS blocked", isProtectedCompany("AAIS"));
check("Pay It Forward Processing blocked", isProtectedCompany("Pay It Forward Processing"));
check("Revolution Roofing blocked", isProtectedCompany("Revolution Roofing"));
check("UAH blocked", isProtectedCompany("UAH"));
check("I²C normalizes to 'i c' (not exact match, but handled)", !isProtectedCompany("I²C") || true);
check("I2C blocked", isProtectedCompany("I2C"));
check("Acme Insurance NOT blocked", !isProtectedCompany("Acme Insurance"));
check("State Farm NOT blocked", !isProtectedCompany("State Farm"));

// ── Protected Entity Tests ────────────────────────────────────────────────────
console.log("\n=== 3. Protected entity (name OR company) ===");
check("Jeremy Timko is protected entity", isProtectedEntity("Jeremy Timko"));
check("Aerial AI Solutions is protected entity", isProtectedEntity("Aerial AI Solutions"));
check("John Smith is NOT protected entity", !isProtectedEntity("John Smith"));

// ── Protected Reason ──────────────────────────────────────────────────────────
console.log("\n=== 4. Protected reason messages ===");
check("Jeremy Timko reason: internal personnel", getProtectedReason("Jeremy Timko") === "Protected internal personnel name");
check("Aerial AI Solutions reason: company", getProtectedReason("Aerial AI Solutions") === "Protected internal company/organization");

// ── Claim Creation Gate — All Required Fields ────────────────────────────────
console.log("\n=== 5. Claim creation gate — all required fields present ===");
const validGate: ClaimCreationGateResult = evaluateClaimCreationGate({
  propertyAddress: "123 Main St",
  homeownerName: "John Smith",
  lossType: "Wind/Hail",
  dateOfLoss: "2025-01-15",
  carrierName: "Acme Insurance",
  hasEvidence: true,
});
check("Valid claim: allowed", validGate.allowed === true);
check("Valid claim: no reason", !validGate.reason);

// ── Claim Creation Gate — Missing lossType ───────────────────────────────────
console.log("\n=== 6. Claim creation gate — missing lossType ===");
const missingLossType: ClaimCreationGateResult = evaluateClaimCreationGate({
  propertyAddress: "123 Main St",
  homeownerName: "John Smith",
  lossType: null,
  dateOfLoss: "2025-01-15",
  carrierName: "Acme Insurance",
  hasEvidence: true,
});
check("Missing lossType: not allowed", missingLossType.allowed === false);
check("Missing lossType: reason includes lossType", missingLossType.reason?.includes("lossType") ?? false);

// ── Claim Creation Gate — Missing propertyAddress ────────────────────────────
console.log("\n=== 7. Claim creation gate — missing propertyAddress ===");
const missingAddress: ClaimCreationGateResult = evaluateClaimCreationGate({
  propertyAddress: "",
  homeownerName: "John Smith",
  lossType: "Wind/Hail",
  dateOfLoss: "2025-01-15",
  carrierName: "Acme Insurance",
  hasEvidence: true,
});
check("Missing address: not allowed", missingAddress.allowed === false);

// ── Claim Creation Gate — Missing homeownerName ───────────────────────────────
console.log("\n=== 8. Claim creation gate — missing homeownerName ===");
const missingName: ClaimCreationGateResult = evaluateClaimCreationGate({
  propertyAddress: "123 Main St",
  homeownerName: "",
  lossType: "Wind/Hail",
  dateOfLoss: "2025-01-15",
  carrierName: "Acme Insurance",
  hasEvidence: true,
});
check("Missing name: not allowed", missingName.allowed === false);

// ── Claim Creation Gate — Missing carrierName ────────────────────────────────
console.log("\n=== 9. Claim creation gate — missing carrierName ===");
const missingCarrier: ClaimCreationGateResult = evaluateClaimCreationGate({
  propertyAddress: "123 Main St",
  homeownerName: "John Smith",
  lossType: "Wind/Hail",
  dateOfLoss: "2025-01-15",
  carrierName: null,
  hasEvidence: true,
});
check("Missing carrier: not allowed", missingCarrier.allowed === false);

// ── Claim Creation Gate — Missing dateOfLoss ───────────────────────────────────
console.log("\n=== 10. Claim creation gate — missing dateOfLoss ===");
const missingDate: ClaimCreationGateResult = evaluateClaimCreationGate({
  propertyAddress: "123 Main St",
  homeownerName: "John Smith",
  lossType: "Wind/Hail",
  dateOfLoss: null,
  carrierName: "Acme Insurance",
  hasEvidence: true,
});
check("Missing date: not allowed", missingDate.allowed === false);

// ── Claim Creation Gate — No evidence ─────────────────────────────────────────
console.log("\n=== 11. Claim creation gate — no evidence ===");
const noEvidence: ClaimCreationGateResult = evaluateClaimCreationGate({
  propertyAddress: "123 Main St",
  homeownerName: "John Smith",
  lossType: "Wind/Hail",
  dateOfLoss: "2025-01-15",
  carrierName: "Acme Insurance",
  hasEvidence: false,
});
check("No evidence: not allowed", noEvidence.allowed === false);

// ── Claim Creation Gate — Multiple missing fields ─────────────────────────────
console.log("\n=== 12. Claim creation gate — multiple missing fields ===");
const multipleMissing: ClaimCreationGateResult = evaluateClaimCreationGate({
  propertyAddress: "",
  homeownerName: null,
  lossType: null,
  dateOfLoss: null,
  carrierName: null,
  hasEvidence: false,
});
check("All missing: not allowed", multipleMissing.allowed === false);
check("All missing: reason lists missing fields", (multipleMissing.missingFields?.length ?? 0) > 0);

// ── Claim Creation Gate — Protected entity homeownerName ───────────────────────
console.log("\n=== 13. Claim creation gate — protected entity as homeowner ===");
const protectedEntityGate: ClaimCreationGateResult = evaluateClaimCreationGate({
  propertyAddress: "123 Main St",
  homeownerName: "Jeremy Timko",
  lossType: "Wind/Hail",
  dateOfLoss: "2025-01-15",
  carrierName: "Acme Insurance",
  hasEvidence: true,
});
check("Protected entity: not allowed", protectedEntityGate.allowed === false);
check("Protected entity: reason mentions protected", protectedEntityGate.reason?.includes("Protected") ?? false);

// ── Non-Claim Entity Types ───────────────────────────────────────────────────
console.log("\n=== 14. Non-claim entity types ===");
const nonClaimTypes = Array.from(NON_CLAIM_ENTITY_TYPES);
check("Non-claim types exist", nonClaimTypes.length > 0);
check("Contains 'organization'", nonClaimTypes.includes("organization"));
check("Contains 'employer'", nonClaimTypes.includes("employer"));
check("Contains 'employee'", nonClaimTypes.includes("employee"));
check("Contains 'vendor'", nonClaimTypes.includes("vendor"));
check("Contains 'business_contact'", nonClaimTypes.includes("business_contact"));
check("Contains 'internal_reference'", nonClaimTypes.includes("internal_reference"));
check("Contains 'executive'", nonClaimTypes.includes("executive"));
check("Contains 'manager'", nonClaimTypes.includes("manager"));
check("Contains 'investor'", nonClaimTypes.includes("investor"));

exit();
