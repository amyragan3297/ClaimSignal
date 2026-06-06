import {
  type StormEvent, type InsertStormEvent,
  type Organization, type InsertOrganization,
  type User, type InsertUser,
  type UserSession,
  type BillingAccount, type InsertBillingAccount,
  type Claim, type InsertClaim,
  type ClaimVersion,
  type Adjuster, type InsertAdjuster,
  type ClaimAdjuster, type InsertClaimAdjuster,
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
  type PlaybookEntry, type InsertPlaybookEntry,
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
  claims, claimVersions, adjusters, claimAdjusters,
  clients, supplements, documents, emails, aiInsights,
  founderAgreements, auditLogs,
  evidenceFiles, extractedEntities, claimDrafts, audioRecordings, timelineEvents,
  adjusterPlaybooks, playbookEntries, ircCodes, supplementTriggers, piiAccessLogs,
  adjusterAggregatedMetrics,
  supplementIntelligence, adjusterIrcBehavior, communicationSignals, playbookInsights,
  scoringWeights, intelligenceEvents, stormEvents,
  type Escalation, type InsertEscalation, escalations,
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
  getClaimAnyTenant(id: string): Promise<Claim | undefined>;
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
    snapshotJson: unknown;
  }): Promise<ClaimVersion>;
  getClaimVersions(claimId: string, orgId: string): Promise<ClaimVersion[]>;
  getLatestVersionNumber(claimId: string): Promise<number>;

  getAdjusters(orgId: string): Promise<Adjuster[]>;
  getAllAdjustersAcrossTenants(): Promise<Adjuster[]>;
  getAdjuster(id: string, orgId: string): Promise<Adjuster | undefined>;
  createAdjuster(adjuster: InsertAdjuster): Promise<Adjuster>;
  updateAdjuster(id: string, orgId: string, data: Partial<InsertAdjuster>): Promise<Adjuster | undefined>;
  getAdjusterCount(orgId: string): Promise<number>;
  // Multi-adjuster / cross-claim linkage (Item 7)
  getClaimAdjusters(claimId: string, orgId?: string): Promise<ClaimAdjuster[]>;
  getAdjusterClaims(adjusterId: string, orgId?: string): Promise<ClaimAdjuster[]>;
  getClaimAdjusterLink(id: string, orgId?: string): Promise<ClaimAdjuster | undefined>;
  linkAdjusterToClaim(link: InsertClaimAdjuster): Promise<ClaimAdjuster>;
  updateClaimAdjusterLink(id: string, orgId: string, data: Partial<InsertClaimAdjuster>): Promise<ClaimAdjuster | undefined>;
  unlinkClaimAdjuster(id: string, orgId: string): Promise<boolean>;

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
  getEmailsByOrg(orgId: string): Promise<Email[]>;
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
    beforeJson?: unknown;
    afterJson?: unknown;
    ipAddress?: string;
  }): Promise<AuditLog>;
  getAuditLogs(orgId?: string): Promise<AuditLog[]>;

  getEvidenceFiles(orgId: string, claimId?: string): Promise<EvidenceFile[]>;
  getAllEvidenceFilesAcrossTenants(): Promise<EvidenceFile[]>;
  getEvidenceFile(id: string, orgId: string): Promise<EvidenceFile | undefined>;
  getEvidenceFileAnyTenant(id: string): Promise<EvidenceFile | undefined>;
  getUnmatchedEvidenceFiles(orgId?: string): Promise<EvidenceFile[]>;
  getEvidenceFileBySha256(sha256: string, orgId: string): Promise<EvidenceFile | undefined>;
  createEvidenceFile(file: InsertEvidenceFile): Promise<EvidenceFile>;
  updateEvidenceFile(id: string, orgId: string, data: Partial<EvidenceFile>): Promise<EvidenceFile | undefined>;

  getExtractedEntities(evidenceFileId: string): Promise<ExtractedEntity[]>;
  getExtractedEntitiesByClaim(claimId: string): Promise<ExtractedEntity[]>;
  createExtractedEntity(entity: InsertExtractedEntity): Promise<ExtractedEntity>;

  getClaimDrafts(orgId: string): Promise<ClaimDraft[]>;
  getAllClaimDraftsAcrossTenants(): Promise<ClaimDraft[]>;
  getClaimDraft(id: string, orgId: string): Promise<ClaimDraft | undefined>;
  createClaimDraft(draft: InsertClaimDraft): Promise<ClaimDraft>;
  updateClaimDraft(id: string, orgId: string, data: Partial<ClaimDraft>): Promise<ClaimDraft | undefined>;

  getAudioRecordings(claimId: string, orgId: string): Promise<AudioRecording[]>;
  getAudioRecordingsByOrg(orgId: string): Promise<AudioRecording[]>;
  getAudioRecordingByEvidenceFile(evidenceFileId: string): Promise<AudioRecording | undefined>;
  createAudioRecording(recording: InsertAudioRecording): Promise<AudioRecording>;
  updateAudioRecording(id: string, orgId: string, data: Partial<AudioRecording>): Promise<AudioRecording | undefined>;
  getAudioRecordingById(id: string): Promise<AudioRecording | undefined>;

  getTimelineEvents(claimId: string, orgId: string): Promise<TimelineEvent[]>;
  getTimelineEventsByOrgId(orgId: string): Promise<TimelineEvent[]>;
  getAllTimelineEvents(): Promise<TimelineEvent[]>;
  createTimelineEvent(event: InsertTimelineEvent): Promise<TimelineEvent>;
  getTimelineEvent(id: string, orgId: string): Promise<TimelineEvent | undefined>;
  getTimelineCandidates(orgId: string, claimId?: string): Promise<TimelineEvent[]>;
  updateTimelineEvent(id: string, orgId: string, data: Partial<TimelineEvent>): Promise<TimelineEvent | undefined>;

  // Playbook Engine
  getPlaybookEntries(): Promise<PlaybookEntry[]>;
  getPlaybookEntry(id: string): Promise<PlaybookEntry | undefined>;
  createPlaybookEntry(entry: InsertPlaybookEntry): Promise<PlaybookEntry>;
  updatePlaybookEntry(id: string, data: Partial<PlaybookEntry>): Promise<PlaybookEntry | undefined>;
  softDeletePlaybookEntry(id: string): Promise<boolean>;
  countPlaybookEntries(): Promise<number>;

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

  // Storm Events
  createStormEvent(event: InsertStormEvent): Promise<StormEvent>;
  getStormEvents(orgId: string): Promise<StormEvent[]>;
  getStormEventsByClaim(claimId: string, orgId: string): Promise<StormEvent[]>;
  getStormEvent(id: string, orgId: string): Promise<StormEvent | undefined>;
  updateStormEvent(id: string, orgId: string, data: Partial<InsertStormEvent>): Promise<StormEvent | undefined>;
  deleteStormEvent(id: string, orgId: string): Promise<void>;

  // Governance — archive / restore / permanent delete
  archiveClaim(id: string, orgId?: string): Promise<boolean>;
  restoreClaim(id: string, orgId?: string): Promise<boolean>;
  permanentDeleteClaim(id: string, orgId?: string): Promise<boolean>;
  getArchivedClaims(orgId?: string): Promise<Claim[]>;

  archiveAdjuster(id: string, orgId?: string): Promise<boolean>;
  restoreAdjuster(id: string, orgId?: string): Promise<boolean>;
  permanentDeleteAdjuster(id: string, orgId?: string): Promise<boolean>;
  getArchivedAdjusters(orgId?: string): Promise<Adjuster[]>;

  archiveClient(id: string, orgId?: string): Promise<boolean>;
  restoreClient(id: string, orgId?: string): Promise<boolean>;
  permanentDeleteClient(id: string, orgId?: string): Promise<boolean>;
  getArchivedClients(orgId?: string): Promise<Client[]>;

  archiveEvidenceFile(id: string, orgId?: string): Promise<boolean>;
  restoreEvidenceFile(id: string, orgId?: string): Promise<boolean>;
  permanentDeleteEvidenceFile(id: string, orgId?: string): Promise<boolean>;
  getArchivedEvidenceFiles(orgId?: string): Promise<EvidenceFile[]>;

  archiveAudioRecording(id: string, orgId?: string): Promise<boolean>;
  restoreAudioRecording(id: string, orgId?: string): Promise<boolean>;
  permanentDeleteAudioRecording(id: string, orgId?: string): Promise<boolean>;
  getArchivedAudioRecordings(orgId?: string): Promise<AudioRecording[]>;

  archiveEmail(id: string, orgId?: string): Promise<boolean>;
  restoreEmail(id: string, orgId?: string): Promise<boolean>;
  permanentDeleteEmail(id: string, orgId?: string): Promise<boolean>;
  getArchivedEmails(orgId?: string): Promise<Email[]>;

  permanentDeleteTimelineEvent(id: string, orgId: string): Promise<boolean>;

  // Section 19 — Escalations
  getEscalations(claimId: string, orgId: string): Promise<Escalation[]>;
  getAllOrgEscalations(orgId: string): Promise<Escalation[]>;
  getAllEscalationsAcrossTenants(): Promise<Escalation[]>;
  getEscalation(id: string, orgId: string): Promise<Escalation | undefined>;
  createEscalation(data: InsertEscalation): Promise<Escalation>;
  updateEscalation(id: string, orgId: string, data: Partial<InsertEscalation>): Promise<Escalation | undefined>;
  deleteEscalation(id: string, orgId: string): Promise<boolean>;

  // Section 18 — Evidence intelligence
  updateEvidenceFileIntelligence(id: string, orgId: string, intelligenceJson: unknown, reviewStatus: string): Promise<void>;

  // Pricing & Registration
  createFoundingPartnerRequest(data: { fullName: string; email: string; companyName: string; phone?: string; estimatedMonthlyClaimVolume?: string; reasonForJoining?: string }): Promise<unknown>;
  getFoundingPartnerRequests(): Promise<unknown[]>;
  createEnterpriseContactLead(data: { fullName: string; companyName: string; email: string; phone?: string; organizationType?: string; estimatedUsers?: number; estimatedMonthlyClaimVolume?: string; integrationNeeds?: string; message?: string }): Promise<unknown>;
  getEnterpriseContactLeads(): Promise<unknown[]>;

  getGovernanceOverview(): Promise<{
    claims: { active: number; archived: number };
    adjusters: { active: number; archived: number };
    clients: { active: number; archived: number };
    evidenceFiles: { active: number; archived: number };
    audioRecordings: { active: number; archived: number };
    emails: { active: number; archived: number };
  }>;
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
      and(eq(claims.organizationId, orgId), isNull(claims.deletedAt), isNull(claims.archivedAt))
    ).orderBy(desc(claims.createdAt));
  }

  async getAllClaimsAcrossTenants(): Promise<Claim[]> {
    return db.select().from(claims).where(and(isNull(claims.deletedAt), isNull(claims.archivedAt))).orderBy(desc(claims.createdAt));
  }

  async getClaim(id: string, orgId: string): Promise<Claim | undefined> {
    const [claim] = await db.select().from(claims).where(
      and(eq(claims.id, id), eq(claims.organizationId, orgId), isNull(claims.deletedAt))
    );
    return claim;
  }

  async getClaimAnyTenant(id: string): Promise<Claim | undefined> {
    const [claim] = await db.select().from(claims).where(
      and(eq(claims.id, id), isNull(claims.deletedAt))
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

  async softDeleteClaim(id: string, orgId: string | undefined): Promise<boolean> {
    const result = await db.update(claims).set({ deletedAt: new Date() }).where(
      and(
        eq(claims.id, id),
        orgId ? eq(claims.organizationId, orgId) : undefined,
        isNull(claims.deletedAt)
      )
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
    snapshotJson: unknown;
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

  // ── Multi-adjuster / cross-claim linkage (Item 7) ──
  // orgId omitted = cross-tenant (Master governance only). See cross-tenant-governance memory.
  async getClaimAdjusters(claimId: string, orgId?: string): Promise<ClaimAdjuster[]> {
    const conds = [eq(claimAdjusters.claimId, claimId)];
    if (orgId !== undefined) conds.push(eq(claimAdjusters.organizationId, orgId));
    return db.select().from(claimAdjusters).where(and(...conds)).orderBy(claimAdjusters.createdAt);
  }

  async getAdjusterClaims(adjusterId: string, orgId?: string): Promise<ClaimAdjuster[]> {
    const conds = [eq(claimAdjusters.adjusterId, adjusterId)];
    if (orgId !== undefined) conds.push(eq(claimAdjusters.organizationId, orgId));
    return db.select().from(claimAdjusters).where(and(...conds)).orderBy(desc(claimAdjusters.createdAt));
  }

  async getClaimAdjusterLink(id: string, orgId?: string): Promise<ClaimAdjuster | undefined> {
    const conds = [eq(claimAdjusters.id, id)];
    if (orgId !== undefined) conds.push(eq(claimAdjusters.organizationId, orgId));
    const [link] = await db.select().from(claimAdjusters).where(and(...conds));
    return link;
  }

  async linkAdjusterToClaim(link: InsertClaimAdjuster): Promise<ClaimAdjuster> {
    const [created] = await db.insert(claimAdjusters).values(link).returning();
    return created;
  }

  async updateClaimAdjusterLink(id: string, orgId: string, data: Partial<InsertClaimAdjuster>): Promise<ClaimAdjuster | undefined> {
    const [updated] = await db.update(claimAdjusters)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(claimAdjusters.id, id), eq(claimAdjusters.organizationId, orgId)))
      .returning();
    return updated;
  }

  async unlinkClaimAdjuster(id: string, orgId: string): Promise<boolean> {
    const result = await db.delete(claimAdjusters)
      .where(and(eq(claimAdjusters.id, id), eq(claimAdjusters.organizationId, orgId)))
      .returning();
    return result.length > 0;
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

  async getEmailsByOrg(orgId: string): Promise<Email[]> {
    return db.select().from(emails).where(eq(emails.organizationId, orgId)).orderBy(desc(emails.createdAt));
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
    beforeJson?: unknown;
    afterJson?: unknown;
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

  async getAllEvidenceFilesAcrossTenants(): Promise<EvidenceFile[]> {
    return db.select().from(evidenceFiles).where(isNull(evidenceFiles.deletedAt)).orderBy(desc(evidenceFiles.uploadedAt));
  }

  async getEvidenceFile(id: string, orgId: string): Promise<EvidenceFile | undefined> {
    const [file] = await db.select().from(evidenceFiles).where(
      and(eq(evidenceFiles.id, id), eq(evidenceFiles.organizationId, orgId))
    );
    return file;
  }

  async getEvidenceFileAnyTenant(id: string): Promise<EvidenceFile | undefined> {
    const [file] = await db.select().from(evidenceFiles).where(eq(evidenceFiles.id, id));
    return file;
  }

  async getUnmatchedEvidenceFiles(orgId?: string): Promise<EvidenceFile[]> {
    const conditions = [isNull(evidenceFiles.claimId), isNull(evidenceFiles.archivedAt), isNull(evidenceFiles.deletedAt)];
    if (orgId) conditions.push(eq(evidenceFiles.organizationId, orgId));
    return db.select().from(evidenceFiles).where(and(...conditions)).orderBy(desc(evidenceFiles.uploadedAt));
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

  async getAllClaimDraftsAcrossTenants(): Promise<ClaimDraft[]> {
    return db.select().from(claimDrafts).orderBy(desc(claimDrafts.createdAt));
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

  async getAudioRecordingsByOrg(orgId: string): Promise<AudioRecording[]> {
    return db.select().from(audioRecordings).where(
      eq(audioRecordings.organizationId, orgId)
    ).orderBy(desc(audioRecordings.createdAt));
  }

  async getAudioRecordingByEvidenceFile(evidenceFileId: string): Promise<AudioRecording | undefined> {
    const [row] = await db.select().from(audioRecordings).where(
      eq(audioRecordings.evidenceFileId, evidenceFileId)
    ).limit(1);
    return row;
  }

  async getAudioRecordingById(id: string): Promise<AudioRecording | undefined> {
    const [row] = await db.select().from(audioRecordings).where(
      eq(audioRecordings.id, id)
    ).limit(1);
    return row;
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
      and(eq(timelineEvents.claimId, claimId), eq(timelineEvents.organizationId, orgId), eq(timelineEvents.needsReview, false))
    ).orderBy(desc(timelineEvents.eventDate));
  }

  async getTimelineEventsByOrgId(orgId: string): Promise<TimelineEvent[]> {
    return db.select().from(timelineEvents).where(
      eq(timelineEvents.organizationId, orgId)
    ).orderBy(desc(timelineEvents.eventDate));
  }

  async getAllTimelineEvents(): Promise<TimelineEvent[]> {
    return db.select().from(timelineEvents).orderBy(desc(timelineEvents.eventDate));
  }

  async createTimelineEvent(event: InsertTimelineEvent): Promise<TimelineEvent> {
    const [created] = await db.insert(timelineEvents).values(event).returning();
    return created;
  }

  async getTimelineEvent(id: string, orgId: string): Promise<TimelineEvent | undefined> {
    const [ev] = await db.select().from(timelineEvents).where(
      and(eq(timelineEvents.id, id), eq(timelineEvents.organizationId, orgId))
    );
    return ev;
  }

  async getTimelineCandidates(orgId: string, claimId?: string): Promise<TimelineEvent[]> {
    const conditions = [
      eq(timelineEvents.organizationId, orgId),
      eq(timelineEvents.needsReview, true),
      isNull(timelineEvents.deletedAt),
    ];
    if (claimId) conditions.push(eq(timelineEvents.claimId, claimId));
    return db.select().from(timelineEvents).where(and(...conditions)).orderBy(desc(timelineEvents.uploadDate));
  }

  async updateTimelineEvent(id: string, orgId: string, data: Partial<TimelineEvent>): Promise<TimelineEvent | undefined> {
    const [updated] = await db.update(timelineEvents).set(data).where(
      and(eq(timelineEvents.id, id), eq(timelineEvents.organizationId, orgId))
    ).returning();
    return updated;
  }

  // ── Playbook Engine ─────────────────────────────────────────────────────
  async getPlaybookEntries(): Promise<PlaybookEntry[]> {
    return db.select().from(playbookEntries).where(
      and(isNull(playbookEntries.deletedAt), isNull(playbookEntries.archivedAt))
    ).orderBy(desc(playbookEntries.createdAt));
  }

  async getPlaybookEntry(id: string): Promise<PlaybookEntry | undefined> {
    const [entry] = await db.select().from(playbookEntries).where(
      and(eq(playbookEntries.id, id), isNull(playbookEntries.deletedAt))
    );
    return entry;
  }

  async createPlaybookEntry(entry: InsertPlaybookEntry): Promise<PlaybookEntry> {
    const [created] = await db.insert(playbookEntries).values(entry).returning();
    return created;
  }

  async updatePlaybookEntry(id: string, data: Partial<PlaybookEntry>): Promise<PlaybookEntry | undefined> {
    const [updated] = await db.update(playbookEntries).set({ ...data, updatedAt: new Date() }).where(
      and(eq(playbookEntries.id, id), isNull(playbookEntries.deletedAt))
    ).returning();
    return updated;
  }

  async softDeletePlaybookEntry(id: string): Promise<boolean> {
    const result = await db.update(playbookEntries).set({ deletedAt: new Date() }).where(
      and(eq(playbookEntries.id, id), isNull(playbookEntries.deletedAt))
    ).returning();
    return result.length > 0;
  }

  async countPlaybookEntries(): Promise<number> {
    const [row] = await db.select({ count: count() }).from(playbookEntries).where(
      and(isNull(playbookEntries.deletedAt), isNull(playbookEntries.archivedAt))
    );
    return row?.count ?? 0;
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
        eq(intelligenceEvents.eventCategory, category as "denial" | "payment" | "supplement" | "irc_trigger" | "communication_signal" | "lifecycle" | "escalation")
      )
    ).orderBy(desc(intelligenceEvents.createdAt));
  }

  async createStormEvent(event: InsertStormEvent): Promise<StormEvent> {
    const [created] = await db.insert(stormEvents).values(event).returning();
    return created;
  }

  async getStormEvents(orgId: string): Promise<StormEvent[]> {
    return db.select().from(stormEvents)
      .where(eq(stormEvents.organizationId, orgId))
      .orderBy(desc(stormEvents.createdAt));
  }

  async getStormEventsByClaim(claimId: string, orgId: string): Promise<StormEvent[]> {
    return db.select().from(stormEvents)
      .where(and(eq(stormEvents.claimId, claimId), eq(stormEvents.organizationId, orgId)))
      .orderBy(desc(stormEvents.createdAt));
  }

  async getStormEvent(id: string, orgId: string): Promise<StormEvent | undefined> {
    const [event] = await db.select().from(stormEvents)
      .where(and(eq(stormEvents.id, id), eq(stormEvents.organizationId, orgId)));
    return event;
  }

  async updateStormEvent(id: string, orgId: string, data: Partial<InsertStormEvent>): Promise<StormEvent | undefined> {
    const [updated] = await db.update(stormEvents)
      .set(data)
      .where(and(eq(stormEvents.id, id), eq(stormEvents.organizationId, orgId)))
      .returning();
    return updated;
  }

  async deleteStormEvent(id: string, orgId: string): Promise<void> {
    await db.delete(stormEvents)
      .where(and(eq(stormEvents.id, id), eq(stormEvents.organizationId, orgId)));
  }

  // ── Governance: Claims ────────────────────────────────────────────────────
  async archiveClaim(id: string, orgId?: string): Promise<boolean> {
    const where = orgId
      ? and(eq(claims.id, id), eq(claims.organizationId, orgId), isNull(claims.archivedAt), isNull(claims.deletedAt))
      : and(eq(claims.id, id), isNull(claims.archivedAt), isNull(claims.deletedAt));
    const result = await db.update(claims).set({ archivedAt: new Date() }).where(where!).returning();
    return result.length > 0;
  }

  async restoreClaim(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(claims.id, id), eq(claims.organizationId, orgId)) : eq(claims.id, id);
    const result = await db.update(claims).set({ archivedAt: null }).where(where).returning();
    return result.length > 0;
  }

  async permanentDeleteClaim(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(claims.id, id), eq(claims.organizationId, orgId)) : eq(claims.id, id);
    const result = await db.delete(claims).where(where).returning();
    return result.length > 0;
  }

  async getArchivedClaims(orgId?: string): Promise<Claim[]> {
    if (orgId) {
      return db.select().from(claims).where(
        and(eq(claims.organizationId, orgId), sql`${claims.archivedAt} IS NOT NULL`)
      ).orderBy(desc(claims.archivedAt));
    }
    return db.select().from(claims).where(sql`${claims.archivedAt} IS NOT NULL`).orderBy(desc(claims.archivedAt));
  }

  // ── Governance: Adjusters ─────────────────────────────────────────────────
  async archiveAdjuster(id: string, orgId?: string): Promise<boolean> {
    const where = orgId
      ? and(eq(adjusters.id, id), eq(adjusters.organizationId, orgId), sql`${adjusters.archivedAt} IS NULL`)
      : and(eq(adjusters.id, id), sql`${adjusters.archivedAt} IS NULL`);
    const result = await db.update(adjusters).set({ archivedAt: new Date() } as { archivedAt: Date | null }).where(where!).returning();
    return result.length > 0;
  }

  async restoreAdjuster(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(adjusters.id, id), eq(adjusters.organizationId, orgId)) : eq(adjusters.id, id);
    const result = await db.update(adjusters).set({ archivedAt: null } as { archivedAt: Date | null }).where(where).returning();
    return result.length > 0;
  }

  async permanentDeleteAdjuster(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(adjusters.id, id), eq(adjusters.organizationId, orgId)) : eq(adjusters.id, id);
    const result = await db.delete(adjusters).where(where).returning();
    return result.length > 0;
  }

  async getArchivedAdjusters(orgId?: string): Promise<Adjuster[]> {
    if (orgId) {
      return db.select().from(adjusters).where(
        and(eq(adjusters.organizationId, orgId), sql`${adjusters.archivedAt} IS NOT NULL`)
      ).orderBy(desc(adjusters.createdAt));
    }
    return db.select().from(adjusters).where(sql`${adjusters.archivedAt} IS NOT NULL`).orderBy(desc(adjusters.createdAt));
  }

  // ── Governance: Clients ───────────────────────────────────────────────────
  async archiveClient(id: string, orgId?: string): Promise<boolean> {
    const where = orgId
      ? and(eq(clients.id, id), eq(clients.organizationId, orgId), sql`${clients.archivedAt} IS NULL`)
      : and(eq(clients.id, id), sql`${clients.archivedAt} IS NULL`);
    const result = await db.update(clients).set({ archivedAt: new Date() } as { archivedAt: Date | null }).where(where!).returning();
    return result.length > 0;
  }

  async restoreClient(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(clients.id, id), eq(clients.organizationId, orgId)) : eq(clients.id, id);
    const result = await db.update(clients).set({ archivedAt: null } as { archivedAt: Date | null }).where(where).returning();
    return result.length > 0;
  }

  async permanentDeleteClient(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(clients.id, id), eq(clients.organizationId, orgId)) : eq(clients.id, id);
    const result = await db.delete(clients).where(where).returning();
    return result.length > 0;
  }

  async getArchivedClients(orgId?: string): Promise<Client[]> {
    if (orgId) {
      return db.select().from(clients).where(
        and(eq(clients.organizationId, orgId), sql`${clients.archivedAt} IS NOT NULL`)
      ).orderBy(desc(clients.createdAt));
    }
    return db.select().from(clients).where(sql`${clients.archivedAt} IS NOT NULL`).orderBy(desc(clients.createdAt));
  }

  // ── Governance: Evidence Files ────────────────────────────────────────────
  async archiveEvidenceFile(id: string, orgId?: string): Promise<boolean> {
    const where = orgId
      ? and(eq(evidenceFiles.id, id), eq(evidenceFiles.organizationId, orgId), sql`${evidenceFiles.archivedAt} IS NULL`)
      : and(eq(evidenceFiles.id, id), sql`${evidenceFiles.archivedAt} IS NULL`);
    const result = await db.update(evidenceFiles).set({ archivedAt: new Date() } as { archivedAt: Date | null }).where(where!).returning();
    return result.length > 0;
  }

  async restoreEvidenceFile(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(evidenceFiles.id, id), eq(evidenceFiles.organizationId, orgId)) : eq(evidenceFiles.id, id);
    const result = await db.update(evidenceFiles).set({ archivedAt: null } as { archivedAt: Date | null }).where(where).returning();
    return result.length > 0;
  }

  async permanentDeleteEvidenceFile(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(evidenceFiles.id, id), eq(evidenceFiles.organizationId, orgId)) : eq(evidenceFiles.id, id);
    const result = await db.delete(evidenceFiles).where(where).returning();
    return result.length > 0;
  }

  async getArchivedEvidenceFiles(orgId?: string): Promise<EvidenceFile[]> {
    if (orgId) {
      return db.select().from(evidenceFiles).where(
        and(eq(evidenceFiles.organizationId, orgId), sql`${evidenceFiles.archivedAt} IS NOT NULL`)
      ).orderBy(desc(evidenceFiles.uploadedAt));
    }
    return db.select().from(evidenceFiles).where(sql`${evidenceFiles.archivedAt} IS NOT NULL`).orderBy(desc(evidenceFiles.uploadedAt));
  }

  // ── Governance: Audio Recordings ──────────────────────────────────────────
  async archiveAudioRecording(id: string, orgId?: string): Promise<boolean> {
    const where = orgId
      ? and(eq(audioRecordings.id, id), eq(audioRecordings.organizationId, orgId), sql`${audioRecordings.archivedAt} IS NULL`)
      : and(eq(audioRecordings.id, id), sql`${audioRecordings.archivedAt} IS NULL`);
    const result = await db.update(audioRecordings).set({ archivedAt: new Date() } as { archivedAt: Date | null }).where(where!).returning();
    return result.length > 0;
  }

  async restoreAudioRecording(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(audioRecordings.id, id), eq(audioRecordings.organizationId, orgId)) : eq(audioRecordings.id, id);
    const result = await db.update(audioRecordings).set({ archivedAt: null } as { archivedAt: Date | null }).where(where).returning();
    return result.length > 0;
  }

  async permanentDeleteAudioRecording(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(audioRecordings.id, id), eq(audioRecordings.organizationId, orgId)) : eq(audioRecordings.id, id);
    const result = await db.delete(audioRecordings).where(where).returning();
    return result.length > 0;
  }

  async getArchivedAudioRecordings(orgId?: string): Promise<AudioRecording[]> {
    if (orgId) {
      return db.select().from(audioRecordings).where(
        and(eq(audioRecordings.organizationId, orgId), sql`${audioRecordings.archivedAt} IS NOT NULL`)
      ).orderBy(desc(audioRecordings.createdAt));
    }
    return db.select().from(audioRecordings).where(sql`${audioRecordings.archivedAt} IS NOT NULL`).orderBy(desc(audioRecordings.createdAt));
  }

  // ── Governance: Emails ────────────────────────────────────────────────────
  async archiveEmail(id: string, orgId?: string): Promise<boolean> {
    const where = orgId
      ? and(eq(emails.id, id), eq(emails.organizationId, orgId), sql`${emails.archivedAt} IS NULL`)
      : and(eq(emails.id, id), sql`${emails.archivedAt} IS NULL`);
    const result = await db.update(emails).set({ archivedAt: new Date() } as { archivedAt: Date | null }).where(where!).returning();
    return result.length > 0;
  }

  async restoreEmail(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(emails.id, id), eq(emails.organizationId, orgId)) : eq(emails.id, id);
    const result = await db.update(emails).set({ archivedAt: null } as { archivedAt: Date | null }).where(where).returning();
    return result.length > 0;
  }

  async permanentDeleteEmail(id: string, orgId?: string): Promise<boolean> {
    const where = orgId ? and(eq(emails.id, id), eq(emails.organizationId, orgId)) : eq(emails.id, id);
    const result = await db.delete(emails).where(where).returning();
    return result.length > 0;
  }

  async getArchivedEmails(orgId?: string): Promise<Email[]> {
    if (orgId) {
      return db.select().from(emails).where(
        and(eq(emails.organizationId, orgId), sql`${emails.archivedAt} IS NOT NULL`)
      ).orderBy(desc(emails.createdAt));
    }
    return db.select().from(emails).where(sql`${emails.archivedAt} IS NOT NULL`).orderBy(desc(emails.createdAt));
  }

  // ── Governance: Timeline Events ───────────────────────────────────────────
  async permanentDeleteTimelineEvent(id: string, orgId: string): Promise<boolean> {
    const result = await db.delete(timelineEvents).where(
      and(eq(timelineEvents.id, id), eq(timelineEvents.organizationId, orgId))
    ).returning();
    return result.length > 0;
  }

  // ── Governance: Overview ──────────────────────────────────────────────────
  async getGovernanceOverview() {
    const [
      activeClaims, archivedClaims,
      activeAdj, archivedAdj,
      activeClients, archivedClients,
      activeEvidence, archivedEvidence,
      activeAudio, archivedAudio,
      activeEmails, archivedEmails,
    ] = await Promise.all([
      db.select({ count: count() }).from(claims).where(and(isNull(claims.archivedAt), isNull(claims.deletedAt))),
      db.select({ count: count() }).from(claims).where(sql`${claims.archivedAt} IS NOT NULL`),
      db.select({ count: count() }).from(adjusters).where(sql`${adjusters.archivedAt} IS NULL`),
      db.select({ count: count() }).from(adjusters).where(sql`${adjusters.archivedAt} IS NOT NULL`),
      db.select({ count: count() }).from(clients).where(sql`${clients.archivedAt} IS NULL`),
      db.select({ count: count() }).from(clients).where(sql`${clients.archivedAt} IS NOT NULL`),
      db.select({ count: count() }).from(evidenceFiles).where(sql`${evidenceFiles.archivedAt} IS NULL`),
      db.select({ count: count() }).from(evidenceFiles).where(sql`${evidenceFiles.archivedAt} IS NOT NULL`),
      db.select({ count: count() }).from(audioRecordings).where(sql`${audioRecordings.archivedAt} IS NULL`),
      db.select({ count: count() }).from(audioRecordings).where(sql`${audioRecordings.archivedAt} IS NOT NULL`),
      db.select({ count: count() }).from(emails).where(sql`${emails.archivedAt} IS NULL`),
      db.select({ count: count() }).from(emails).where(sql`${emails.archivedAt} IS NOT NULL`),
    ]);
    return {
      claims: { active: activeClaims[0]?.count ?? 0, archived: archivedClaims[0]?.count ?? 0 },
      adjusters: { active: activeAdj[0]?.count ?? 0, archived: archivedAdj[0]?.count ?? 0 },
      clients: { active: activeClients[0]?.count ?? 0, archived: archivedClients[0]?.count ?? 0 },
      evidenceFiles: { active: activeEvidence[0]?.count ?? 0, archived: archivedEvidence[0]?.count ?? 0 },
      audioRecordings: { active: activeAudio[0]?.count ?? 0, archived: archivedAudio[0]?.count ?? 0 },
      emails: { active: activeEmails[0]?.count ?? 0, archived: archivedEmails[0]?.count ?? 0 },
    };
  }

  // ── Section 19 — Escalations ──────────────────────────────────────────
  async getEscalations(claimId: string, orgId: string): Promise<Escalation[]> {
    return db.select().from(escalations).where(
      and(eq(escalations.claimId, claimId), eq(escalations.organizationId, orgId))
    ).orderBy(desc(escalations.createdAt));
  }

  async getAllOrgEscalations(orgId: string): Promise<Escalation[]> {
    return db.select().from(escalations).where(eq(escalations.organizationId, orgId))
      .orderBy(desc(escalations.createdAt));
  }

  async getAllEscalationsAcrossTenants(): Promise<Escalation[]> {
    return db.select().from(escalations).orderBy(desc(escalations.createdAt));
  }

  async getEscalation(id: string, orgId: string): Promise<Escalation | undefined> {
    const [row] = await db.select().from(escalations).where(
      and(eq(escalations.id, id), eq(escalations.organizationId, orgId))
    );
    return row;
  }

  async createEscalation(data: InsertEscalation): Promise<Escalation> {
    const [row] = await db.insert(escalations).values(data).returning();
    return row;
  }

  async updateEscalation(id: string, orgId: string, data: Partial<InsertEscalation>): Promise<Escalation | undefined> {
    const [row] = await db.update(escalations)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(escalations.id, id), eq(escalations.organizationId, orgId)))
      .returning();
    return row;
  }

  async deleteEscalation(id: string, orgId: string): Promise<boolean> {
    const result = await db.delete(escalations).where(
      and(eq(escalations.id, id), eq(escalations.organizationId, orgId))
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Section 18 — Evidence Intelligence ───────────────────────────────
  // Merges intelligence analysis under the `intelligence` key in extractedJson,
  // preserving the existing `extraction` key written by the LLM extraction pipeline.
  async updateEvidenceFileIntelligence(id: string, orgId: string, intelligenceJson: unknown, _reviewStatus: string): Promise<void> {
    const [existing] = await db
      .select({ extractedJson: evidenceFiles.extractedJson })
      .from(evidenceFiles)
      .where(and(eq(evidenceFiles.id, id), eq(evidenceFiles.organizationId, orgId)));
    const current = (existing?.extractedJson ?? {}) as Record<string, unknown>;
    const merged = { ...current, intelligence: intelligenceJson };
    await db.update(evidenceFiles)
      .set({ extractedJson: merged })
      .where(and(eq(evidenceFiles.id, id), eq(evidenceFiles.organizationId, orgId)));
  }

  // —— Pricing & Registration ——
  async createFoundingPartnerRequest(data: { fullName: string; email: string; companyName: string; phone?: string; estimatedMonthlyClaimVolume?: string; reasonForJoining?: string }) {
    const [created] = await db.insert(foundingPartnerRequests).values(data).returning();
    return created;
  }

  async getFoundingPartnerRequests() {
    return db.select().from(foundingPartnerRequests).orderBy(desc(foundingPartnerRequests.createdAt));
  }

  async createEnterpriseContactLead(data: { fullName: string; companyName: string; email: string; phone?: string; organizationType?: string; estimatedUsers?: number; estimatedMonthlyClaimVolume?: string; integrationNeeds?: string; message?: string }) {
    const [created] = await db.insert(enterpriseContactLeads).values(data).returning();
    return created;
  }

  async getEnterpriseContactLeads() {
    return db.select().from(enterpriseContactLeads).orderBy(desc(enterpriseContactLeads.createdAt));
  }
}

export const storage = new DatabaseStorage();
