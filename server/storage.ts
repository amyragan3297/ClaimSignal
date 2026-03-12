import {
  type Organization, type InsertOrganization,
  type User, type InsertUser,
  type UserSession,
  type BillingAccount, type InsertBillingAccount,
  type Claim, type InsertClaim,
  type ClaimVersion,
  type Adjuster, type InsertAdjuster,
  type Client, type InsertClient,
  type Supplement, type InsertSupplement,
  type Document, type InsertDocument,
  type Email, type InsertEmail,
  type AiInsight, type InsertAiInsight,
  type FounderAgreement,
  type AuditLog,
  type EvidenceFile, type InsertEvidenceFile,
  type ExtractedEntity, type InsertExtractedEntity,
  type ClaimDraft, type InsertClaimDraft,
  type AudioRecording, type InsertAudioRecording,
  type TimelineEvent, type InsertTimelineEvent,
  type AdjusterAggregatedMetric, type InsertAdjusterAggregatedMetric,
  type AdjusterPlaybook, type InsertAdjusterPlaybook,
  type IrcCode, type InsertIrcCode,
  type SupplementTrigger, type InsertSupplementTrigger,
  type PiiAccessLog, type InsertPiiAccessLog,
  type SupplementIntelligence, type InsertSupplementIntelligence,
  type AdjusterIrcBehavior, type InsertAdjusterIrcBehavior,
  type CommunicationSignal, type InsertCommunicationSignal,
  type PlaybookInsight, type InsertPlaybookInsight,
  type ScoringWeight, type InsertScoringWeight,
  type IntelligenceEvent, type InsertIntelligenceEvent,
  organizations, users, userSessions, billingAccounts,
  claims, claimVersions, adjusters,
  clients, supplements, documents, emails, aiInsights,
  founderAgreements, auditLogs,
  evidenceFiles, extractedEntities, claimDrafts, audioRecordings, timelineEvents,
  adjusterPlaybooks, ircCodes, supplementTriggers, piiAccessLogs,
  adjusterAggregatedMetrics,
  supplementIntelligence, adjusterIrcBehavior, communicationSignals, playbookInsights,
  scoringWeights, intelligenceEvents,
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
  getAllClaimsAcrossTenants(): Promise<Claim[]>;
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
  getAllAdjustersAcrossTenants(): Promise<Adjuster[]>;
  getAdjuster(id: string, orgId: string): Promise<Adjuster | undefined>;
  createAdjuster(adjuster: InsertAdjuster): Promise<Adjuster>;
  updateAdjuster(id: string, orgId: string, data: Partial<InsertAdjuster>): Promise<Adjuster | undefined>;
  getAdjusterCount(orgId: string): Promise<number>;

  getClients(orgId: string): Promise<Client[]>;
  getClient(id: string, orgId: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, orgId: string, data: Partial<InsertClient>): Promise<Client | undefined>;

  getSupplements(claimId: string, orgId: string): Promise<Supplement[]>;
  getSupplement(id: string, orgId: string): Promise<Supplement | undefined>;
  createSupplement(supplement: InsertSupplement): Promise<Supplement>;
  updateSupplement(id: string, orgId: string, data: Partial<InsertSupplement>): Promise<Supplement | undefined>;

  getDocuments(claimId: string, orgId: string): Promise<Document[]>;
  createDocument(doc: InsertDocument): Promise<Document>;

  getEmails(claimId: string, orgId: string): Promise<Email[]>;
  createEmail(email: InsertEmail): Promise<Email>;

  getAiInsights(claimId: string, orgId: string): Promise<AiInsight[]>;
  createAiInsight(insight: InsertAiInsight): Promise<AiInsight>;

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

  getEvidenceFiles(orgId: string, claimId?: string): Promise<EvidenceFile[]>;
  getEvidenceFile(id: string, orgId: string): Promise<EvidenceFile | undefined>;
  getEvidenceFileBySha256(sha256: string, orgId: string): Promise<EvidenceFile | undefined>;
  createEvidenceFile(file: InsertEvidenceFile): Promise<EvidenceFile>;
  updateEvidenceFile(id: string, orgId: string, data: Partial<EvidenceFile>): Promise<EvidenceFile | undefined>;

  getExtractedEntities(evidenceFileId: string): Promise<ExtractedEntity[]>;
  getExtractedEntitiesByClaim(claimId: string): Promise<ExtractedEntity[]>;
  createExtractedEntity(entity: InsertExtractedEntity): Promise<ExtractedEntity>;

  getClaimDrafts(orgId: string): Promise<ClaimDraft[]>;
  getClaimDraft(id: string, orgId: string): Promise<ClaimDraft | undefined>;
  createClaimDraft(draft: InsertClaimDraft): Promise<ClaimDraft>;
  updateClaimDraft(id: string, orgId: string, data: Partial<ClaimDraft>): Promise<ClaimDraft | undefined>;

  getAudioRecordings(claimId: string, orgId: string): Promise<AudioRecording[]>;
  createAudioRecording(recording: InsertAudioRecording): Promise<AudioRecording>;
  updateAudioRecording(id: string, orgId: string, data: Partial<AudioRecording>): Promise<AudioRecording | undefined>;

  getTimelineEvents(claimId: string, orgId: string): Promise<TimelineEvent[]>;
  createTimelineEvent(event: InsertTimelineEvent): Promise<TimelineEvent>;

  // Adjuster Playbooks
  getAdjusterPlaybook(adjusterId: string, orgId: string): Promise<AdjusterPlaybook | undefined>;
  createAdjusterPlaybook(playbook: InsertAdjusterPlaybook): Promise<AdjusterPlaybook>;
  updateAdjusterPlaybook(id: string, orgId: string, data: Partial<AdjusterPlaybook>): Promise<AdjusterPlaybook | undefined>;

  // IRC Codes
  getIrcCodes(): Promise<IrcCode[]>;
  getIrcCode(id: string): Promise<IrcCode | undefined>;
  createIrcCode(code: InsertIrcCode): Promise<IrcCode>;

  // Supplement Triggers
  getSupplementTriggers(claimId: string): Promise<SupplementTrigger[]>;
  createSupplementTrigger(trigger: InsertSupplementTrigger): Promise<SupplementTrigger>;

  // PII Access Logs
  createPiiAccessLog(log: InsertPiiAccessLog): Promise<PiiAccessLog>;
  getPiiAccessLogs(claimId: string): Promise<PiiAccessLog[]>;

  // Aggregated Metrics (Layer 2)
  getAggregatedMetrics(filters?: { carrier?: string; region?: string; timePeriod?: string }): Promise<AdjusterAggregatedMetric[]>;
  getAggregatedMetricsByAdjuster(adjusterName: string, carrier: string): Promise<AdjusterAggregatedMetric[]>;
  upsertAggregatedMetric(metric: InsertAdjusterAggregatedMetric): Promise<AdjusterAggregatedMetric>;
  deleteAggregatedMetricsByPeriod(timePeriod: string): Promise<void>;

  // Supplement Intelligence
  getSupplementIntelligence(claimId: string, orgId: string): Promise<SupplementIntelligence[]>;
  createSupplementIntelligence(data: InsertSupplementIntelligence): Promise<SupplementIntelligence>;

  // Adjuster IRC Behavior
  getAdjusterIrcBehaviors(adjusterId: string, orgId: string): Promise<AdjusterIrcBehavior[]>;
  getAdjusterIrcBehaviorByCode(adjusterId: string, ircCodeRef: string, orgId: string): Promise<AdjusterIrcBehavior | undefined>;
  upsertAdjusterIrcBehavior(data: InsertAdjusterIrcBehavior): Promise<AdjusterIrcBehavior>;

  // Communication Signals
  getCommunicationSignals(claimId: string, orgId: string): Promise<CommunicationSignal[]>;
  getCommunicationSignalsByAdjuster(adjusterId: string, orgId: string): Promise<CommunicationSignal[]>;
  createCommunicationSignal(signal: InsertCommunicationSignal): Promise<CommunicationSignal>;

  // Playbook Insights
  getPlaybookInsights(adjusterId: string, orgId: string): Promise<PlaybookInsight[]>;
  createPlaybookInsight(insight: InsertPlaybookInsight): Promise<PlaybookInsight>;

  // Scoring Weights
  getScoringWeights(activeVersion?: string): Promise<ScoringWeight[]>;
  upsertScoringWeight(data: InsertScoringWeight): Promise<ScoringWeight>;

  // Intelligence Events
  createIntelligenceEvent(event: InsertIntelligenceEvent): Promise<IntelligenceEvent>;
  getIntelligenceEventsByClaim(claimId: string, orgId: string): Promise<IntelligenceEvent[]>;
  getIntelligenceEventsByAdjuster(adjusterId: string, orgId: string): Promise<IntelligenceEvent[]>;
  getIntelligenceEventsByAdjusterAllOrgs(adjusterId: string): Promise<IntelligenceEvent[]>;
  getIntelligenceEventsByCategory(claimId: string, orgId: string, category: string): Promise<IntelligenceEvent[]>;
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

  async getAllClaimsAcrossTenants(): Promise<Claim[]> {
    return db.select().from(claims).where(isNull(claims.deletedAt)).orderBy(desc(claims.createdAt));
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

  async getAllAdjustersAcrossTenants(): Promise<Adjuster[]> {
    return db.select().from(adjusters);
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

  async getClients(orgId: string): Promise<Client[]> {
    return db.select().from(clients).where(eq(clients.organizationId, orgId));
  }

  async getClient(id: string, orgId: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.organizationId, orgId)));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [created] = await db.insert(clients).values(client).returning();
    return created;
  }

  async updateClient(id: string, orgId: string, data: Partial<InsertClient>): Promise<Client | undefined> {
    const [updated] = await db.update(clients).set(data).where(and(eq(clients.id, id), eq(clients.organizationId, orgId))).returning();
    return updated;
  }

  async getSupplements(claimId: string, orgId: string): Promise<Supplement[]> {
    return db.select().from(supplements).where(and(eq(supplements.claimId, claimId), eq(supplements.organizationId, orgId)));
  }

  async getSupplement(id: string, orgId: string): Promise<Supplement | undefined> {
    const [supplement] = await db.select().from(supplements).where(and(eq(supplements.id, id), eq(supplements.organizationId, orgId)));
    return supplement;
  }

  async createSupplement(supplement: InsertSupplement): Promise<Supplement> {
    const [created] = await db.insert(supplements).values(supplement).returning();
    return created;
  }

  async updateSupplement(id: string, orgId: string, data: Partial<InsertSupplement>): Promise<Supplement | undefined> {
    const [updated] = await db.update(supplements).set(data).where(and(eq(supplements.id, id), eq(supplements.organizationId, orgId))).returning();
    return updated;
  }

  async getDocuments(claimId: string, orgId: string): Promise<Document[]> {
    return db.select().from(documents).where(and(eq(documents.claimId, claimId), eq(documents.organizationId, orgId)));
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values(doc).returning();
    return created;
  }

  async getEmails(claimId: string, orgId: string): Promise<Email[]> {
    return db.select().from(emails).where(and(eq(emails.claimId, claimId), eq(emails.organizationId, orgId)));
  }

  async createEmail(email: InsertEmail): Promise<Email> {
    const [created] = await db.insert(emails).values(email).returning();
    return created;
  }

  async getAiInsights(claimId: string, orgId: string): Promise<AiInsight[]> {
    return db.select().from(aiInsights).where(and(eq(aiInsights.claimId, claimId), eq(aiInsights.organizationId, orgId)));
  }

  async createAiInsight(insight: InsertAiInsight): Promise<AiInsight> {
    const [created] = await db.insert(aiInsights).values(insight).returning();
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

  async getAdjusterPlaybook(adjusterId: string, orgId: string): Promise<AdjusterPlaybook | undefined> {
    const [playbook] = await db.select().from(adjusterPlaybooks).where(
      and(eq(adjusterPlaybooks.adjusterId, adjusterId), eq(adjusterPlaybooks.organizationId, orgId))
    );
    return playbook;
  }

  async createAdjusterPlaybook(playbook: InsertAdjusterPlaybook): Promise<AdjusterPlaybook> {
    const [created] = await db.insert(adjusterPlaybooks).values(playbook).returning();
    return created;
  }

  async updateAdjusterPlaybook(id: string, orgId: string, data: Partial<AdjusterPlaybook>): Promise<AdjusterPlaybook | undefined> {
    const [updated] = await db.update(adjusterPlaybooks).set(data).where(
      and(eq(adjusterPlaybooks.id, id), eq(adjusterPlaybooks.organizationId, orgId))
    ).returning();
    return updated;
  }

  async getIrcCodes(): Promise<IrcCode[]> {
    return db.select().from(ircCodes);
  }

  async getIrcCode(id: string): Promise<IrcCode | undefined> {
    const [code] = await db.select().from(ircCodes).where(eq(ircCodes.id, id));
    return code;
  }

  async createIrcCode(code: InsertIrcCode): Promise<IrcCode> {
    const [created] = await db.insert(ircCodes).values(code).returning();
    return created;
  }

  async getSupplementTriggers(claimId: string): Promise<SupplementTrigger[]> {
    return db.select().from(supplementTriggers).where(eq(supplementTriggers.claimId, claimId)).orderBy(desc(supplementTriggers.createdAt));
  }

  async createSupplementTrigger(trigger: InsertSupplementTrigger): Promise<SupplementTrigger> {
    const [created] = await db.insert(supplementTriggers).values(trigger).returning();
    return created;
  }

  async createPiiAccessLog(log: InsertPiiAccessLog): Promise<PiiAccessLog> {
    const [created] = await db.insert(piiAccessLogs).values(log).returning();
    return created;
  }

  async getPiiAccessLogs(claimId: string): Promise<PiiAccessLog[]> {
    return db.select().from(piiAccessLogs).where(eq(piiAccessLogs.claimId, claimId)).orderBy(desc(piiAccessLogs.timestamp));
  }

  async getEvidenceFiles(orgId: string, claimId?: string): Promise<EvidenceFile[]> {
    if (claimId) {
      return db.select().from(evidenceFiles).where(
        and(eq(evidenceFiles.organizationId, orgId), eq(evidenceFiles.claimId, claimId))
      ).orderBy(desc(evidenceFiles.uploadedAt));
    }
    return db.select().from(evidenceFiles).where(eq(evidenceFiles.organizationId, orgId)).orderBy(desc(evidenceFiles.uploadedAt));
  }

  async getEvidenceFile(id: string, orgId: string): Promise<EvidenceFile | undefined> {
    const [file] = await db.select().from(evidenceFiles).where(
      and(eq(evidenceFiles.id, id), eq(evidenceFiles.organizationId, orgId))
    );
    return file;
  }

  async getEvidenceFileBySha256(sha256: string, orgId: string): Promise<EvidenceFile | undefined> {
    const [file] = await db.select().from(evidenceFiles).where(
      and(eq(evidenceFiles.sha256, sha256), eq(evidenceFiles.organizationId, orgId))
    );
    return file;
  }

  async createEvidenceFile(file: InsertEvidenceFile): Promise<EvidenceFile> {
    const [created] = await db.insert(evidenceFiles).values(file).returning();
    return created;
  }

  async updateEvidenceFile(id: string, orgId: string, data: Partial<EvidenceFile>): Promise<EvidenceFile | undefined> {
    const [updated] = await db.update(evidenceFiles).set(data).where(
      and(eq(evidenceFiles.id, id), eq(evidenceFiles.organizationId, orgId))
    ).returning();
    return updated;
  }

  async getExtractedEntities(evidenceFileId: string): Promise<ExtractedEntity[]> {
    return db.select().from(extractedEntities).where(eq(extractedEntities.evidenceFileId, evidenceFileId));
  }

  async getExtractedEntitiesByClaim(claimId: string): Promise<ExtractedEntity[]> {
    return db.select().from(extractedEntities).where(eq(extractedEntities.claimId, claimId));
  }

  async createExtractedEntity(entity: InsertExtractedEntity): Promise<ExtractedEntity> {
    const [created] = await db.insert(extractedEntities).values(entity).returning();
    return created;
  }

  async getClaimDrafts(orgId: string): Promise<ClaimDraft[]> {
    return db.select().from(claimDrafts).where(eq(claimDrafts.organizationId, orgId)).orderBy(desc(claimDrafts.createdAt));
  }

  async getClaimDraft(id: string, orgId: string): Promise<ClaimDraft | undefined> {
    const [draft] = await db.select().from(claimDrafts).where(
      and(eq(claimDrafts.id, id), eq(claimDrafts.organizationId, orgId))
    );
    return draft;
  }

  async createClaimDraft(draft: InsertClaimDraft): Promise<ClaimDraft> {
    const [created] = await db.insert(claimDrafts).values(draft).returning();
    return created;
  }

  async updateClaimDraft(id: string, orgId: string, data: Partial<ClaimDraft>): Promise<ClaimDraft | undefined> {
    const [updated] = await db.update(claimDrafts).set(data).where(
      and(eq(claimDrafts.id, id), eq(claimDrafts.organizationId, orgId))
    ).returning();
    return updated;
  }

  async getAudioRecordings(claimId: string, orgId: string): Promise<AudioRecording[]> {
    return db.select().from(audioRecordings).where(
      and(eq(audioRecordings.claimId, claimId), eq(audioRecordings.organizationId, orgId))
    );
  }

  async createAudioRecording(recording: InsertAudioRecording): Promise<AudioRecording> {
    const [created] = await db.insert(audioRecordings).values(recording).returning();
    return created;
  }

  async updateAudioRecording(id: string, orgId: string, data: Partial<AudioRecording>): Promise<AudioRecording | undefined> {
    const [updated] = await db.update(audioRecordings).set(data).where(
      and(eq(audioRecordings.id, id), eq(audioRecordings.organizationId, orgId))
    ).returning();
    return updated;
  }

  async getTimelineEvents(claimId: string, orgId: string): Promise<TimelineEvent[]> {
    return db.select().from(timelineEvents).where(
      and(eq(timelineEvents.claimId, claimId), eq(timelineEvents.organizationId, orgId))
    ).orderBy(desc(timelineEvents.eventDate));
  }

  async createTimelineEvent(event: InsertTimelineEvent): Promise<TimelineEvent> {
    const [created] = await db.insert(timelineEvents).values(event).returning();
    return created;
  }

  async getAggregatedMetrics(filters?: { carrier?: string; region?: string; timePeriod?: string }): Promise<AdjusterAggregatedMetric[]> {
    let conditions = [];
    if (filters?.carrier) conditions.push(eq(adjusterAggregatedMetrics.carrier, filters.carrier));
    if (filters?.region) conditions.push(eq(adjusterAggregatedMetrics.region, filters.region));
    if (filters?.timePeriod) conditions.push(eq(adjusterAggregatedMetrics.timePeriod, filters.timePeriod));
    
    if (conditions.length === 0) {
      return db.select().from(adjusterAggregatedMetrics).orderBy(desc(adjusterAggregatedMetrics.computedAt));
    }
    return db.select().from(adjusterAggregatedMetrics).where(and(...conditions)).orderBy(desc(adjusterAggregatedMetrics.computedAt));
  }

  async getAggregatedMetricsByAdjuster(adjusterName: string, carrier: string): Promise<AdjusterAggregatedMetric[]> {
    return db.select().from(adjusterAggregatedMetrics).where(
      and(eq(adjusterAggregatedMetrics.adjusterName, adjusterName), eq(adjusterAggregatedMetrics.carrier, carrier))
    ).orderBy(desc(adjusterAggregatedMetrics.computedAt));
  }

  async upsertAggregatedMetric(metric: InsertAdjusterAggregatedMetric): Promise<AdjusterAggregatedMetric> {
    const [created] = await db.insert(adjusterAggregatedMetrics).values(metric).returning();
    return created;
  }

  async deleteAggregatedMetricsByPeriod(timePeriod: string): Promise<void> {
    await db.delete(adjusterAggregatedMetrics).where(eq(adjusterAggregatedMetrics.timePeriod, timePeriod));
  }

  async getSupplementIntelligence(claimId: string, orgId: string): Promise<SupplementIntelligence[]> {
    return db.select().from(supplementIntelligence).where(
      and(eq(supplementIntelligence.claimId, claimId), eq(supplementIntelligence.organizationId, orgId))
    );
  }

  async createSupplementIntelligence(data: InsertSupplementIntelligence): Promise<SupplementIntelligence> {
    const [created] = await db.insert(supplementIntelligence).values(data).returning();
    return created;
  }

  async getAdjusterIrcBehaviors(adjusterId: string, orgId: string): Promise<AdjusterIrcBehavior[]> {
    return db.select().from(adjusterIrcBehavior).where(
      and(eq(adjusterIrcBehavior.adjusterId, adjusterId), eq(adjusterIrcBehavior.organizationId, orgId))
    );
  }

  async getAdjusterIrcBehaviorByCode(adjusterId: string, ircCodeRef: string, orgId: string): Promise<AdjusterIrcBehavior | undefined> {
    const [row] = await db.select().from(adjusterIrcBehavior).where(
      and(
        eq(adjusterIrcBehavior.adjusterId, adjusterId),
        eq(adjusterIrcBehavior.ircCodeReference, ircCodeRef),
        eq(adjusterIrcBehavior.organizationId, orgId)
      )
    );
    return row;
  }

  async upsertAdjusterIrcBehavior(data: InsertAdjusterIrcBehavior): Promise<AdjusterIrcBehavior> {
    const [created] = await db.insert(adjusterIrcBehavior).values(data).returning();
    return created;
  }

  async getCommunicationSignals(claimId: string, orgId: string): Promise<CommunicationSignal[]> {
    return db.select().from(communicationSignals).where(
      and(eq(communicationSignals.claimId, claimId), eq(communicationSignals.organizationId, orgId))
    );
  }

  async getCommunicationSignalsByAdjuster(adjusterId: string, orgId: string): Promise<CommunicationSignal[]> {
    return db.select().from(communicationSignals).where(
      and(eq(communicationSignals.adjusterId, adjusterId), eq(communicationSignals.organizationId, orgId))
    );
  }

  async createCommunicationSignal(signal: InsertCommunicationSignal): Promise<CommunicationSignal> {
    const [created] = await db.insert(communicationSignals).values(signal).returning();
    return created;
  }

  async getPlaybookInsights(adjusterId: string, orgId: string): Promise<PlaybookInsight[]> {
    return db.select().from(playbookInsights).where(
      and(eq(playbookInsights.adjusterId, adjusterId), eq(playbookInsights.organizationId, orgId))
    );
  }

  async createPlaybookInsight(insight: InsertPlaybookInsight): Promise<PlaybookInsight> {
    const [created] = await db.insert(playbookInsights).values(insight).returning();
    return created;
  }

  async getScoringWeights(activeVersion?: string): Promise<ScoringWeight[]> {
    if (activeVersion) {
      return db.select().from(scoringWeights).where(eq(scoringWeights.activeVersion, activeVersion));
    }
    return db.select().from(scoringWeights);
  }

  async upsertScoringWeight(data: InsertScoringWeight): Promise<ScoringWeight> {
    const [created] = await db.insert(scoringWeights).values(data).returning();
    return created;
  }

  async createIntelligenceEvent(event: InsertIntelligenceEvent): Promise<IntelligenceEvent> {
    const [created] = await db.insert(intelligenceEvents).values(event).returning();
    return created;
  }

  async getIntelligenceEventsByClaim(claimId: string, orgId: string): Promise<IntelligenceEvent[]> {
    return db.select().from(intelligenceEvents).where(
      and(eq(intelligenceEvents.claimId, claimId), eq(intelligenceEvents.organizationId, orgId))
    ).orderBy(desc(intelligenceEvents.createdAt));
  }

  async getIntelligenceEventsByAdjuster(adjusterId: string, orgId: string): Promise<IntelligenceEvent[]> {
    return db.select().from(intelligenceEvents).where(
      and(eq(intelligenceEvents.adjusterId, adjusterId), eq(intelligenceEvents.organizationId, orgId))
    ).orderBy(desc(intelligenceEvents.createdAt));
  }

  async getIntelligenceEventsByAdjusterAllOrgs(adjusterId: string): Promise<IntelligenceEvent[]> {
    return db.select().from(intelligenceEvents).where(
      eq(intelligenceEvents.adjusterId, adjusterId)
    ).orderBy(desc(intelligenceEvents.createdAt));
  }

  async getIntelligenceEventsByCategory(claimId: string, orgId: string, category: string): Promise<IntelligenceEvent[]> {
    return db.select().from(intelligenceEvents).where(
      and(
        eq(intelligenceEvents.claimId, claimId),
        eq(intelligenceEvents.organizationId, orgId),
        eq(intelligenceEvents.eventCategory, category as any)
      )
    ).orderBy(desc(intelligenceEvents.createdAt));
  }
}

export const storage = new DatabaseStorage();
