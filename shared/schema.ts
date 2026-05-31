import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, pgEnum, json, real, date, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "team_owner", "founder", "standard", "carrier_analyst"]);
export const userStatusEnum = pgEnum("user_status", ["active", "archived", "test"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trialing", "active", "past_due", "canceled"]);
export const planTypeEnum = pgEnum("plan_type", ["founder", "pro", "team", "enterprise", "individual"]);
export const organizationTypeEnum = pgEnum("organization_type", ["contractor", "roofing_firm", "enterprise_operator", "carrier", "tpa"]);
export const eventSourceTypeEnum = pgEnum("event_source_type", ["document", "transcript", "email", "manual", "system"]);
export const eventCategoryEnum = pgEnum("event_category", ["denial", "payment", "supplement", "irc_trigger", "communication_signal", "lifecycle", "escalation"]);

export const claimPhaseEnum = pgEnum("claim_phase", [
  "pre_claim", "filed", "inspected", "initial_determination",
  "supplement_submitted", "reinspection_requested", "escalated", "resolved", "closed"
]);

export const sourceTypeEnum = pgEnum("source_type", ["upload", "email_import", "portal_download"]);
export const fileTypeEnum = pgEnum("file_type_enum", ["pdf", "image", "docx", "eml", "msg", "txt", "other"]);
export const docCategoryEnum = pgEnum("doc_category", [
  "denial_letter", "estimate", "scope", "payment_letter", "supplement",
  "invoice", "photo_report", "policy", "email_thread", "unknown"
]);
export const extractionStatusEnum = pgEnum("extraction_status", ["pending", "processing", "complete", "failed"]);
export const entityTypeEnum = pgEnum("entity_type", [
  "claim_number", "policy_number", "adjuster_name", "adjuster_email", "adjuster_phone",
  "insured_name", "property_address", "date_of_loss", "inspection_date", "determination_date",
  "payment_date", "rcv", "acv", "deductible", "depreciation", "supplement_amount",
  "check_amount", "coverage_type"
]);
export const claimDraftStatusEnum = pgEnum("claim_draft_status", ["needs_review", "merged", "discarded"]);

// ── Multi-adjuster / cross-claim linkage (additive, Item 7) ──
export const claimAdjusterRoleEnum = pgEnum("claim_adjuster_role", [
  "primary_adjuster", "field_adjuster", "desk_adjuster", "catastrophe_adjuster",
  "supervisor", "team_lead", "reinspection_adjuster", "supplement_adjuster",
  "appraisal_contact", "carrier_representative", "unknown",
]);
export const claimAdjusterInvolvementEnum = pgEnum("claim_adjuster_involvement", [
  "assigned", "inspected", "denied", "approved", "partially_approved",
  "requested_documents", "handled_supplement", "handled_reinspection",
  "escalated_review", "issued_payment", "communicated", "mentioned_only", "unknown",
]);
export const claimAdjusterSourceEnum = pgEnum("claim_adjuster_source", [
  "legacy_backfill", "manual", "document", "audio", "transcript", "communication", "system", "unknown",
]);

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  organizationType: organizationTypeEnum("organization_type").default("contractor"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("founder"),
  status: userStatusEnum("status").notNull().default("active"),
  founderFlag: boolean("founder_flag").default(false),
  isPlatformOwner: boolean("is_platform_owner").default(false),
  fullName: text("full_name").notNull(),
  founderLockedRate: boolean("founder_locked_rate").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  emailVerifiedAt: timestamp("email_verified_at"),
});

export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceLabel: text("device_label"),
  isImpersonation: boolean("is_impersonation").default(false),
  impersonatorUserId: varchar("impersonator_user_id"),
});

