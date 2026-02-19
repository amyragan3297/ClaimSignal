import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, pgEnum, json, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "founder", "standard"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trialing", "active", "past_due", "canceled"]);
export const planTypeEnum = pgEnum("plan_type", ["founder"]);

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
  role: userRoleEnum("role").notNull().default("standard"),
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

export const claims = pgTable("claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  claimNumber: text("claim_number").notNull(),
  carrier: text("carrier"),
  dateOfLoss: timestamp("date_of_loss"),
  propertyAddress: text("property_address"),
  adjusterId: varchar("adjuster_id"),
  status: text("status").notNull().default("open"),
  riskScore: integer("risk_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
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
  name: text("name").notNull(),
  carrier: text("carrier"),
  email: text("email"),
  phone: text("phone"),
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
export const insertClaimSchema = createInsertSchema(claims).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClaimVersionSchema = createInsertSchema(claimVersions).omit({ id: true, changedAt: true });
export const insertAdjusterSchema = createInsertSchema(adjusters).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAdjusterMetricsSchema = createInsertSchema(adjusterMetrics).omit({ id: true, lastUpdated: true });
export const insertFounderAgreementSchema = createInsertSchema(founderAgreements).omit({ id: true, signedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });

export const signupSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name required"),
  orgName: z.string().min(2, "Organization name required"),
});

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
export type Claim = typeof claims.$inferSelect;
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type ClaimVersion = typeof claimVersions.$inferSelect;
export type Adjuster = typeof adjusters.$inferSelect;
export type InsertAdjuster = z.infer<typeof insertAdjusterSchema>;
export type AdjusterMetrics = typeof adjusterMetrics.$inferSelect;
export type FounderAgreement = typeof founderAgreements.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
