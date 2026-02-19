import {
  type Organization, type InsertOrganization,
  type User, type InsertUser,
  type UserSession,
  type BillingAccount, type InsertBillingAccount,
  type Claim, type InsertClaim,
  type ClaimVersion,
  type Adjuster, type InsertAdjuster,
  type AdjusterMetrics,
  type FounderAgreement,
  type AuditLog,
  organizations, users, userSessions, billingAccounts,
  claims, claimVersions, adjusters, adjusterMetrics,
  founderAgreements, auditLogs,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, count, desc, gt, isNull, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;
  getAllOrganizations(): Promise<Organization[]>;

  createSession(data: {
    userId: string;
    organizationId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
    isImpersonation?: boolean;
    impersonatorUserId?: string;
  }): Promise<UserSession>;
  getSessionById(id: string): Promise<UserSession | undefined>;
  getSessionByTokenHash(hash: string): Promise<UserSession | undefined>;
  updateSession(id: string, data: Partial<UserSession>): Promise<void>;
  revokeSession(id: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
  getActiveSessionsByUser(userId: string): Promise<UserSession[]>;

  createBillingAccount(data: InsertBillingAccount): Promise<BillingAccount>;
  getBillingAccountByOrg(orgId: string): Promise<BillingAccount | undefined>;
  updateBillingAccount(id: string, data: Partial<BillingAccount>): Promise<BillingAccount | undefined>;
  getAllBillingAccounts(): Promise<BillingAccount[]>;

  getClaims(orgId: string): Promise<Claim[]>;
  getClaim(id: string, orgId: string): Promise<Claim | undefined>;
  createClaim(claim: InsertClaim): Promise<Claim>;
  updateClaim(id: string, orgId: string, data: Partial<InsertClaim>): Promise<Claim | undefined>;
  softDeleteClaim(id: string, orgId: string): Promise<boolean>;
  getClaimCount(orgId: string): Promise<number>;
  getOpenClaimCount(orgId: string): Promise<number>;
  getTotalClaimCount(): Promise<number>;

  createClaimVersion(data: {
    claimId: string;
    organizationId: string;
    versionNumber: number;
    changedByUserId: string;
    changeReason?: string;
    snapshotJson: any;
  }): Promise<ClaimVersion>;
  getClaimVersions(claimId: string, orgId: string): Promise<ClaimVersion[]>;
  getLatestVersionNumber(claimId: string): Promise<number>;

  getAdjusters(orgId: string): Promise<Adjuster[]>;
  getAdjuster(id: string, orgId: string): Promise<Adjuster | undefined>;
  createAdjuster(adjuster: InsertAdjuster): Promise<Adjuster>;
  updateAdjuster(id: string, orgId: string, data: Partial<InsertAdjuster>): Promise<Adjuster | undefined>;
  getAdjusterCount(orgId: string): Promise<number>;

  getAdjusterMetrics(adjusterId: string, orgId: string): Promise<AdjusterMetrics | undefined>;
  upsertAdjusterMetrics(data: {
    adjusterId: string;
    organizationId: string;
    totalClaims?: number;
    denialRate?: number;
    supplementApprovalRate?: number;
    averageDaysToClose?: number;
    averageInitialPayout?: number;
    averageSupplementIncrease?: number;
    escalationFrequency?: number;
  }): Promise<AdjusterMetrics>;

  createFounderAgreement(orgId: string, userId: string, ip: string, version: string, hash: string): Promise<FounderAgreement>;
  getFounderAgreement(orgId: string): Promise<FounderAgreement | undefined>;

  getFounderSubscriptionCount(): Promise<number>;

  createAuditLog(data: {
    organizationId?: string;
    actorUserId: string;
    actorRole?: string;
    isImpersonation?: boolean;
    impersonatorUserId?: string;
    targetUserId?: string;
    actionType: string;
    entityType?: string;
    entityId?: string;
    beforeJson?: any;
    afterJson?: any;
    ipAddress?: string;
  }): Promise<AuditLog>;
  getAuditLogs(orgId?: string): Promise<AuditLog[]>;
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

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return updated;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [created] = await db.insert(organizations).values(org).returning();
    return created;
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations);
  }

  async createSession(data: {
    userId: string;
    organizationId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
    isImpersonation?: boolean;
    impersonatorUserId?: string;
  }): Promise<UserSession> {
    const [created] = await db.insert(userSessions).values(data).returning();
    return created;
  }

  async getSessionById(id: string): Promise<UserSession | undefined> {
    const [session] = await db.select().from(userSessions).where(eq(userSessions.id, id));
    return session;
  }

  async getSessionByTokenHash(hash: string): Promise<UserSession | undefined> {
    const [session] = await db.select().from(userSessions).where(
      and(
        eq(userSessions.refreshTokenHash, hash),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date())
      )
    );
    return session;
  }

  async updateSession(id: string, data: Partial<UserSession>): Promise<void> {
    await db.update(userSessions).set(data).where(eq(userSessions.id, id));
  }

  async revokeSession(id: string): Promise<void> {
    await db.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.id, id));
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await db.update(userSessions).set({ revokedAt: new Date() }).where(
      and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt))
    );
  }

  async getActiveSessionsByUser(userId: string): Promise<UserSession[]> {
    return db.select().from(userSessions).where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date())
      )
    );
  }

  async createBillingAccount(data: InsertBillingAccount): Promise<BillingAccount> {
    const [created] = await db.insert(billingAccounts).values(data).returning();
    return created;
  }

  async getBillingAccountByOrg(orgId: string): Promise<BillingAccount | undefined> {
    const [account] = await db.select().from(billingAccounts).where(eq(billingAccounts.organizationId, orgId));
    return account;
  }

  async updateBillingAccount(id: string, data: Partial<BillingAccount>): Promise<BillingAccount | undefined> {
    const [updated] = await db.update(billingAccounts).set({ ...data, updatedAt: new Date() }).where(eq(billingAccounts.id, id)).returning();
    return updated;
  }

  async getAllBillingAccounts(): Promise<BillingAccount[]> {
    return db.select().from(billingAccounts);
  }

  async getClaims(orgId: string): Promise<Claim[]> {
    return db.select().from(claims).where(
      and(eq(claims.organizationId, orgId), isNull(claims.deletedAt))
    ).orderBy(desc(claims.createdAt));
  }

  async getClaim(id: string, orgId: string): Promise<Claim | undefined> {
    const [claim] = await db.select().from(claims).where(
      and(eq(claims.id, id), eq(claims.organizationId, orgId), isNull(claims.deletedAt))
    );
    return claim;
  }

  async createClaim(claim: InsertClaim): Promise<Claim> {
    const [created] = await db.insert(claims).values(claim).returning();
    return created;
  }

  async updateClaim(id: string, orgId: string, data: Partial<InsertClaim>): Promise<Claim | undefined> {
    const [updated] = await db.update(claims).set({ ...data, updatedAt: new Date() }).where(
      and(eq(claims.id, id), eq(claims.organizationId, orgId), isNull(claims.deletedAt))
    ).returning();
    return updated;
  }

  async softDeleteClaim(id: string, orgId: string): Promise<boolean> {
    const result = await db.update(claims).set({ deletedAt: new Date() }).where(
      and(eq(claims.id, id), eq(claims.organizationId, orgId), isNull(claims.deletedAt))
    ).returning();
    return result.length > 0;
  }

  async getClaimCount(orgId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(claims).where(
      and(eq(claims.organizationId, orgId), isNull(claims.deletedAt))
    );
    return result[0]?.count ?? 0;
  }

  async getOpenClaimCount(orgId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(claims).where(
      and(eq(claims.organizationId, orgId), eq(claims.status, "open"), isNull(claims.deletedAt))
    );
    return result[0]?.count ?? 0;
  }

  async getTotalClaimCount(): Promise<number> {
    const result = await db.select({ count: count() }).from(claims).where(isNull(claims.deletedAt));
    return result[0]?.count ?? 0;
  }

  async createClaimVersion(data: {
    claimId: string;
    organizationId: string;
    versionNumber: number;
    changedByUserId: string;
    changeReason?: string;
    snapshotJson: any;
  }): Promise<ClaimVersion> {
    const [created] = await db.insert(claimVersions).values(data).returning();
    return created;
  }

  async getClaimVersions(claimId: string, orgId: string): Promise<ClaimVersion[]> {
    return db.select().from(claimVersions).where(
      and(eq(claimVersions.claimId, claimId), eq(claimVersions.organizationId, orgId))
    ).orderBy(desc(claimVersions.versionNumber));
  }

  async getLatestVersionNumber(claimId: string): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(${claimVersions.versionNumber}), 0)` })
      .from(claimVersions).where(eq(claimVersions.claimId, claimId));
    return result?.max ?? 0;
  }

  async getAdjusters(orgId: string): Promise<Adjuster[]> {
    return db.select().from(adjusters).where(eq(adjusters.organizationId, orgId));
  }

  async getAdjuster(id: string, orgId: string): Promise<Adjuster | undefined> {
    const [adjuster] = await db.select().from(adjusters).where(
      and(eq(adjusters.id, id), eq(adjusters.organizationId, orgId))
    );
    return adjuster;
  }

  async createAdjuster(adjuster: InsertAdjuster): Promise<Adjuster> {
    const [created] = await db.insert(adjusters).values(adjuster).returning();
    return created;
  }

  async updateAdjuster(id: string, orgId: string, data: Partial<InsertAdjuster>): Promise<Adjuster | undefined> {
    const [updated] = await db.update(adjusters).set({ ...data, updatedAt: new Date() }).where(
      and(eq(adjusters.id, id), eq(adjusters.organizationId, orgId))
    ).returning();
    return updated;
  }

  async getAdjusterCount(orgId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(adjusters).where(eq(adjusters.organizationId, orgId));
    return result[0]?.count ?? 0;
  }

  async getAdjusterMetrics(adjusterId: string, orgId: string): Promise<AdjusterMetrics | undefined> {
    const [metrics] = await db.select().from(adjusterMetrics).where(
      and(eq(adjusterMetrics.adjusterId, adjusterId), eq(adjusterMetrics.organizationId, orgId))
    );
    return metrics;
  }

  async upsertAdjusterMetrics(data: {
    adjusterId: string;
    organizationId: string;
    totalClaims?: number;
    denialRate?: number;
    supplementApprovalRate?: number;
    averageDaysToClose?: number;
    averageInitialPayout?: number;
    averageSupplementIncrease?: number;
    escalationFrequency?: number;
  }): Promise<AdjusterMetrics> {
    const existing = await this.getAdjusterMetrics(data.adjusterId, data.organizationId);
    if (existing) {
      const [updated] = await db.update(adjusterMetrics)
        .set({ ...data, lastUpdated: new Date() })
        .where(eq(adjusterMetrics.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(adjusterMetrics).values(data).returning();
    return created;
  }

  async createFounderAgreement(orgId: string, userId: string, ip: string, version: string, hash: string): Promise<FounderAgreement> {
    const [created] = await db.insert(founderAgreements).values({
      organizationId: orgId, userId, ip, version, agreementHash: hash,
    }).returning();
    return created;
  }

  async getFounderAgreement(orgId: string): Promise<FounderAgreement | undefined> {
    const [agreement] = await db.select().from(founderAgreements).where(eq(founderAgreements.organizationId, orgId));
    return agreement;
  }

  async getFounderSubscriptionCount(): Promise<number> {
    const result = await db.select({ count: count() }).from(billingAccounts).where(
      and(
        eq(billingAccounts.planType, "founder"),
        sql`${billingAccounts.subscriptionStatus} IN ('active', 'trialing')`
      )
    );
    return result[0]?.count ?? 0;
  }

  async createAuditLog(data: {
    organizationId?: string;
    actorUserId: string;
    actorRole?: string;
    isImpersonation?: boolean;
    impersonatorUserId?: string;
    targetUserId?: string;
    actionType: string;
    entityType?: string;
    entityId?: string;
    beforeJson?: any;
    afterJson?: any;
    ipAddress?: string;
  }): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(data).returning();
    return created;
  }

  async getAuditLogs(orgId?: string): Promise<AuditLog[]> {
    if (orgId) {
      return db.select().from(auditLogs).where(eq(auditLogs.organizationId, orgId)).orderBy(desc(auditLogs.timestamp)).limit(200);
    }
    return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(200);
  }
}

export const storage = new DatabaseStorage();