export const billingAccounts = pgTable("billing_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("trialing"),
  trialStartDate: timestamp("trial_start_date"),
  trialEndDate: timestamp("trial_end_date"),
  planType: planTypeEnum("plan_type").notNull().default("founder"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  streetAddress: text("street_address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  createdAt: timestamp("created_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
});

export const claims = pgTable("claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  clientId: varchar("client_id"),
  adjusterId: varchar("adjuster_id"),
  claimNumber: text("claim_number").notNull(),
  carrier: text("carrier"),
  policyNumber: text("policy_number"),
  homeownerName: text("homeowner_name"),
  homeownerPhone: text("homeowner_phone"),
  homeownerEmail: text("homeowner_email"),
  insuredName: text("insured_name"),
  propertyAddress: text("property_address"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  lossType: text("loss_type"),
  roofType: text("roof_type"),
  shingleType: text("shingle_type"),
  notes: text("notes"),
  status: text("status").notNull().default("open"),

  currentPhase: claimPhaseEnum("current_phase").default("pre_claim"),
  dateOfLoss: timestamp("date_of_loss"),
  inspectionDate: timestamp("inspection_date"),
  determinationDate: timestamp("determination_date"),
  reinspectionDate: timestamp("reinspection_date"),
  resolutionDate: timestamp("resolution_date"),

  rcvAmount: real("rcv_amount"),
  acvAmount: real("acv_amount"),
  deductible: real("deductible"),
  supplementAmountTotal: real("supplement_amount_total"),
  finalPaidAmount: real("final_paid_amount"),
  claimAmount: real("claim_amount"),
  approvedAmount: real("approved_amount"),
  rcvTotal: real("rcv_total"),
  acvTotal: real("acv_total"),

  lifecycleVelocityScore: real("lifecycle_velocity_score"),
  scopeDeltaScore: real("scope_delta_score"),
  escalationLevel: integer("escalation_level").default(0),
  outcomeMigrationDelta: real("outcome_migration_delta"),
  frictionScore: integer("friction_score"),
  approvalProbability: real("approval_probability"),
  escalationCategory: text("escalation_category"),
  riskScore: integer("risk_score"),
  lossDate: timestamp("loss_date"),
  aiClaimSummary: text("ai_claim_summary"),
  aiAnalysisJson: json("ai_analysis_json"),
  aiAnalysisAt: timestamp("ai_analysis_at"),
  adjusterFrictionScore: real("adjuster_friction_score"),
  supplementProbabilityScore: real("supplement_probability_score"),
  ircComplianceRiskScore: real("irc_compliance_risk_score"),

  // ── Expanded intake (additive) ──
  claimType: text("claim_type"),
  propertyType: text("property_type"),
  iaFirm: text("ia_firm"),

  // Vendor capture — claim-relevant vendor intelligence (NOT contractor identity)
  vendorName: text("vendor_name"),
  vendorType: text("vendor_type"),
  vendorRole: text("vendor_role"),
  inspectionVendor: text("inspection_vendor"),
  ladderAssistVendor: text("ladder_assist_vendor"),
  engineeringFirm: text("engineering_firm"),
  itelVendor: text("itel_vendor"),
  photoInspectionVendor: text("photo_inspection_vendor"),
  vendorFinding: text("vendor_finding"),
  vendorImpact: text("vendor_impact"),
  vendorNotes: text("vendor_notes"),

  // Financial (additive)
  recoverableDepreciation: real("recoverable_depreciation"),
  nonRecoverableDepreciation: real("non_recoverable_depreciation"),
  priorPayments: real("prior_payments"),
  supplementRequested: real("supplement_requested"),
  supplementApproved: real("supplement_approved"),
  outstandingAmount: real("outstanding_amount"),
  finalApprovedAmount: real("final_approved_amount"),

  // Outcome / intelligence (additive)
  initialOutcome: text("initial_outcome"),
  finalOutcome: text("final_outcome"),
  denialReason: text("denial_reason"),
  denialOverturned: boolean("denial_overturned").default(false),
  supplementOutcome: text("supplement_outcome"),
  escalationUsed: boolean("escalation_used").default(false),
  reinspectionRequested: boolean("reinspection_requested").default(false),
  reinspectionOutcome: text("reinspection_outcome"),
  paymentReceived: boolean("payment_received").default(false),
  whatWorked: text("what_worked"),
  whatDidNotWork: text("what_did_not_work"),
  playbookNote: text("playbook_note"),
  actionNote: text("action_note"),

  // Documentation status flags (additive)
  photosUploaded: boolean("photos_uploaded").default(false),
  denialLetterUploaded: boolean("denial_letter_uploaded").default(false),
  estimateUploaded: boolean("estimate_uploaded").default(false),
  supplementUploaded: boolean("supplement_uploaded").default(false),
  codeDocUploaded: boolean("code_doc_uploaded").default(false),
  manufacturerDocUploaded: boolean("manufacturer_doc_uploaded").default(false),
  audioUploaded: boolean("audio_uploaded").default(false),
  transcriptStatus: text("transcript_status"),
  stormReportStatus: text("storm_report_status"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
});

export const supplementStatusEnum = pgEnum("supplement_status", ["pending", "approved", "denied", "partial"]);

export const supplements = pgTable("supplements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  amountRequested: real("amount_requested"),
  amountApproved: real("amount_approved"),
  amountDenied: real("amount_denied"),
  dateSubmitted: timestamp("date_submitted"),
  dateResolved: timestamp("date_resolved"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  fileUrl: text("file_url"),
  uploadedBy: varchar("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
});

export const emails = pgTable("emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  direction: text("direction").notNull().default("incoming"),
  subject: text("subject"),
  body: text("body"),
  createdAt: timestamp("created_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
});

export const aiInsights = pgTable("ai_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  insightType: text("insight_type").notNull(),
  confidenceScore: real("confidence_score"),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const claimVersions = pgTable("claim_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  changedByUserId: varchar("changed_by_user_id").notNull(),
  changedAt: timestamp("changed_at").defaultNow(),
  changeReason: text("change_reason"),
  snapshotJson: json("snapshot_json"),
});

export const adjusters = pgTable("adjusters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  carrierName: text("carrier_name").notNull(),
  adjusterName: text("adjuster_name").notNull(),
  adjusterEmail: text("adjuster_email"),
  adjusterPhone: text("adjuster_phone"),
  region: text("region"),
  ladderAssistVendor: text("ladder_assist_vendor"),
  isFieldAdjuster: boolean("is_field_adjuster").default(false),
  isDeskAdjuster: boolean("is_desk_adjuster").default(false),
  avgResponseTimeHours: real("avg_response_time_hours").default(0),
  avgDaysToInitialDetermination: real("avg_days_to_initial_determination").default(0),
  supplementAcceptanceRate: real("supplement_acceptance_rate").default(0),
  reinspectionRate: real("reinspection_rate").default(0),
  denialRate: real("denial_rate").default(0),
  escalationTriggerRate: real("escalation_trigger_rate").default(0),
  totalClaimsTracked: integer("total_claims_tracked").default(0),
  totalDenials: integer("total_denials").default(0),
  totalReinspections: integer("total_reinspections").default(0),
  totalSupplementsRequested: integer("total_supplements_requested").default(0),
  totalSupplementsApproved: integer("total_supplements_approved").default(0),
  frictionScore: real("friction_score").default(0),
  integrityScore: real("integrity_score").default(0),
  escalationScore: real("escalation_score").default(0),
  outcomeMigrationScore: real("outcome_migration_score").default(0),
  denialRatio: real("denial_ratio").default(0),
  partialApprovalRatio: real("partial_approval_ratio").default(0),
  supplementReductionRatio: real("supplement_reduction_ratio").default(0),
  transcriptDelayLanguageRate: real("transcript_delay_language_rate").default(0),
  transcriptDeflectionLanguageRate: real("transcript_deflection_language_rate").default(0),
  ircRejectionRate: real("irc_rejection_rate").default(0),
  paymentUnderScopeRatio: real("payment_under_scope_ratio").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
});

// Many-to-many: one claim can involve multiple adjusters; one adjuster can
// appear across multiple claims. claim.adjusterId remains as the legacy primary.
export const claimAdjusters = pgTable("claim_adjusters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  claimId: varchar("claim_id").notNull(),
  adjusterId: varchar("adjuster_id").notNull(),
  carrierId: varchar("carrier_id"),
  roleOnClaim: claimAdjusterRoleEnum("role_on_claim").notNull().default("unknown"),
  involvementType: claimAdjusterInvolvementEnum("involvement_type").notNull().default("unknown"),
  firstSeenDate: timestamp("first_seen_date"),
  lastSeenDate: timestamp("last_seen_date"),
  sourceDocumentId: varchar("source_document_id"),
  sourceAudioId: varchar("source_audio_id"),
  sourceTranscriptId: varchar("source_transcript_id"),
  sourceCommunicationId: varchar("source_communication_id"),
  sourceType: claimAdjusterSourceEnum("source_type").notNull().default("manual"),
  confidenceScore: real("confidence_score").default(1),
  needsReview: boolean("needs_review").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueClaimAdjusterRole: uniqueIndex("claim_adjusters_claim_adjuster_role_uniq").on(
    table.claimId,
    table.adjusterId,
    table.roleOnClaim,
  ),
}));

