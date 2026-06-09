/**
 * Privacy Guard Verification Test
 * Run with: npx tsx server/privacy-guard-verification.test.ts
 *
 * Validates:
 *   - Protected entities (Jeremy Timko, Aerial AI Solutions, etc.) are BLOCKED from claim creation
 *   - Valid claims with all required fields (address, homeowner, carrier, date, lossType, evidence) are CREATED
 *   - Internal business contacts are protected
 */

import {
  evaluateClaimCreationGate,
  isProtectedEntity,
} from "./entity-privacy";

import { makeTestRunner } from "./evidence-test-helpers";

const { check, exit } = makeTestRunner();

// ── PROTECTED ENTITY BLOCKING ─────────────────────────────────────────────────────────
console.log("=== Privacy Guard: Protected Entity Blocking ===");

const protectedNames = [
  "Jeremy Timko",
  "Travis Peete",
  "Catherine",
  "Chris",
  "Jessica",
  "Rob",
  "Brad",
  "Kenzie",
  "Ashley",
];

for (const name of protectedNames) {
  check(
    `${name} is protected entity`,
    isProtectedEntity(name),
  );
  const gate = evaluateClaimCreationGate({
    propertyAddress: "123 Main St",
    homeownerName: name,
    lossType: "Wind/Hail",
    dateOfLoss: "2025-01-15",
    carrierName: "Acme Insurance",
    hasEvidence: true,
  });
  check(
    `${name} as homeowner: BLOCKED`,
    !gate.allowed,
  );
  check(
    `${name} block reason mentions 'Protected'`,
    gate.reason?.includes("Protected") ?? false,
  );
}

// Protected companies
const protectedCompanies = [
  "Aerial AI Solutions",
  "AAIS",
  "Pay It Forward Processing",
  "Revolution Roofing",
  "UAH",
  "I2C",
];

for (const company of protectedCompanies) {
  check(
    `${company} is protected entity`,
    isProtectedEntity(company),
  );
  const gate = evaluateClaimCreationGate({
    propertyAddress: "123 Main St",
    homeownerName: "John Smith",
    lossType: "Wind/Hail",
    dateOfLoss: "2025-01-15",
    carrierName: company,
    hasEvidence: true,
  });
  check(
    `${company} as carrier: BLOCKED (protected entity)`,
    !gate.allowed,
  );
}

// Internal business contacts
console.log("\n=== Internal Business Contacts Protection ===");
check(
  "Internal contact 'Jeremy Timko' is protected",
  isProtectedEntity("Jeremy Timko"),
);
check(
  "Internal contact 'Aerial AI Solutions' is protected",
  isProtectedEntity("Aerial AI Solutions"),
);
check(
  "External contact 'John Smith' is NOT protected",
  !isProtectedEntity("John Smith"),
);

// ── VALID CLAIM CREATION ──────────────────────────────────────────────────────────
console.log("\n=== Valid Claim: All Required Fields Present ===");

const validClaim = evaluateClaimCreationGate({
  propertyAddress: "742 Evergreen Terrace",
  homeownerName: "Homer Simpson",
  lossType: "Wind/Hail",
  dateOfLoss: "2025-01-15",
  carrierName: "State Farm",
  hasEvidence: true,
});

check(
  "Valid claim: ALLOWED",
  validClaim.allowed,
);
check(
  "Valid claim: no block reason",
  !validClaim.reason,
);

// ── MISSING FIELDS BLOCKING ─────────────────────────────────────────────────
console.log("\n=== Missing Required Fields: Claim Creation Blocked ===");

const missingFields = [
  { propertyAddress: "", label: "propertyAddress" },
  { homeownerName: "", label: "homeownerName" },
  { lossType: null, label: "lossType" },
  { dateOfLoss: null, label: "dateOfLoss" },
  { carrierName: null, label: "carrierName" },
  { hasEvidence: false, label: "hasEvidence" },
];

const baseValidClaim = {
  propertyAddress: "742 Evergreen Terrace",
  homeownerName: "Homer Simpson",
  lossType: "Wind/Hail",
  dateOfLoss: "2025-01-15",
  carrierName: "State Farm",
  hasEvidence: true,
};

for (const missing of missingFields) {
  const key = Object.keys(missing)[0];
  const testClaim = { ...baseValidClaim, [key]: missing[key as keyof typeof missing] };
  const gate = evaluateClaimCreationGate(testClaim);
  check(
    `Missing ${key}: BLOCKED`,
    !gate.allowed,
  );
  check(
    `Missing ${key}: reason mentions '${key === "hasEvidence" ? "evidence" : key}'`,
    gate.reason?.toLowerCase().includes(key === "hasEvidence" ? "evidence" : key.toLowerCase()) ?? false,
  );
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log("\n=== Verification Summary ===");
console.log("Protected entities: BLOCKED from claim creation");
console.log("Valid claims with all required fields: ALLOWED");
console.log("Missing required fields: BLOCKED with specific reason");

exit();
