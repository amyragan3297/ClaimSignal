import {
  type User, type InsertUser,
  type Org, type InsertOrg,
  type OrgMember,
  type Subscription, type InsertSubscription,
  type FounderAgreement,
  type Carrier, type InsertCarrier,
  type Adjuster, type InsertAdjuster,
  type Claim, type InsertClaim,
  type AuditLog,
  type ImpersonationSession,
  users, orgs, orgMembers, subscriptions, founderAgreements, carriers, adjusters, claims,
  auditLogs, impersonationSessions,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, count, sql, desc, gt } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  createOrg(org: InsertOrg): Promise<Org>;
  getOrg(id: string): Promise<Org | undefined>;

  addOrgMember(orgId: string, userId: string, role: string): Promise<OrgMember>;
  getOrgMember(orgId: string, userId: string): Promise<OrgMember | undefined>;

  createSubscription(sub: InsertSubscription): Promise<Subscription>;
  getSubscriptionByOrg(orgId: string): Promise<Subscription | undefined>;
  updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  getFounderCount(): Promise<number>;

  createFounderAgreement(orgId: string, userId: string, ip: string, version: string, hash: string): Promise<FounderAgreement>;
  getFounderAgreement(orgId: string): Promise<FounderAgreement | undefined>;

  getClaims(orgId: string): Promise<Claim[]>;
  getClaim(id: string, orgId: string): Promise<Claim | undefined>;
  createClaim(claim: InsertClaim): Promise<Claim>;
  updateClaim(id: string, orgId: string, data: Partial<InsertClaim>): Promise<Claim | undefined>;
  deleteClaim(id: string, orgId: string): Promise<boolean>;
  getClaimCount(orgId: string): Promise<number>;
  getOpenClaimCount(orgId: string): Promise<number>;

  getCarriers(orgId: string): Promise<Carrier[]>;
  createCarrier(carrier: InsertCarrier): Promise<Carrier>;
  getCarrierCount(orgId: string): Promise<number>;

  getAdjusters(orgId: string): Promise<Adjuster[]>;
  createAdjuster(adjuster: InsertAdjuster): Promise<Adjuster>;
  getAdjusterCount(orgId: string): Promise<number>;

  getAllUsers(): Promise<User[]>;
  getAllOrgs(): Promise<Org[]>;
  getAllSubscriptions(): Promise<Subscription[]>;
  getAllOrgMembers(): Promise<OrgMember[]>;
  getAllClaims(): Promise<Claim[]>;
  getTotalClaimCount(): Promise<number>;
  setUserAdmin(userId: string, isAdmin: boolean): Promise<User | undefined>;
  setPlatformOwner(userId: string, isOwner: boolean): Promise<User | undefined>;
  updateUserTier(orgId: string, tier: string): Promise<Subscription | undefined>;

  createAuditLog(adminUserId: string, targetUserId: string, actionType: "IMPERSONATION_START" | "IMPERSONATION_END", ipAddress: string, metadata?: string): Promise<AuditLog>;
  getAuditLogs(): Promise<AuditLog[]>;

  createImpersonationSession(adminUserId: string, targetUserId: string, targetOrgId: string, token: string, expiresAt: Date): Promise<ImpersonationSession>;
  getActiveImpersonationSession(token: string): Promise<ImpersonationSession | undefined>;
  getActiveSessionByAdmin(adminUserId: string): Promise<ImpersonationSession | undefined>;
  deactivateImpersonationSession(id: string): Promise<void>;
  deactivateAllAdminSessions(adminUserId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async createOrg(org: InsertOrg): Promise<Org> {
    const [created] = await db.insert(orgs).values(org).returning();
    return created;
  }

  async getOrg(id: string): Promise<Org | undefined> {
    const [org] = await db.select().from(orgs).where(eq(orgs.id, id));
    return org;
  }

  async addOrgMember(orgId: string, userId: string, role: string): Promise<OrgMember> {
    const [member] = await db.insert(orgMembers).values({ orgId, userId, role: role as any }).returning();
    return member;
  }

  async getOrgMember(orgId: string, userId: string): Promise<OrgMember | undefined> {
    const [member] = await db.select().from(orgMembers).where(
      and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId))
    );
    return member;
  }

  async createSubscription(sub: InsertSubscription): Promise<Subscription> {
    const [created] = await db.insert(subscriptions).values(sub).returning();
    return created;
  }

  async getSubscriptionByOrg(orgId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
    return sub;
  }

  async updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const [updated] = await db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning();
    return updated;
  }

  async getFounderCount(): Promise<number> {
    const result = await db.select({ count: count() }).from(subscriptions).where(eq(subscriptions.tier, "founder"));
    return result[0]?.count ?? 0;
  }

  async createFounderAgreement(orgId: string, userId: string, ip: string, version: string, hash: string): Promise<FounderAgreement> {
    const [created] = await db.insert(founderAgreements).values({
      orgId, userId, ip, version, agreementHash: hash,
    }).returning();
    return created;
  }

  async getFounderAgreement(orgId: string): Promise<FounderAgreement | undefined> {
    const [agreement] = await db.select().from(founderAgreements).where(eq(founderAgreements.orgId, orgId));
    return agreement;
  }

  async getClaims(orgId: string): Promise<Claim[]> {
    return db.select().from(claims).where(eq(claims.orgId, orgId));
  }

  async getClaim(id: string, orgId: string): Promise<Claim | undefined> {
    const [claim] = await db.select().from(claims).where(
      and(eq(claims.id, id), eq(claims.orgId, orgId))
    );
    return claim;
  }

  async createClaim(claim: InsertClaim): Promise<Claim> {
    const [created] = await db.insert(claims).values(claim).returning();
    return created;
  }

  async updateClaim(id: string, orgId: string, data: Partial<InsertClaim>): Promise<Claim | undefined> {
    const [updated] = await db.update(claims).set(data).where(
      and(eq(claims.id, id), eq(claims.orgId, orgId))
    ).returning();
    return updated;
  }

  async deleteClaim(id: string, orgId: string): Promise<boolean> {
    const result = await db.delete(claims).where(
      and(eq(claims.id, id), eq(claims.orgId, orgId))
    ).returning();
    return result.length > 0;
  }

  async getClaimCount(orgId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(claims).where(eq(claims.orgId, orgId));
    return result[0]?.count ?? 0;
  }

  async getOpenClaimCount(orgId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(claims).where(
      and(eq(claims.orgId, orgId), eq(claims.status, "open"))
    );
    return result[0]?.count ?? 0;
  }

  async getCarriers(orgId: string): Promise<Carrier[]> {
    return db.select().from(carriers).where(eq(carriers.orgId, orgId));
  }

  async createCarrier(carrier: InsertCarrier): Promise<Carrier> {
    const [created] = await db.insert(carriers).values(carrier).returning();
    return created;
  }

  async getCarrierCount(orgId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(carriers).where(eq(carriers.orgId, orgId));
    return result[0]?.count ?? 0;
  }

  async getAdjusters(orgId: string): Promise<Adjuster[]> {
    return db.select().from(adjusters).where(eq(adjusters.orgId, orgId));
  }

  async createAdjuster(adjuster: InsertAdjuster): Promise<Adjuster> {
    const [created] = await db.insert(adjusters).values(adjuster).returning();
    return created;
  }

  async getAdjusterCount(orgId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(adjusters).where(eq(adjusters.orgId, orgId));
    return result[0]?.count ?? 0;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getAllOrgs(): Promise<Org[]> {
    return db.select().from(orgs);
  }

  async getAllSubscriptions(): Promise<Subscription[]> {
    return db.select().from(subscriptions);
  }

  async getAllOrgMembers(): Promise<OrgMember[]> {
    return db.select().from(orgMembers);
  }

  async getAllClaims(): Promise<Claim[]> {
    return db.select().from(claims);
  }

  async getTotalClaimCount(): Promise<number> {
    const result = await db.select({ count: count() }).from(claims);
    return result[0]?.count ?? 0;
  }

  async setUserAdmin(userId: string, isAdmin: boolean): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ isAdmin }).where(eq(users.id, userId)).returning();
    return updated;
  }

  async updateUserTier(orgId: string, tier: string): Promise<Subscription | undefined> {
    const [updated] = await db.update(subscriptions).set({ tier: tier as any }).where(eq(subscriptions.orgId, orgId)).returning();
    return updated;
  }

  async setPlatformOwner(userId: string, isOwner: boolean): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ isPlatformOwner: isOwner }).where(eq(users.id, userId)).returning();
    return updated;
  }

  async createAuditLog(adminUserId: string, targetUserId: string, actionType: "IMPERSONATION_START" | "IMPERSONATION_END", ipAddress: string, metadata?: string): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values({
      adminUserId,
      targetUserId,
      actionType,
      ipAddress,
      metadata,
    }).returning();
    return created;
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  }

  async createImpersonationSession(adminUserId: string, targetUserId: string, targetOrgId: string, token: string, expiresAt: Date): Promise<ImpersonationSession> {
    const [created] = await db.insert(impersonationSessions).values({
      adminUserId,
      targetUserId,
      targetOrgId,
      token,
      expiresAt,
      active: true,
    }).returning();
    return created;
  }

  async getActiveImpersonationSession(token: string): Promise<ImpersonationSession | undefined> {
    const [session] = await db.select().from(impersonationSessions).where(
      and(
        eq(impersonationSessions.token, token),
        eq(impersonationSessions.active, true),
        gt(impersonationSessions.expiresAt, new Date())
      )
    );
    return session;
  }

  async getActiveSessionByAdmin(adminUserId: string): Promise<ImpersonationSession | undefined> {
    const [session] = await db.select().from(impersonationSessions).where(
      and(
        eq(impersonationSessions.adminUserId, adminUserId),
        eq(impersonationSessions.active, true),
        gt(impersonationSessions.expiresAt, new Date())
      )
    );
    return session;
  }

  async deactivateImpersonationSession(id: string): Promise<void> {
    await db.update(impersonationSessions).set({ active: false }).where(eq(impersonationSessions.id, id));
  }

  async deactivateAllAdminSessions(adminUserId: string): Promise<void> {
    await db.update(impersonationSessions).set({ active: false }).where(
      and(
        eq(impersonationSessions.adminUserId, adminUserId),
        eq(impersonationSessions.active, true)
      )
    );
  }
}

export const storage = new DatabaseStorage();