export const adjusterAggregatedMetrics = pgTable("adjuster_aggregated_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adjusterName: text("adjuster_name").notNull(),
  carrier: text("carrier").notNull(),
  region: text("region"),
  timePeriod: text("time_period").notNull(),
  avgFrictionScore: real("avg_friction_score").default(0),
  avgDenialRate: real("avg_denial_rate").default(0),
  avgSupplementApprovalRate: real("avg_supplement_approval_rate").default(0),
  avgResponseTimeHours: real("avg_response_time_hours").default(0),
  avgDaysToInitialDetermination: real("avg_days_to_initial_determination").default(0),
  avgEscalationRate: real("avg_escalation_rate").default(0),
  avgReinspectionRate: real("avg_reinspection_rate").default(0),
  avgLifecycleVelocityScore: real("avg_lifecycle_velocity_score").default(0),
  avgScopeDeltaScore: real("avg_scope_delta_score").default(0),
  totalClaimsModeled: integer("total_claims_modeled").default(0),
  totalDenials: integer("total_denials").default(0),
  totalSupplementsSubmitted: integer("total_supplements_submitted").default(0),
  totalSupplementsApproved: integer("total_supplements_approved").default(0),
  totalEscalations: integer("total_escalations").default(0),
  decisionVarianceScore: real("decision_variance_score").default(0),
  responseVelocityDeviation: real("response_velocity_deviation").default(0),
  outlierBehaviorFlag: boolean("outlier_behavior_flag").default(false),
  supplementInflationIndex: real("supplement_inflation_index").default(0),
  commonTriggerFrequency: json("common_trigger_frequency"),
  complianceTrendScore: real("compliance_trend_score").default(0),
  computedAt: timestamp("computed_at").defaultNow(),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
});

