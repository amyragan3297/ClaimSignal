/**
 * AI Claim Analysis Layer — Rules-based extraction engine
 * All output is labeled "demo_analysis". No LLM is connected.
 * Future: swap rule blocks for LLM calls once an API key is configured.
 */

export interface FieldValue {
  value: string;
  confidence: "high" | "medium" | "low";
  note?: string;
}

export interface ExtractedFinancials {
  rcv?: FieldValue;
  acv?: FieldValue;
  netClaim?: FieldValue;
  deductible?: FieldValue;
  recoverableDepreciation?: FieldValue;
  nonRecoverableDepreciation?: FieldValue;
  priorPayment?: FieldValue;
  supplementAmount?: FieldValue;
  opAmount?: FieldValue;
  tax?: FieldValue;
  permitFee?: FieldValue;
  totalEstimate?: FieldValue;
  balanceOwed?: FieldValue;
  paymentIssued?: FieldValue;
  paymentPending?: FieldValue;
  estimateTotal?: FieldValue;
  supplementTotal?: FieldValue;
}

export interface CodeItem {
  reference: string;
  description: string;
  supportsSupplementReview: boolean;
  status: "detected" | "missing" | "approved" | "denied";
  relatedLineItem?: string;
}

export interface DenialAnalysis {
  isDenialLetter: boolean;
  coverageDecision?: string;
  denialReason?: string;
  policyCited?: string;
  exclusionsCited?: string;
  causeOfLoss?: string;
  hailAccepted?: boolean | null;
  windAccepted?: boolean | null;
  roofDamageAccepted?: boolean | null;
  interiorDamageAccepted?: boolean | null;
  collateralDamageMentioned: boolean;
  thirdPartyInspectionMentioned: boolean;
  reinspectionOffered: boolean;
  appealRightsMentioned: boolean;
  deadlinesMentioned: boolean;
  missingDocumentsRequested?: string;
  recommendedResponse?: string;
}

export interface RiskSignal {
  type: string;
  label: string;
  severity: "high" | "medium" | "low";
  description: string;
}

export interface RecommendedAction {
  action: string;
  priority: "urgent" | "high" | "medium" | "low";
  reason: string;
}

export interface ScopeField {
  field: string;
  detected: boolean;
  value?: string;
  note?: string;
}

export interface ClaimAnalysisResult {
  sourceType: "demo_analysis";
  analysisVersion: "1.0";
  docCategory: string;
  overallConfidence: number;
  financials: ExtractedFinancials;
  scopeFields: ScopeField[];
  codeItems: CodeItem[];
  denialAnalysis: DenialAnalysis;
  riskSignals: RiskSignal[];
  recommendedActions: RecommendedAction[];
  extractedAt: string;
}

// ── Money pattern helpers ───────────────────────────────────────────────────

function extractMoney(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[1].replace(/,/g, "");
  }
  return null;
}

function conf(v: string | null, level: "high" | "medium" | "low"): FieldValue | undefined {
  if (!v) return undefined;
  return { value: v, confidence: level };
}

// ── Financial extraction ────────────────────────────────────────────────────

