import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const orgTypeEnum = pgEnum("org_type", ["individual", "team"]);
export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "analyst", "member"]);
export const tierEnum = pgEnum("tier", ["founder", "pro", "team", "enterprise"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "trialing", "past_due", "canceled", "incomplete"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orgs = pgTable("orgs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: orgTypeEnum("type").notNull().default("individual"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orgMembers = pgTable("org_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: orgRoleEnum("role").notNull().default("owner"),
});

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  tier: tierEnum("tier").notNull().default("pro"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  seatLimit: integer("seat_limit").default(1),
  trialEnd: timestamp("trial_end"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const founderAgreements = pgTable("founder_agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  userId: varchar("user_id").notNull(),
  signedAt: timestamp("signed_at").defaultNow(),
  ip: text("ip"),
  version: text("version").default("1.0"),
  agreementHash: text("agreement_hash"),
});

export const carriers = pgTable("carriers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  region: text("region"),
});

export const adjusters = pgTable("adjusters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  carrierId: varchar("carrier_id"),
  region: text("region"),
});

export const claims = pgTable("claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  claimNumber: text("claim_number").notNull(),
  insuredName: text("insured_name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code"),
  carrierId: varchar("carrier_id"),
  adjusterId: varchar("adjuster_id"),
  status: text("status").notNull().default("open"),
  lossType: text("loss_type"),
  lossDate: timestamp("loss_date"),
  claimAmount: integer("claim_amount"),
  approvedAmount: integer("approved_amount"),
  frictionScore: integer("friction_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertOrgSchema = createInsertSchema(orgs).omit({ id: true, createdAt: true });
export const insertOrgMemberSchema = createInsertSchema(orgMembers).omit({ id: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export const insertFounderAgreementSchema = createInsertSchema(founderAgreements).omit({ id: true, signedAt: true });
export const insertCarrierSchema = createInsertSchema(carriers).omit({ id: true });
export const insertAdjusterSchema = createInsertSchema(adjusters).omit({ id: true });
export const insertClaimSchema = createInsertSchema(claims).omit({ id: true, createdAt: true });

export const registerSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name required"),
  orgName: z.string().min(2, "Organization name required"),
});

export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Org = typeof orgs.$inferSelect;
export type InsertOrg = z.infer<typeof insertOrgSchema>;
export type OrgMember = typeof orgMembers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type FounderAgreement = typeof founderAgreements.$inferSelect;
export type Carrier = typeof carriers.$inferSelect;
export type InsertCarrier = z.infer<typeof insertCarrierSchema>;
export type Adjuster = typeof adjusters.$inferSelect;
export type InsertAdjuster = z.infer<typeof insertAdjusterSchema>;
export type Claim = typeof claims.$inferSelect;
export type InsertClaim = z.infer<typeof insertClaimSchema>;