export const evidenceFiles = pgTable("evidence_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  uploadedByUserId: varchar("uploaded_by_user_id").notNull(),
  claimId: varchar("claim_id"),
  sourceType: sourceTypeEnum("source_type").default("upload"),
  fileName: text("file_name").notNull(),
  fileType: fileTypeEnum("file_type").default("other"),
  storageUrl: text("storage_url"),
  sha256: text("sha256"),
  fileSize: integer("file_size"),
  pages: integer("pages"),
  docCategory: docCategoryEnum("doc_category").default("unknown"),
  carrierName: text("carrier_name"),
  confidence: real("confidence"),
  extractedJson: json("extracted_json"),
  extractionVersion: text("extraction_version"),
  extractionStatus: extractionStatusEnum("extraction_status").default("pending"),
  extractionErrors: text("extraction_errors"),
  normalizedTextHash: text("normalized_text_hash"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  processedAt: timestamp("processed_at"),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
});

export const extractedEntities = pgTable("extracted_entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evidenceFileId: varchar("evidence_file_id").notNull(),
  claimId: varchar("claim_id"),
  entityType: entityTypeEnum("entity_type").notNull(),
  rawValue: text("raw_value").notNull(),
  normalizedValue: text("normalized_value"),
  confidence: real("confidence"),
  pageNumber: integer("page_number"),
  anchorText: text("anchor_text"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const claimDrafts = pgTable("claim_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  createdFromEvidenceFileId: varchar("created_from_evidence_file_id"),
  extractedClaimNumber: text("extracted_claim_number"),
  extractedInsured: text("extracted_insured"),
  extractedAddress: text("extracted_address"),
  extractedCarrier: text("extracted_carrier"),
  extractedAdjuster: text("extracted_adjuster"),
  extractedDateOfLoss: timestamp("extracted_date_of_loss"),
  extractionConfidence: real("extraction_confidence"),
  sourceFileName: text("source_file_name"),
  status: claimDraftStatusEnum("status").default("needs_review"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const audioRecordings = pgTable("audio_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  claimId: varchar("claim_id"),
  uploadedByUserId: varchar("uploaded_by_user_id").notNull(),
  fileUrl: text("file_url"),
  durationSeconds: integer("duration_seconds"),
  sha256Hash: text("sha256_hash"),
  transcriptText: text("transcript_text"),
  transcriptConfidence: real("transcript_confidence"),
  hostilityScore: real("hostility_score"),
  complianceLanguageScore: real("compliance_language_score"),
  delayLanguageDetected: boolean("delay_language_detected").default(false),
  denialPreLanguageDetected: boolean("denial_pre_language_detected").default(false),
  badFaithRiskIndicator: real("bad_faith_risk_indicator"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
});

export const timelineEvents = pgTable("timeline_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  eventType: text("event_type").notNull(),
  eventDate: timestamp("event_date").defaultNow(),
  title: text("title").notNull(),
  description: text("description"),
  evidenceFileId: varchar("evidence_file_id"),
  audioRecordingId: varchar("audio_recording_id"),
  deepLinkTarget: json("deep_link_target"),
  createdByUserId: varchar("created_by_user_id"),
  // ── AI date-extraction (additive) ──
  extractedDate: timestamp("extracted_date"),
  uploadDate: timestamp("upload_date").defaultNow(),
  dateSource: text("date_source"),
  confidenceScore: real("confidence_score"),
  needsReview: boolean("needs_review").default(false),
  reviewStatus: text("review_status").default("pending"),
  sourceDocumentId: varchar("source_document_id"),
  sourceAudioId: varchar("source_audio_id"),
  sourceTranscriptId: varchar("source_transcript_id"),
  metadataJson: json("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
});

export const triggerSourceEnum = pgEnum("trigger_source", ["estimate_delta", "transcript", "photo_flag", "denial_letter"]);

export const adjusterPlaybooks = pgTable("adjuster_playbooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adjusterId: varchar("adjuster_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  commonDenialPatterns: json("common_denial_patterns"),
  averageSupplementResponseDays: real("average_supplement_response_days"),
  commonCoverageLimitationsCited: json("common_coverage_limitations_cited"),
  ircTriggerSensitivityScore: real("irc_trigger_sensitivity_score"),
  escalationThresholdRecommended: integer("escalation_threshold_recommended"),
  denialPatternFrequency: integer("denial_pattern_frequency").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Playbook Engine (additive) — reusable historical claim outcome patterns ──
export const playbookEntries = pgTable("playbook_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"),
  title: text("title").notNull(),
  scenarioType: text("scenario_type"),
  claimType: text("claim_type"),
  carrier: text("carrier"),
  adjuster: text("adjuster"),
  iaFirm: text("ia_firm"),
  vendor: text("vendor"),
  denialReason: text("denial_reason"),
  missingScopeItems: json("missing_scope_items"),
  documentationUsed: json("documentation_used"),
  actionTaken: text("action_taken"),
  whatWorked: text("what_worked"),
  whatDidNotWork: text("what_did_not_work"),
  timelineSummary: text("timeline_summary"),
  escalationUsed: boolean("escalation_used").default(false),
  outcome: text("outcome"),
  supplementDelta: real("supplement_delta"),
  confidenceScore: real("confidence_score"),
  sourceClaimCount: integer("source_claim_count").default(0),
  sourceClaimId: varchar("source_claim_id"),
  region: text("region"),
  recommendedNextStep: text("recommended_next_step"),
  isSample: boolean("is_sample").default(false),
  createdBy: varchar("created_by"),
  metadataJson: json("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
});

export const ircCodes = pgTable("irc_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  codeReference: text("code_reference").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  supplementTriggerKeywords: json("supplement_trigger_keywords"),
  roofingTypeApplicable: text("roofing_type_applicable"),
  severityWeight: real("severity_weight"),
});

export const supplementTriggers = pgTable("supplement_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  ircCodeId: varchar("irc_code_id"),
  triggerSource: triggerSourceEnum("trigger_source"),
  confidenceScore: real("confidence_score"),
  estimatedFinancialDelta: real("estimated_financial_delta"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const piiAccessLogs = pgTable("pii_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  claimId: varchar("claim_id").notNull(),
  fieldAccessed: text("field_accessed").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const founderAgreements = pgTable("founder_agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id").notNull(),
  signedAt: timestamp("signed_at").defaultNow(),
  ip: text("ip"),
  version: text("version").default("1.0"),
  agreementHash: text("agreement_hash"),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"),
  actorUserId: varchar("actor_user_id").notNull(),
  actorRole: text("actor_role"),
  isImpersonation: boolean("is_impersonation").default(false),
  impersonatorUserId: varchar("impersonator_user_id"),
  targetUserId: varchar("target_user_id"),
  actionType: text("action_type").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  beforeJson: json("before_json"),
  afterJson: json("after_json"),
  timestamp: timestamp("timestamp").defaultNow(),
  ipAddress: text("ip_address"),
});

export const supplementIntelligence = pgTable("supplement_intelligence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  ircCodeReference: text("irc_code_reference"),
  triggerDetected: boolean("trigger_detected").default(false),
  triggerSource: triggerSourceEnum("trigger_source"),
  confidenceScore: real("confidence_score"),
  financialImpactEstimate: real("financial_impact_estimate"),
  adjusterResponseOutcome: text("adjuster_response_outcome"),
  daysToResolution: integer("days_to_resolution"),
  supplementResistanceScore: real("supplement_resistance_score"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adjusterIrcBehavior = pgTable("adjuster_irc_behavior", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adjusterId: varchar("adjuster_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  ircCodeReference: text("irc_code_reference").notNull(),
  triggerFrequency: integer("trigger_frequency").default(0),
  approvalRate: real("approval_rate").default(0),
  denialRate: real("denial_rate").default(0),
  avgTimeToDecision: real("avg_time_to_decision").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const communicationSignals = pgTable("communication_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  adjusterId: varchar("adjuster_id"),
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
  delayLanguageDetected: boolean("delay_language_detected").default(false),
  coverageLimitationCited: boolean("coverage_limitation_cited").default(false),
  deflectionLanguageDetected: boolean("deflection_language_detected").default(false),
  policyReferenceDetected: boolean("policy_reference_detected").default(false),
  timelineCommitmentDetected: boolean("timeline_commitment_detected").default(false),
  refusalLanguageDetected: boolean("refusal_language_detected").default(false),
  escalationResistanceLanguageDetected: boolean("escalation_resistance_language_detected").default(false),
  sentimentScore: real("sentiment_score"),
  complianceRiskIndicator: real("compliance_risk_indicator"),
  communicationRiskScore: real("communication_risk_score"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const playbookInsights = pgTable("playbook_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adjusterId: varchar("adjuster_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  insightType: text("insight_type").notNull(),
  description: text("description"),
  frequency: integer("frequency").default(0),
  recommendedResponseStrategy: text("recommended_response_strategy"),
  supportingEvidenceCount: integer("supporting_evidence_count").default(0),
  confidenceScore: real("confidence_score"),
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scoringWeights = pgTable("scoring_weights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricName: text("metric_name").notNull(),
  weightValue: real("weight_value").notNull(),
  activeVersion: text("active_version").notNull().default("v1"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const intelligenceEvents = pgTable("intelligence_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  claimId: varchar("claim_id").notNull(),
  adjusterId: varchar("adjuster_id"),
  sourceType: eventSourceTypeEnum("source_type").notNull(),
  eventCategory: eventCategoryEnum("event_category").notNull(),
  eventType: text("event_type").notNull(),
  metricValue: numeric("metric_value"),
  weightApplied: numeric("weight_applied").notNull(),
  confidenceScore: numeric("confidence_score").notNull(),
  severityLevel: integer("severity_level").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSessionSchema = createInsertSchema(userSessions).omit({ id: true, createdAt: true, lastUsedAt: true });
export const insertBillingAccountSchema = createInsertSchema(billingAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export const insertClaimSchema = createInsertSchema(claims).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClaimVersionSchema = createInsertSchema(claimVersions).omit({ id: true, changedAt: true });
export const insertAdjusterSchema = createInsertSchema(adjusters).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClaimAdjusterSchema = createInsertSchema(claimAdjusters).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAdjusterAggregatedMetricSchema = createInsertSchema(adjusterAggregatedMetrics).omit({ id: true, computedAt: true });
export const insertSupplementSchema = createInsertSchema(supplements).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export const insertEmailSchema = createInsertSchema(emails).omit({ id: true, createdAt: true });
export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({ id: true, createdAt: true });
export const insertEvidenceFileSchema = createInsertSchema(evidenceFiles).omit({ id: true, uploadedAt: true, processedAt: true });
export const insertExtractedEntitySchema = createInsertSchema(extractedEntities).omit({ id: true, createdAt: true });
export const insertClaimDraftSchema = createInsertSchema(claimDrafts).omit({ id: true, createdAt: true });
export const insertAudioRecordingSchema = createInsertSchema(audioRecordings).omit({ id: true, createdAt: true, processedAt: true });
export const insertTimelineEventSchema = createInsertSchema(timelineEvents).omit({ id: true, createdAt: true });
export const insertAdjusterPlaybookSchema = createInsertSchema(adjusterPlaybooks).omit({ id: true, createdAt: true });
export const insertPlaybookEntrySchema = createInsertSchema(playbookEntries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertIrcCodeSchema = createInsertSchema(ircCodes).omit({ id: true });
export const insertSupplementTriggerSchema = createInsertSchema(supplementTriggers).omit({ id: true, createdAt: true });
export const insertPiiAccessLogSchema = createInsertSchema(piiAccessLogs).omit({ id: true, timestamp: true });
export const insertFounderAgreementSchema = createInsertSchema(founderAgreements).omit({ id: true, signedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });
export const insertSupplementIntelligenceSchema = createInsertSchema(supplementIntelligence).omit({ id: true, createdAt: true });
export const insertAdjusterIrcBehaviorSchema = createInsertSchema(adjusterIrcBehavior).omit({ id: true, createdAt: true });
export const insertCommunicationSignalSchema = createInsertSchema(communicationSignals).omit({ id: true, createdAt: true });
export const insertPlaybookInsightSchema = createInsertSchema(playbookInsights).omit({ id: true, createdAt: true });
export const insertScoringWeightSchema = createInsertSchema(scoringWeights).omit({ id: true, createdAt: true });
export const insertIntelligenceEventSchema = createInsertSchema(intelligenceEvents).omit({ id: true, createdAt: true });

// Storm Event Lookup — roadmap MVP module (manual entry, no external API)
export const stormEventTypeEnum = pgEnum("storm_event_type", ["hail", "wind", "hail_and_wind", "other"]);
export const stormReportSourceEnum = pgEnum("storm_report_source", ["noaa", "spc", "ncei", "radar_report", "contractor_observation", "homeowner_statement", "other"]);
export const locationMatchConfidenceEnum = pgEnum("location_match_confidence", ["high", "medium", "low"]);
export const weatherVerificationStatusEnum = pgEnum("weather_verification_status", ["verified", "partially_verified", "pending_verification", "no_supporting_data"]);

export const stormEvents = pgTable("storm_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organization_id").notNull(),
  claimId: text("claim_id"),
  dateOfLoss: date("date_of_loss"),
  stormEventDate: date("storm_event_date"),
  propertyLocation: text("property_location"),
  eventType: stormEventTypeEnum("event_type"),
  hailEvent: boolean("hail_event").default(false),
  windEvent: boolean("wind_event").default(false),
  hurricaneEvent: boolean("hurricane_event").default(false),
  tornadoEvent: boolean("tornado_event").default(false),
  reportSource: stormReportSourceEnum("report_source"),
  hailSize: text("hail_size"),
  windSpeed: text("wind_speed"),
  distanceFromProperty: text("distance_from_property"),
  locationMatchConfidence: locationMatchConfidenceEnum("location_match_confidence"),
  weatherVerificationStatus: weatherVerificationStatusEnum("weather_verification_status").default("pending_verification"),
  weatherConfidenceScore: real("weather_confidence_score"),
  weatherSource: text("weather_source"),
  weatherEvidenceUploaded: boolean("weather_evidence_uploaded").default(false),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStormEventSchema = createInsertSchema(stormEvents).omit({ id: true, createdAt: true });
export type StormEvent = typeof stormEvents.$inferSelect;
export type InsertStormEvent = z.infer<typeof insertStormEventSchema>;

// ── Section 18 — Document Intelligence: analysis columns on evidence_files ─
// (additive columns applied via migration script)
// intelligenceJson: stores full DocumentIntelligenceResult
// reviewStatus: "pending_review" | "accepted" | "rejected" | "partial"

// ── Section 19 — Escalation Intelligence ───────────────────────────────────
export const escalationTypeEnum = pgEnum("escalation_type", [
  "reinspection_request", "supervisor_review", "team_lead_review", "desk_adjuster_review",
  "carrier_internal_escalation", "supplement_submission", "code_documentation",
  "manufacturer_documentation", "repairability_documentation", "brittle_test",
  "matching_dispute", "photo_evidence_packet", "estimate_comparison",
  "engineer_report_dispute", "doi_complaint", "appraisal_demand",
  "attorney_involvement", "public_adjuster_involvement",
]);

export const escalationResultEnum = pgEnum("escalation_result", [
  "no_response", "pending", "denial_upheld", "reinspection_scheduled",
  "partial_approval", "full_approval", "supplement_approved", "payment_increased",
  "claim_reopened", "claim_closed", "moved_to_appraisal",
  "referred_to_supervisor", "referred_to_legal",
]);

export const escalations = pgTable("escalations", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organization_id").notNull(),
  claimId: text("claim_id").notNull(),
  carrierName: text("carrier_name"),
  adjusterId: text("adjuster_id"),
  escalationType: escalationTypeEnum("escalation_type").notNull(),
  dateInitiated: date("date_initiated"),
  reasonForEscalation: text("reason_for_escalation"),
  documentsSubmitted: text("documents_submitted").array(),
  personContacted: text("person_contacted"),
  responseReceived: text("response_received"),
  timelineImpactDays: integer("timeline_impact_days"),
  outcomeBeforeEscalation: text("outcome_before_escalation"),
  outcomeAfterEscalation: text("outcome_after_escalation"),
  escalationResult: escalationResultEnum("escalation_result").default("pending"),
  savedToPlaybook: boolean("saved_to_playbook").default(false),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEscalationSchema = createInsertSchema(escalations).omit({ id: true, createdAt: true, updatedAt: true });
export type Escalation = typeof escalations.$inferSelect;
export type InsertEscalation = z.infer<typeof insertEscalationSchema>;

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name required"),
  orgName: z.string().min(2, "Organization name required"),
  planType: z.enum(["founder", "pro", "team", "enterprise"]).default("pro"),
  organizationType: z.enum(["contractor", "roofing_firm", "enterprise_operator", "carrier", "tpa"]).default("contractor"),
});

export const registerSchema = signupSchema;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserSession = typeof userSessions.$inferSelect;
export type BillingAccount = typeof billingAccounts.$inferSelect;
export type InsertBillingAccount = z.infer<typeof insertBillingAccountSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Claim = typeof claims.$inferSelect;
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type ClaimVersion = typeof claimVersions.$inferSelect;
export type Adjuster = typeof adjusters.$inferSelect;
export type InsertAdjuster = z.infer<typeof insertAdjusterSchema>;
export type ClaimAdjuster = typeof claimAdjusters.$inferSelect;
export type InsertClaimAdjuster = z.infer<typeof insertClaimAdjusterSchema>;
export type AdjusterAggregatedMetric = typeof adjusterAggregatedMetrics.$inferSelect;
export type InsertAdjusterAggregatedMetric = z.infer<typeof insertAdjusterAggregatedMetricSchema>;
export type Supplement = typeof supplements.$inferSelect;
export type InsertSupplement = z.infer<typeof insertSupplementSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Email = typeof emails.$inferSelect;
export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;
export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type EvidenceFile = typeof evidenceFiles.$inferSelect;
export type InsertEvidenceFile = z.infer<typeof insertEvidenceFileSchema>;
export type ExtractedEntity = typeof extractedEntities.$inferSelect;
export type InsertExtractedEntity = z.infer<typeof insertExtractedEntitySchema>;
export type ClaimDraft = typeof claimDrafts.$inferSelect;
export type InsertClaimDraft = z.infer<typeof insertClaimDraftSchema>;
export type AudioRecording = typeof audioRecordings.$inferSelect;
export type InsertAudioRecording = z.infer<typeof insertAudioRecordingSchema>;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type InsertTimelineEvent = z.infer<typeof insertTimelineEventSchema>;
export type AdjusterPlaybook = typeof adjusterPlaybooks.$inferSelect;
export type InsertAdjusterPlaybook = z.infer<typeof insertAdjusterPlaybookSchema>;
export type InsertPlaybookEntry = z.infer<typeof insertPlaybookEntrySchema>;
export type PlaybookEntry = typeof playbookEntries.$inferSelect;
export type IrcCode = typeof ircCodes.$inferSelect;
export type InsertIrcCode = z.infer<typeof insertIrcCodeSchema>;
export type SupplementTrigger = typeof supplementTriggers.$inferSelect;
export type InsertSupplementTrigger = z.infer<typeof insertSupplementTriggerSchema>;
export type PiiAccessLog = typeof piiAccessLogs.$inferSelect;
export type InsertPiiAccessLog = z.infer<typeof insertPiiAccessLogSchema>;
export type FounderAgreement = typeof founderAgreements.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SupplementIntelligence = typeof supplementIntelligence.$inferSelect;
export type InsertSupplementIntelligence = z.infer<typeof insertSupplementIntelligenceSchema>;
export type AdjusterIrcBehavior = typeof adjusterIrcBehavior.$inferSelect;
export type InsertAdjusterIrcBehavior = z.infer<typeof insertAdjusterIrcBehaviorSchema>;
export type CommunicationSignal = typeof communicationSignals.$inferSelect;
export type InsertCommunicationSignal = z.infer<typeof insertCommunicationSignalSchema>;
export type PlaybookInsight = typeof playbookInsights.$inferSelect;
export type InsertPlaybookInsight = z.infer<typeof insertPlaybookInsightSchema>;
export type ScoringWeight = typeof scoringWeights.$inferSelect;
export type InsertScoringWeight = z.infer<typeof insertScoringWeightSchema>;
export type IntelligenceEvent = typeof intelligenceEvents.$inferSelect;
export type InsertIntelligenceEvent = z.infer<typeof insertIntelligenceEventSchema>;