function extractFinancials(lower: string): ExtractedFinancials {
  const money = (patterns: RegExp[], c: "high" | "medium" | "low") =>
    conf(extractMoney(lower, patterns), c);

  return {
    rcv: money([/\brcv\b[\s:]*\$?([\d,]+\.?\d*)/i, /replacement\s+cost\s+value[\s:]*\$?([\d,]+\.?\d*)/i], "high"),
    acv: money([/\bacv\b[\s:]*\$?([\d,]+\.?\d*)/i, /actual\s+cash\s+value[\s:]*\$?([\d,]+\.?\d*)/i], "high"),
    netClaim: money([/net\s+claim[\s:]*\$?([\d,]+\.?\d*)/i, /net\s+payment[\s:]*\$?([\d,]+\.?\d*)/i], "high"),
    deductible: money([/deductible[\s:]*\$?([\d,]+\.?\d*)/i], "high"),
    recoverableDepreciation: money([/recoverable\s+depreciation[\s:]*\$?([\d,]+\.?\d*)/i, /\brdep\b[\s:]*\$?([\d,]+\.?\d*)/i], "medium"),
    nonRecoverableDepreciation: money([/non[\-\s]recoverable\s+depreciation[\s:]*\$?([\d,]+\.?\d*)/i], "medium"),
    priorPayment: money([/prior\s+payment[\s:]*\$?([\d,]+\.?\d*)/i, /previous\s+payment[\s:]*\$?([\d,]+\.?\d*)/i], "medium"),
    supplementAmount: money([/supplement[\s:]*\$?([\d,]+\.?\d*)/i, /supplemental\s+amount[\s:]*\$?([\d,]+\.?\d*)/i], "medium"),
    opAmount: money([/o&p[\s:]*\$?([\d,]+\.?\d*)/i, /overhead\s+&\s+profit[\s:]*\$?([\d,]+\.?\d*)/i, /overhead\s+and\s+profit[\s:]*\$?([\d,]+\.?\d*)/i], "medium"),
    tax: money([/\btax\b[\s:]*\$?([\d,]+\.?\d*)/i, /sales\s+tax[\s:]*\$?([\d,]+\.?\d*)/i], "medium"),
    permitFee: money([/permit[\s:]*\$?([\d,]+\.?\d*)/i, /permit\s+fee[\s:]*\$?([\d,]+\.?\d*)/i], "medium"),
    totalEstimate: money([/total\s+estimate[\s:]*\$?([\d,]+\.?\d*)/i, /estimate\s+total[\s:]*\$?([\d,]+\.?\d*)/i], "high"),
    balanceOwed: money([/balance\s+owed[\s:]*\$?([\d,]+\.?\d*)/i, /amount\s+owed[\s:]*\$?([\d,]+\.?\d*)/i], "medium"),
    paymentIssued: money([/payment\s+issued[\s:]*\$?([\d,]+\.?\d*)/i, /check\s+issued[\s:]*\$?([\d,]+\.?\d*)/i, /amount\s+paid[\s:]*\$?([\d,]+\.?\d*)/i], "medium"),
    paymentPending: money([/payment\s+pending[\s:]*\$?([\d,]+\.?\d*)/i, /pending\s+payment[\s:]*\$?([\d,]+\.?\d*)/i], "low"),
    estimateTotal: money([/total[\s:]*\$?([\d,]+\.?\d*)[\s\n]/i], "low"),
    supplementTotal: money([/supplement\s+total[\s:]*\$?([\d,]+\.?\d*)/i, /total\s+supplement[\s:]*\$?([\d,]+\.?\d*)/i], "medium"),
  };
}

// ── Scope fields ────────────────────────────────────────────────────────────

