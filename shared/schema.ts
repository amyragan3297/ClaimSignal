import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, pgEnum, json, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "founder", "standard"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trialing", "active", "past_due", "canceled"]);
export const planTypeEnum = pgEnum("plan_type", ["founder", "pro", "team", "enterprise", "individual"]);

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("founder"),
  founderFlag: boolean("founder_flag").default(false),
  isPlatformOwner: boolean("is_platform_owner").default(false),
  fullName: text("full_name").notNull(),
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
});

export const claims = pgTable("claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  clientId: varchar("client_id"),
  claimNumber: text("claim_number").notNull(),
  carrier: text("carrier"),
  dateOfLoss: timestamp("date_of_loss"),
  propertyAddress: text("property_address"),
  adjusterId: varchar("adjuster_id"),
  status: text("status").notNull().default("open"),
  riskScore: integer("risk_score"),
  notes: text("notes"),
  homeownerName: text("homeowner_name"),
  homeownerPhone: text("homeowner_phone"),
  homeownerEmail: text("homeowner_email"),
  policyNumber: text("policy_number"),
  insuredName: text("insured_name"),
  lossType: text("loss_type"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  claimAmount: real("claim_amount"),
  approvedAmount: real("approved_amount"),
  lossDate: timestamp("loss_date"),
  frictionScore: integer("friction_score"),
  roofType: text("roof_type"),
  shingleType: text("shingle_type"),
  rcvTotal: real("rcv_total"),
  acvTotal: real("acv_total"),
  deductible: real("deductible"),
  escalationCategory: text("escalation_category"),
  approvalProbability: real("approval_probability"),
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
});

export const emails = pgTable("emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  direction: text("direction").notNull().default("incoming"),
  subject: text("subject"),
  body: text("body"),
  createdAt: timestamp("created_at").defaultNow(),
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
  fullName: text("full_name").notNull(),
  carrier: text("carrier"),
  licenseNumber: text("license_number"),
  region: text("region"),
  email: text("email"),
  phone: text("phone"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const adjusterMetrics = pgTable("adjuster_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adjusterId: varchar("adjuster_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  totalClaims: integer("total_claims").default(0),
  denialRate: real("denial_rate").default(0),
  supplementApprovalRate: real("supplement_approval_rate").default(0),
  averageDaysToClose: real("average_days_to_close").default(0),
  averageInitialPayout: real("average_initial_payout").default(0),
  averageSupplementIncrease: real("average_supplement_increase").default(0),
  escalationFrequency: real("escalation_frequency").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
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

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSessionSchema = createInsertSchema(userSessions).omit({ id: true, createdAt: true, lastUsedAt: true });
export const insertBillingAccountSchema = createInsertSchema(billingAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export const insertClaimSchema = createInsertSchema(claims).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClaimVersionSchema = createInsertSchema(claimVersions).omit({ id: true, changedAt: true });
export const insertAdjusterSchema = createInsertSchema(adjusters).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAdjusterMetricsSchema = createInsertSchema(adjusterMetrics).omit({ id: true, lastUpdated: true });
export const insertSupplementSchema = createInsertSchema(supplements).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export const insertEmailSchema = createInsertSchema(emails).omit({ id: true, createdAt: true });
export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({ id: true, createdAt: true });
export const insertFounderAgreementSchema = createInsertSchema(founderAgreements).omit({ id: true, signedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });

export const signupSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name required"),
  orgName: z.string().min(2, "Organization name required"),
  planType: z.enum(["founder", "pro", "team", "enterprise"]).default("pro"),
});

export const registerSchema = signupSchema;

export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
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
export type AdjusterMetrics = typeof adjusterMetrics.$inferSelect;
export type Supplement = typeof supplements.$inferSelect;
export type InsertSupplement = z.infer<typeof insertSupplementSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Email = typeof emails.$inferSelect;
export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;
export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type FounderAgreement = typeof founderAgreements.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