function extractScopeFields(lower: string): ScopeField[] {
  const check = (field: string, patterns: RegExp[]): ScopeField => {
    const detected = patterns.some(p => p.test(lower));
    const valueMatch = patterns.map(p => p.exec(lower)).find(Boolean);
    return { field, detected, value: valueMatch?.[1]?.trim() };
  };

  return [
    check("Roofing Squares", [/(\d+\.?\d*)\s*sqs?/i, /(\d+\.?\d*)\s+square/i]),
    check("Ridge Length", [/ridge\s+(?:length|cap)?[\s:]*(\d+\.?\d*)\s*(?:lf|ft|')?/i]),
    check("Starter Length", [/starter\s+(?:strip|length)?[\s:]*(\d+\.?\d*)\s*(?:lf|ft|')?/i]),
    check("Drip Edge Length", [/drip\s+edge[\s:]*(\d+\.?\d*)\s*(?:lf|ft|')?/i]),
    check("Valley Length", [/valley[\s:]*(\d+\.?\d*)\s*(?:lf|ft|')?/i]),
    check("Ice & Water Shield", [/ice\s+(?:and|&)\s+water/i, /ice\s+barrier/i]),
    check("Felt / Underlayment", [/(?:felt|synthetic\s+underlayment|underlayment)/i]),
    check("Ridge Vent", [/ridge\s+vent/i]),
    check("Pipe Jacks", [/pipe\s+jack/i, /pipe\s+flashing/i]),
    check("Hip & Ridge Cap", [/hip\s+(?:and|&)\s+ridge/i, /hip\s+cap/i]),
    check("Step Flashing", [/step\s+flashing/i]),
    check("Counter Flashing", [/counter\s+flashing/i]),
    check("Gutters", [/(?:gutter|gutters)\s*[\s:]*(\d+\.?\d*)\s*(?:lf|ft|')?/i]),
    check("Downspouts", [/downspout/i]),
    check("Interior Damage", [/interior\s+damage/i, /ceiling\s+damage/i, /water\s+intrusion/i]),
    check("Detached Structure", [/detached\s+(?:garage|structure)/i]),
    check("Fence Damage", [/fence\s+damage/i, /privacy\s+fence/i]),
    check("Tear Off / Removal", [/tear[\s-]off/i, /remove\s+and\s+replace/i, /removal\s+of/i]),
    check("O&P Included", [/o\s*&\s*p/i, /overhead\s+(?:and|&)\s+profit/i]),
    check("Permit Line Item", [/\bpermit\b/i]),
  ];
}

// ── IRC / Code items ────────────────────────────────────────────────────────

function extractCodeItems(lower: string): CodeItem[] {
  const items: CodeItem[] = [];

  const codePatterns: Array<{ ref: string; desc: string; keywords: RegExp[]; supplement: boolean }> = [
    { ref: "IRC R905.2.8.5", desc: "Drip edge required at eaves and rakes", keywords: [/drip\s+edge/i, /r905\.2\.8\.5/i], supplement: true },
    { ref: "IRC R905.2.8.2", desc: "Starter strip / course required", keywords: [/starter\s+strip/i, /starter\s+course/i, /r905\.2\.8\.2/i], supplement: true },
    { ref: "IRC R905.2.2", desc: "Slope requirements for shingles", keywords: [/slope\s+requirement/i, /r905\.2\.2/i], supplement: false },
    { ref: "IRC R905.2.7", desc: "Underlayment required", keywords: [/underlayment/i, /felt\s+paper/i, /r905\.2\.7/i], supplement: true },
    { ref: "IRC R905.1.2 / R905.2.7.1", desc: "Ice and water shield barrier", keywords: [/ice\s+(?:and|&)\s+water/i, /ice\s+barrier/i], supplement: true },
    { ref: "IRC R907.5", desc: "Reinstallation of roofing materials", keywords: [/r907\.5/i, /reinstall/i], supplement: true },
    { ref: "Ventilation (IRC R806)", desc: "Attic ventilation requirements", keywords: [/ridge\s+vent/i, /attic\s+vent/i, /r806/i], supplement: true },
    { ref: "Valley Protection", desc: "Valley lining or flashing required", keywords: [/valley\s+(?:flash|metal|protection)/i], supplement: true },
    { ref: "Step Flashing", desc: "Step flashing at vertical intersections", keywords: [/step\s+flashing/i], supplement: true },
    { ref: "Ordinance or Law", desc: "Code upgrade / ordinance language detected", keywords: [/ordinance\s+or\s+law/i, /code\s+upgrade/i, /ordinance\s+coverage/i], supplement: true },
    { ref: "Permit Requirement", desc: "Building permit referenced", keywords: [/\bpermit\b/i, /building\s+permit/i], supplement: true },
    { ref: "Manufacturer Requirement", desc: "Manufacturer installation requirements", keywords: [/manufacturer\s+(?:req|spec|warrant)/i, /gaf\s+req/i, /owens\s+corning\s+req/i], supplement: true },
    { ref: "IRC R905.2.6", desc: "Flashing requirements", keywords: [/\bflashing\b/i, /r905\.2\.6/i], supplement: true },
    { ref: "Counter Flashing", desc: "Counter flashing at walls / chimneys", keywords: [/counter\s+flashing/i, /chimney\s+flashing/i], supplement: true },
  ];

  for (const p of codePatterns) {
    const detected = p.keywords.some(kw => kw.test(lower));
    if (detected) {
      const cited = lower.includes("denied") || lower.includes("not included") || lower.includes("excluded");
      items.push({
        reference: p.ref,
        description: p.desc,
        supportsSupplementReview: p.supplement,
        status: cited ? "denied" : "detected",
      });
    }
  }

  return items;
}

// ── Denial analysis ─────────────────────────────────────────────────────────

function extractDenialAnalysis(lower: string, docCategory: string): DenialAnalysis {
  const isDenial = docCategory === "denial_letter" ||
    lower.includes("we regret to inform") ||
    lower.includes("coverage does not apply") ||
    lower.includes("not covered under") ||
    lower.includes("denial") ||
    lower.includes("no coverage");

  if (!isDenial) {
    return {
      isDenialLetter: false,
      collateralDamageMentioned: lower.includes("collateral damage"),
      thirdPartyInspectionMentioned: /eagle\s*view|ladder\s*assist|third[\s-]party\s+inspection|independent\s+inspection/i.test(lower),
      reinspectionOffered: lower.includes("reinspection") || lower.includes("re-inspection"),
      appealRightsMentioned: lower.includes("appeal") || lower.includes("review rights"),
      deadlinesMentioned: /within\s+\d+\s+days?|deadline|time\s+limit/i.test(lower),
    };
  }

  const hailDenied = /hail.*(?:not covered|denied|excluded|no coverage)/i.test(lower) || /(?:no evidence of|did not find|no hail)\s+hail/i.test(lower);
  const hailAccepted = /hail.*(?:accepted|approved|covered|confirmed)/i.test(lower);
  const windDenied = /wind.*(?:not covered|denied|excluded)/i.test(lower);
  const windAccepted = /wind.*(?:accepted|approved|covered)/i.test(lower);
  const roofDenied = /roof.*(?:not covered|denied|excluded|pre-existing|wear and tear)/i.test(lower);
  const roofAccepted = /roof.*(?:approved|accepted|covered)/i.test(lower);

  let reason = "";
  if (lower.includes("wear and tear")) reason = "Wear and tear exclusion cited";
  else if (lower.includes("pre-existing")) reason = "Pre-existing condition cited";
  else if (lower.includes("maintenance")) reason = "Maintenance exclusion cited";
  else if (lower.includes("flood")) reason = "Flood / water exclusion cited";
  else if (/no\s+evidence\s+of\s+(?:storm|hail|wind)/i.test(lower)) reason = "No evidence of storm damage";
  else reason = "Coverage exclusion — review policy language";

  let response = "Request full claim file, inspection report, and any third-party reports.";
  if (lower.includes("reinspection")) response += " Request reinspection and submit weather verification.";
  if (lower.includes("appeal")) response += " Review appeal rights and deadlines immediately.";

  return {
    isDenialLetter: true,
    coverageDecision: "Denied",
    denialReason: reason,
    policyCited: /policy\s+section\s+[\w\.]+/i.exec(lower)?.[0],
    exclusionsCited: /exclusion[\s:]+([^\n.]+)/i.exec(lower)?.[1]?.trim(),
    causeOfLoss: /cause\s+of\s+loss[\s:]+([^\n.]+)/i.exec(lower)?.[1]?.trim(),
    hailAccepted: hailDenied ? false : hailAccepted ? true : null,
    windAccepted: windDenied ? false : windAccepted ? true : null,
    roofDamageAccepted: roofDenied ? false : roofAccepted ? true : null,
    interiorDamageAccepted: /interior.*(?:accepted|approved)/i.test(lower) ? true : /interior.*(?:denied|excluded)/i.test(lower) ? false : null,
    collateralDamageMentioned: lower.includes("collateral damage"),
    thirdPartyInspectionMentioned: /eagle\s*view|ladder\s*assist|third[\s-]party\s+inspection|independent\s+inspection/i.test(lower),
    reinspectionOffered: lower.includes("reinspection") || lower.includes("re-inspection"),
    appealRightsMentioned: lower.includes("appeal") || lower.includes("review rights"),
    deadlinesMentioned: /within\s+\d+\s+days?|deadline|time\s+limit/i.test(lower),
    missingDocumentsRequested: /(?:please\s+provide|missing|we\s+need)\s+([^\n.]{10,60})/i.exec(lower)?.[1]?.trim(),
    recommendedResponse: response,
  };
}

// ── Risk signals ────────────────────────────────────────────────────────────

function generateRiskSignals(
  fin: ExtractedFinancials,
  scope: ScopeField[],
  denial: DenialAnalysis,
  docCategory: string
): RiskSignal[] {
  const signals: RiskSignal[] = [];

  const rcvNum = fin.rcv ? parseFloat(fin.rcv.value) : null;
  const acvNum = fin.acv ? parseFloat(fin.acv.value) : null;
  const ded = fin.deductible ? parseFloat(fin.deductible.value) : null;

  if (rcvNum && acvNum && rcvNum > 0) {
    const ratio = acvNum / rcvNum;
    if (ratio < 0.6) signals.push({ type: "low_acv_vs_rcv", label: "Low ACV vs RCV", severity: "high", description: `ACV is ${Math.round(ratio * 100)}% of RCV — significant depreciation applied. Review recoverability.` });
  }

  if (ded && rcvNum && ded / rcvNum > 0.3) {
    signals.push({ type: "high_deductible_impact", label: "High Deductible Impact", severity: "medium", description: `Deductible ($${ded.toLocaleString()}) is more than 30% of RCV — may affect net payout significantly.` });
  }

  const hasOP = scope.find(s => s.field === "O&P Included" && s.detected);
  if (!hasOP && (docCategory === "estimate" || docCategory === "supplement")) {
    signals.push({ type: "op_omitted", label: "O&P Omitted", severity: "high", description: "Overhead & Profit not detected in document. May need to be added if general contractor is involved." });
  }

  if (fin.recoverableDepreciation && !fin.paymentIssued) {
    signals.push({ type: "recoverable_depreciation_pending", label: "Recoverable Depreciation Pending", severity: "medium", description: "Recoverable depreciation detected but no payment issued line found. Track completion deadline." });
  }

  const missingCodeItems = ["Drip Edge Length", "Starter Length", "Ice & Water Shield", "Ridge Vent", "Tear Off / Removal", "Permit Line Item"];
  for (const item of missingCodeItems) {
    const field = scope.find(s => s.field === item);
    if (!field?.detected) {
      signals.push({ type: `missing_${item.toLowerCase().replace(/[^a-z]+/g, "_")}`, label: `Missing: ${item}`, severity: "medium", description: `${item} not detected in document. May be a missing scope item eligible for supplement.` });
    }
  }

  if (denial.isDenialLetter) {
    signals.push({ type: "denial_received", label: "Denial Letter Detected", severity: "high", description: "Document classified as denial letter. Immediate review and response strategy required." });
    if (denial.collateralDamageMentioned && denial.hailAccepted === false) {
      signals.push({ type: "denial_despite_collateral", label: "Denial Despite Collateral Damage", severity: "high", description: "Collateral damage is mentioned but hail coverage appears denied — strong basis for reinspection request." });
    }
    if (denial.thirdPartyInspectionMentioned) {
      signals.push({ type: "third_party_inspection_limitation", label: "Third-Party Inspection Limitation", severity: "medium", description: "Third-party or ladder-assist inspection referenced. Verify scope was not limited by inspection access." });
    }
    if (denial.reinspectionOffered) {
      signals.push({ type: "reinspection_recommended", label: "Reinspection Offered", severity: "low", description: "Reinspection is offered or mentioned. Request it with supplemental weather and photo documentation." });
    }
  }

  const tearOff = scope.find(s => s.field === "Tear Off / Removal");
  if (!tearOff?.detected && docCategory === "estimate") {
    signals.push({ type: "missing_tear_off", label: "Missing Tear-Off Line", severity: "medium", description: "Tear-off / removal not detected in estimate. Verify it is included or file as missing scope." });
  }

  return signals;
}

// ── Recommended actions ─────────────────────────────────────────────────────

function generateRecommendedActions(
  signals: RiskSignal[],
  denial: DenialAnalysis,
  fin: ExtractedFinancials,
  docCategory: string
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  const types = new Set(signals.map(s => s.type));

  if (denial.isDenialLetter) {
    actions.push({ action: "Request Full Claim File", priority: "urgent", reason: "Denial received — full file needed to identify basis and respond." });
    actions.push({ action: "Request Inspection Report", priority: "urgent", reason: "Obtain all inspection documents used to support the denial decision." });
    if (denial.appealRightsMentioned) actions.push({ action: "Review Appeal Rights & Deadlines", priority: "urgent", reason: "Appeal rights mentioned in document — deadlines may apply immediately." });
    if (denial.reinspectionOffered) actions.push({ action: "Request Reinspection", priority: "high", reason: "Reinspection is available — file with supplemental weather and photo evidence." });
    actions.push({ action: "Submit Weather Support (NOAA/SPC)", priority: "high", reason: "Attach verifiable storm records for the date of loss and property location." });
    actions.push({ action: "Submit Photo Packet", priority: "high", reason: "Photo documentation supports overturning denial based on visible damage." });
  }

  if (types.has("op_omitted")) actions.push({ action: "Submit O&P Supplement", priority: "high", reason: "Overhead & Profit not in document — review if general contractor coordination is required." });
  if (types.has("recoverable_depreciation_pending")) actions.push({ action: "Track Recoverable Depreciation Deadline", priority: "high", reason: "Recoverable depreciation may expire — confirm completion and file claim before deadline." });
  if (types.has("missing_drip_edge_length")) actions.push({ action: "Submit Code Support — Drip Edge (IRC R905.2.8.5)", priority: "medium", reason: "Drip edge not detected. Required by IRC — include in supplement with code citation." });
  if (types.has("missing_starter_length")) actions.push({ action: "Submit Code Support — Starter Strip (IRC R905.2.8.2)", priority: "medium", reason: "Starter strip not detected. Required by IRC." });
  if (types.has("missing_ice___water_shield")) actions.push({ action: "Submit Code Support — Ice & Water Shield", priority: "medium", reason: "Ice & water barrier not detected. Required by IRC in applicable regions." });
  if (types.has("missing_ridge_vent")) actions.push({ action: "Submit Code Support — Ridge Vent (IRC R806)", priority: "medium", reason: "Ridge ventilation not detected. Code-required ventilation may be a supplement item." });
  if (types.has("missing_tear_off")) actions.push({ action: "Submit Supplement — Tear-Off / Removal", priority: "medium", reason: "Tear-off not found in estimate. If full replacement was performed, file as missing scope." });
  if (types.has("missing_permit_line_item")) actions.push({ action: "Submit Permit Fee Request", priority: "low", reason: "Permit not detected in estimate. Code-required permit fees are a recoverable cost." });

  if (docCategory === "estimate" || docCategory === "supplement") {
    if (!fin.rcv) actions.push({ action: "Verify RCV in Estimate", priority: "medium", reason: "RCV not extracted from document — confirm it is present and correctly stated." });
  }

  actions.push({ action: "Submit Signed Contract", priority: "low", reason: "Ensure signed contract is on file to support payment processing and supplement review." });

  return actions.slice(0, 10);
}

// ── Main export ─────────────────────────────────────────────────────────────

export function runClaimAnalysis(text: string, docCategory: string, overallConfidence: number): ClaimAnalysisResult {
  const lower = text.toLowerCase();

  const financials = extractFinancials(lower);
  const scopeFields = extractScopeFields(lower);
  const codeItems = extractCodeItems(lower);
  const denialAnalysis = extractDenialAnalysis(lower, docCategory);
  const riskSignals = generateRiskSignals(financials, scopeFields, denialAnalysis, docCategory);
  const recommendedActions = generateRecommendedActions(riskSignals, denialAnalysis, financials, docCategory);

  return {
    sourceType: "demo_analysis",
    analysisVersion: "1.0",
    docCategory,
    overallConfidence,
    financials,
    scopeFields,
    codeItems,
    denialAnalysis,
    riskSignals,
    recommendedActions,
    extractedAt: new Date().toISOString(),
  };
}
