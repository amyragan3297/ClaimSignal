import type { Express, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import { signupSchema, loginSchema, insertClientSchema, insertSupplementSchema, insertAdjusterSchema, insertStormEventSchema, insertTimelineEventSchema, type TimelineEvent, type InsertClaim, foundingPartnerRequestSchema, enterpriseContactSchema, insertRevenueOpportunitySchema } from "@shared/schema";
import { applyPiiMasking, canViewUnmasked, sanitizeSharedClaimList, sanitizePlaybookList, sanitizePlaybookRecord, toPlaybookAggregate, isMaster } from "./masking";
import { computeCarrierIntelligence } from "./carrier-intelligence";
import { computeAdjusterScorecard } from "./adjuster-scorecard";
import { parseQueryToFilters, filterClaims, buildStrategySummary, similarityScore, isUsableOutcome, type PlaybookFilters } from "./playbook-engine";
import { analyzeDocumentText } from "./document-intelligence";
import { computeEscalationEffectiveness, buildRecommendedEscalationPath } from "./escalation-intelligence";
import { computeClaimHealthScore, computeRiskSignals, computeAlerts, buildExecutiveSummary } from "./claim-intelligence";
import { runCopilotQuery, AI_DISCLOSURE } from "./copilot-engine";
import { generatePlaybookStrategy, parsePlaybookQueryWithAI, generateDenialToApprovalPatterns } from "./ai-services";
import { computePatterns, computeOutcomeCorrelations, computeTrends, computeEmergingSignals } from "./network-intelligence";
import { insertEscalationSchema } from "@shared/schema";
import { createCandidatesFromText, sampleClaimDocumentText } from "./timeline-extraction";
import { seedSamplePlaybooks } from "./playbook-seed";
import { insertPlaybookEntrySchema } from "@shared/schema";
import { createCheckoutSession, handleWebhookEvent } from "./billing";
import exportsRouter from "./exports";
import { registerSeoRoutes } from "./seo/routes";
import evidenceRouter from "./evidence";
import intelligenceRouter from "./intelligence";
import { computeLifecycleVelocity, computeFullClaimScoring } from "./scoring";
import { seedDefaultWeights } from "./scoring";
import { generateClaimAnalysis, transcribeAudio, isOpenAIConfigured, extractClaimFieldsFromText, extractAdjustersFromTranscript, recordAiError, getAiStatus, generatePlaybookEntry, generateAiFallbackPlaybookRecs, generatePlaybookDraft } from "./ai-services";
import { extractAndLinkAdjustersForClaim, type AdjusterMention } from "./adjuster-linking";
import { getClaimWeather, geocodeZip, geocodeCity } from "./weather";
import { findDuplicateClaims } from "./claim-matching";
import express from "express";
import { createHash } from "crypto";
import { isDemoSeedingAllowed, resolveSeedMasterCredentials } from "./config";
import { db } from "./db";
import { eq, inArray } from "drizzle-orm";
import {
  organizations, users, userSessions, billingAccounts, founderAgreements,
  claims as claimsTable, adjusters as adjustersTable, claimAdjusters,
  evidenceFiles, timelineEvents, supplements, aiInsights, auditLogs as auditLogsTable,
} from "@shared/schema";
import {
  type AuthRequest,
  requireAuth,
  requireActiveSubscription,
  requirePlatformOwner,
  requireSuperAdmin,
  requireMasterDelete,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  requireRole,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  requireInvestorApproved,
  blockDuringImpersonation,
  createAuthSession,
  refreshAuthSession,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getClientIp,
  trackLoginActivity,
} from "./auth";

const ADMIN_NOTIFICATION_EMAIL = "claimsignal1@gmail.com";

async function sendAdminNotificationEmail(opts: { subject: string; body: string }): Promise<void> {
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || ADMIN_NOTIFICATION_EMAIL,
        pass: process.env.SMTP_PASS || "",
      },
    });
    await transporter.sendMail({
      from: `"ClaimSignal" <${ADMIN_NOTIFICATION_EMAIL}>`,
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: opts.subject,
      text: opts.body,
    });
  } catch (err) {
    console.warn("[email] Admin notification failed:", (err as Error).message);
  }
}

const CLAIM_NUMERIC_FIELDS = [
  "rcvAmount", "acvAmount", "deductible", "supplementAmountTotal", "finalPaidAmount",
  "claimAmount", "approvedAmount", "rcvTotal", "acvTotal", "recoverableDepreciation",
  "nonRecoverableDepreciation", "priorPayments", "supplementRequested", "supplementApproved",
  "outstandingAmount", "finalApprovedAmount",
];
const CLAIM_DATE_FIELDS = [
  "dateOfLoss", "inspectionDate", "determinationDate", "reinspectionDate",
  "resolutionDate", "lossDate",
];

/**
 * Normalizes claim form input: numeric string fields → number (or null when blank),
 * date string fields → Date (or null when blank). Leaves all other keys untouched so
 * this stays additive and safe for partial PATCH bodies.
 */
function normalizeClaimInput<T extends Record<string, unknown>>(body: T): T {
  const out: Record<string, unknown> = { ...body };
  for (const k of CLAIM_NUMERIC_FIELDS) {
    if (!(k in out)) continue;
    const v = out[k];
    if (v === "" || v === null || v === undefined) { out[k] = null; continue; }
    const n = typeof v === "number" ? v : Number(v);
    out[k] = isNaN(n) ? null : n;
  }
  for (const k of CLAIM_DATE_FIELDS) {
    if (!(k in out)) continue;
    const v = out[k];
    if (v === "" || v === null || v === undefined) { out[k] = null; continue; }
    if (v instanceof Date) continue;
    const d = new Date(v as string | number);
    out[k] = isNaN(d.getTime()) ? null : d;
  }
  return out as T;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    const ai = getAiStatus();
    res.json({
      ok: true,
      ai: {
        apiKeyPresent: ai.apiKeyPresent,
        baseUrlPresent: ai.baseUrlPresent,
        configured: ai.apiKeyPresent && ai.baseUrlPresent,
        analysisModel: ai.analysisModel,
        transcribeModel: ai.transcribeModel,
        lastError: ai.lastError ?? null,
      },
    });
  });

  app.post("/api/auth/register", async (req: AuthRequest, res) => {
    try {
      const data = signupSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const planType = data.planType || "individual";

      if (planType === "founder") {
        const founderCount = await storage.getFounderSubscriptionCount();
        if (founderCount >= 3) {
          return res.status(400).json({ message: "Founder tier unavailable - all 3 spots are taken" });
        }
      }

      const passwordHash = await bcrypt.hash(data.password, 12);
      const org = await storage.createOrganization({ name: data.orgName, organizationType: data.organizationType });

      const user = await storage.createUser({
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        organizationId: org.id,
        role: planType === "founder" ? "founder" : 'individual',
        founderFlag: planType === "founder",
      });

      const billingData: Record<string, unknown> = {
        organizationId: org.id,
        planType,
      };

      if (planType === "founder") {
        const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        billingData.subscriptionStatus = "trialing";
        billingData.trialStartDate = new Date();
        billingData.trialEndDate = trialEnd;
      } else {
        // Professional and Team require immediate Stripe payment before access
        billingData.subscriptionStatus = "pending_billing";
      }

      await storage.createBillingAccount(billingData as Parameters<typeof storage.createBillingAccount>[0]);

      await storage.createAuditLog({
        organizationId: org.id,
        actorUserId: user.id,
        actorRole: planType === "founder" ? "founder" : 'individual',
        actionType: "USER_REGISTERED",
        entityType: "user",
        entityId: user.id,
        afterJson: { email: data.email, orgName: data.orgName },
        ipAddress: getClientIp(req),
      });

      const { accessToken, refreshToken } = await createAuthSession(
        user.id, org.id,
        { ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] }
      );

      await trackLoginActivity({
        userId: user.id,
        email: user.email,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"],
        success: true,
      });

      setRefreshTokenCookie(res, refreshToken);
      res.json({ accessToken, user: sanitizeUser(user), orgId: org.id });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.post("/api/auth/login", async (req: AuthRequest, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        await trackLoginActivity({ email: data.email, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], success: false, failureReason: "User not found" });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(data.password, user.passwordHash);
      if (!valid) {
        await trackLoginActivity({ userId: user.id, email: user.email, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], success: false, failureReason: "Invalid password" });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const { accessToken, refreshToken } = await createAuthSession(
        user.id, user.organizationId,
        { ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] }
      );

      await storage.createAuditLog({
        organizationId: user.organizationId,
        actorUserId: user.id,
        actorRole: user.role,
        actionType: "USER_LOGIN",
        entityType: "user",
        entityId: user.id,
        ipAddress: getClientIp(req),
      });

      await trackLoginActivity({
        userId: user.id,
        email: user.email,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"],
        success: true,
      });

      setRefreshTokenCookie(res, refreshToken);
      res.json({ accessToken, user: sanitizeUser(user), orgId: user.organizationId });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.post("/api/auth/refresh", async (req: AuthRequest, res) => {
    try {
      const token = req.cookies?.refresh_token;
      if (!token) {
        return res.status(401).json({ message: "No refresh token" });
      }

      const result = await refreshAuthSession(token);
      if (!result) {
        clearRefreshTokenCookie(res);
        return res.status(401).json({ message: "Invalid refresh token" });
      }

      setRefreshTokenCookie(res, result.refreshToken);
      res.json({ accessToken: result.accessToken });
    } catch (_err) {
      return res.status(401).json({ message: "Refresh failed" });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.auth?.userId;
      const email = req.auth?.email || "";
      if (req.auth?.sessionId) {
        await storage.revokeSession(req.auth.sessionId);
      }
      await trackLoginActivity({
        userId,
        email,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"],
        success: true,
      });
      clearRefreshTokenCookie(res);
      res.json({ message: "Logged out" });
    } catch {
      res.json({ message: "Logged out" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.auth!.userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      const org = await storage.getOrganization(req.auth!.organizationId);
      if (!org) return res.status(401).json({ message: "Organization not found" });

      const billing = await storage.getBillingAccountByOrg(org.id);
      const founderAgreement = await storage.getFounderAgreement(org.id);

      const roleRedirects: Record<string, string> = {
        master_admin: "/master",
        executive_admin: "/admin",
        founder: "/founder",
        team_admin: "/team-admin",
        team_member: "/dashboard",
        individual: "/dashboard",
        investor: "/investor",
      };

      res.json({
        user: sanitizeUser(user),
        org,
        billing: billing || null,
        founderAgreement: founderAgreement || null,
        isPlatformOwner: !!user.isPlatformOwner || user.role === "master_admin",
        isImpersonation: req.auth!.isImpersonation,
        redirectTo: roleRedirects[user.role] || "/dashboard",
      });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/dashboard/stats", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const [totalClaims, openClaims, totalAdjusters] = await Promise.all([
        storage.getClaimCount(orgId),
        storage.getOpenClaimCount(orgId),
        storage.getAdjusterCount(orgId),
      ]);
      const claims = await storage.getClaims(orgId);
      const highRiskClaims = claims.filter(c => (c.riskScore ?? 0) >= 5).length;
      const overturnedDenials = claims.filter(c => c.status === "resolved" && (c.outcomeMigrationDelta ?? 0) > 0).length;
      const claimsWithSupplement = claims.filter(c => (c.supplementAmountTotal ?? 0) > 0);
      const avgSupplementOpp = claimsWithSupplement.length > 0
        ? claimsWithSupplement.reduce((sum, c) => sum + (c.supplementAmountTotal ?? 0), 0) / claimsWithSupplement.length
        : 0;
      res.json({
        totalClaims,
        openClaims,
        totalAdjusters,
        highRiskClaims,
        overturnedDenials,
        avgSupplementOpp: Math.round(avgSupplementOpp * 100) / 100,
      });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/claims", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;

      // Master sees all claims across all tenants, always unmasked
      // Non-Master sees only their own org's claims, always unmasked (own data)
      const claimsData = role === "master_admin"
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);

      if (role === "master_admin") {
        await storage.createAuditLog({
          organizationId: orgId,
          actorUserId: req.auth!.userId,
          actorRole: role,
          actionType: "CLAIM_LIST_ACCESS_UNMASKED",
          entityType: "claims",
          ipAddress: getClientIp(req),
        });
      }

      res.json(claimsData);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Shared platform claim library — cross-tenant, masked for all non-Master roles
  app.get("/api/claims/shared", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;
      const includeDemoRecords = req.query.includeDemoRecords === "true" && role === "master_admin";

      let allClaims = await storage.getAllClaimsAcrossTenants();

      // Filter out demo/seed organization records unless explicitly requested by Master.
      // Demo records are owned by any account with a @claimsignal.test domain email
      // or the legacy test@example.com address — this covers all seeded role accounts
      // (exec@, founder@, individual@, teamadmin@, member@, etc.) which each live in
      // their own separate org.
      if (!includeDemoRecords) {
        const allUsers = await storage.getAllUsers();
        const demoOrgIds = new Set<string>();
        for (const u of allUsers) {
          if (u.email.endsWith("@claimsignal.test") || u.email === "test@example.com") {
            demoOrgIds.add(u.organizationId);
          }
        }
        if (demoOrgIds.size > 0) {
          allClaims = allClaims.filter(c => !demoOrgIds.has(c.organizationId));
        }
      }

      await storage.createAuditLog({
        organizationId: orgId,
        actorUserId: req.auth!.userId,
        actorRole: role,
        actionType: "SHARED_LIBRARY_ACCESS",
        entityType: "claims",
        ipAddress: getClientIp(req),
      });

      // Master always unmasked; everyone else receives sanitized/masked records
      if (role === "master_admin") {
        return res.json(allClaims);
      }

      res.json(sanitizeSharedClaimList(allClaims, role));
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Risk Map — geocoded claim locations (literal path, must precede /:id) ──
  app.get("/api/claims/map-points", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;

      const claims = role === "master_admin"
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);

      // Geocode each claim that has a ZIP or city; skip those without location data.
      // Run concurrently (small batches) to avoid long serial waits.
      const CONCURRENCY = 8;
      const results: Array<{
        id: string; lat: number; lon: number;
        frictionScore: number | null; riskScore: number | null;
        status: string; lossType: string | null; carrier: string | null;
        city: string | null; state: string | null; zipCode: string | null;
        lifecyclePhase: string | null; dateOfLoss: string | null;
        claimIdentifier: string;
      }> = [];

      for (let i = 0; i < claims.length; i += CONCURRENCY) {
        const batch = claims.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(
          batch.map(async (c) => {
            let geo: { lat: number; lon: number } | null = null;
            if (c.zipCode?.trim()) {
              geo = await geocodeZip(c.zipCode);
            }
            if (!geo && c.city) {
              geo = await geocodeCity(c.city, c.state);
            }
            if (!geo) return null;
            const lossDateRaw = c.dateOfLoss || c.lossDate;
            return {
              id: c.id,
              lat: geo.lat,
              lon: geo.lon,
              frictionScore: c.frictionScore ?? null,
              riskScore: c.riskScore ?? null,
              status: c.status,
              lossType: c.lossType ?? null,
              carrier: c.carrier ?? null,
              city: c.city ?? null,
              state: c.state ?? null,
              zipCode: c.zipCode ?? null,
              lifecyclePhase: c.currentPhase ?? null,
              dateOfLoss: lossDateRaw ? new Date(lossDateRaw).toISOString().slice(0, 10) : null,
              claimIdentifier: c.claimNumber
                ? (role === "master_admin" ? c.claimNumber : "CLM-" + c.id.slice(0, 6).toUpperCase())
                : "CLM-" + c.id.slice(0, 6).toUpperCase(),
            };
          })
        );
        for (const s of settled) {
          if (s.status === "fulfilled" && s.value) results.push(s.value);
        }
      }

      res.json(results);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/claims/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;

      // Try own org first; Master uses direct cross-tenant lookup as fallback
      let claim = await storage.getClaim(req.params.id as string, orgId);

      if (!claim && role === "master_admin") {
        claim = await storage.getClaimAnyTenant(req.params.id as string);
      }

      if (!claim) return res.status(404).json({ message: "Claim not found" });

      // Master: always unmasked, always audited
      // Non-Master: own-org claim returned unmasked (they own this data)
      if (role === "master_admin") {
        await storage.createAuditLog({
          organizationId: claim.organizationId,
          actorUserId: req.auth!.userId,
          actorRole: role,
          actionType: "CLAIM_VIEW_UNMASKED",
          entityType: "claim",
          entityId: claim.id,
          ipAddress: getClientIp(req),
        });
      }

      res.json(claim);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/claims/:id/versions", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const versions = await storage.getClaimVersions(req.params.id as string, orgId);
      res.json(versions);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Section 13 — Claim Deduplication Intelligence ─────────────────────────
  // Must be registered BEFORE /api/claims/:id routes (literal path wins over param).
  app.post("/api/claims/check-duplicates", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const role = req.auth!.role;
      const { claimNumber, homeownerName, propertyAddress, carrier, dateOfLoss } = req.body;

      const allClaims = isMaster(role)
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);

      const norm = (s: unknown) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");

      const matches: Array<{ claim: Record<string, unknown>; reasons: string[]; strength: "strong" | "medium" }> = [];

      for (const c of allClaims) {
        const reasons: string[] = [];
        let strength: "strong" | "medium" = "medium";

        if (claimNumber && c.claimNumber && norm(claimNumber) === norm(c.claimNumber)) {
          reasons.push("Identical claim number"); strength = "strong";
        }
        if (homeownerName && c.homeownerName && norm(homeownerName) === norm(c.homeownerName)) {
          reasons.push("Same homeowner name");
          if (propertyAddress && c.propertyAddress && norm(propertyAddress) === norm(c.propertyAddress)) {
            reasons.push("Same property address"); strength = "strong";
          }
        }
        if (carrier && c.carrier && norm(carrier) === norm(c.carrier) && dateOfLoss && c.dateOfLoss) {
          const d1 = new Date(dateOfLoss); const d2 = new Date(c.dateOfLoss);
          if (!isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d1.toDateString() === d2.toDateString()) {
            reasons.push("Same carrier and date of loss");
          }
        }

        if (reasons.length > 0) {
          matches.push({ claim: { ...applyPiiMasking(c, role), id: c.id }, reasons, strength });
        }
      }

      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "CLAIM_DUPLICATE_CHECK", entityType: "claim", entityId: "dedup_check",
        afterJson: { matchCount: matches.length, hasStrongMatch: matches.some((m) => m.strength === "strong") },
        ipAddress: getClientIp(req),
      });

      res.json({ matches, hasStrongMatch: matches.some((m) => m.strength === "strong") });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.post("/api/claims", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const normalized = normalizeClaimInput(req.body);

      // Entity Privacy Guard: validate claim creation gate
      const { evaluateClaimCreationGate, logPrivacyGuardBlock } = await import("./entity-privacy");
      const gate = evaluateClaimCreationGate({
        propertyAddress: normalized.propertyAddress,
        homeownerName: normalized.homeownerName,
        lossType: normalized.lossType,
        dateOfLoss: normalized.dateOfLoss,
        carrierName: normalized.carrierName,
        hasEvidence: true,
      });
      if (!gate.allowed) {
        await logPrivacyGuardBlock(
          normalized.homeownerName || "unknown",
          "claim_create",
          "claim",
          gate.reason || "Claim creation gate failed",
          req.auth!.userId,
          req.auth!.role,
        );
        return res.status(400).json({ message: gate.reason });
      }

      const claim = await storage.createClaim({
        ...normalized,
        organizationId: orgId,
      });

      await storage.createClaimVersion({
        claimId: claim.id,
        organizationId: orgId,
        versionNumber: 1,
        changedByUserId: req.auth!.userId,
        changeReason: "Initial creation",
        snapshotJson: claim,
      });

      await storage.createAuditLog({
        organizationId: orgId,
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        isImpersonation: req.auth!.isImpersonation,
        impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "CLAIM_CREATED",
        entityType: "claim",
        entityId: claim.id,
        afterJson: claim,
        ipAddress: getClientIp(req),
      });

      res.json(claim);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.patch("/api/claims/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const existing = await storage.getClaim(req.params.id as string, orgId);
      if (!existing) return res.status(404).json({ message: "Claim not found" });

      if (existing.status === "closed") {
        const lockedFields = ["claimNumber", "carrier", "dateOfLoss", "propertyAddress"];
        const attempted = Object.keys(req.body).filter(k => lockedFields.includes(k));
        if (attempted.length > 0) {
          return res.status(400).json({ message: `Cannot modify locked fields on closed claim: ${attempted.join(", ")}` });
        }
      }

      const claim = await storage.updateClaim(req.params.id as string, orgId, normalizeClaimInput(req.body));
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const velocity = computeLifecycleVelocity(
        claim.dateOfLoss ? new Date(claim.dateOfLoss) : null,
        claim.inspectionDate ? new Date(claim.inspectionDate) : null,
        claim.determinationDate ? new Date(claim.determinationDate) : null,
        claim.resolutionDate ? new Date(claim.resolutionDate) : null
      );
      if (velocity !== null && velocity !== claim.lifecycleVelocityScore) {
        await storage.updateClaim(req.params.id as string, orgId, { lifecycleVelocityScore: velocity });
      }

      // Re-score after every claim update — non-blocking so it never delays the response.
      const _claimIdForScoring = req.params.id as string;
      computeFullClaimScoring(_claimIdForScoring, orgId)
        .then(scores => storage.updateClaim(_claimIdForScoring, orgId, {
          frictionScore: Math.round(scores.claimFrictionScore),
        } as Partial<import("@shared/schema").InsertClaim>))
        .catch((scoreErr: unknown) => console.error("[scoring-auto] non-fatal (patch):", (scoreErr as Error)?.message));

      const versionNumber = (await storage.getLatestVersionNumber(claim.id)) + 1;
      await storage.createClaimVersion({
        claimId: claim.id,
        organizationId: orgId,
        versionNumber,
        changedByUserId: req.auth!.userId,
        changeReason: req.body.changeReason || "Updated",
        snapshotJson: claim,
      });

      await storage.createAuditLog({
        organizationId: orgId,
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        isImpersonation: req.auth!.isImpersonation,
        impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "CLAIM_UPDATED",
        entityType: "claim",
        entityId: claim.id,
        beforeJson: existing,
        afterJson: claim,
        ipAddress: getClientIp(req),
      });

      res.json(claim);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.delete("/api/claims/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      // Master can delete cross-tenant — try own org first, then any tenant
      let existing = await storage.getClaim(req.params.id as string, orgId);
      if (!existing) {
        existing = await storage.getClaimAnyTenant(req.params.id as string);
      }
      if (!existing) return res.status(404).json({ message: "Claim not found" });

      // Use the claim's actual orgId (not Master's) so the WHERE clause matches
      const deleted = await storage.softDeleteClaim(req.params.id as string, existing.organizationId);
      if (!deleted) return res.status(404).json({ message: "Claim not found" });

      await storage.createAuditLog({
        organizationId: existing.organizationId,
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        actionType: "CLAIM_DELETED",
        entityType: "claim",
        entityId: req.params.id as string,
        beforeJson: existing,
        ipAddress: getClientIp(req),
      });

      res.json({ message: "Deleted" });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Multi-adjuster / cross-claim linkage (Item 7) ──
  // Resolve a claim for the caller (own org, or Master cross-tenant). Returns the
  // claim plus the org scope its adjuster links live in.
  async function resolveClaimForCaller(req: AuthRequest) {
    const role = req.auth!.role;
    const orgId = req.auth!.organizationId;
    let claim = await storage.getClaim(req.params.id as string, orgId);
    if (!claim && role === "master_admin") {
      const all = await storage.getAllClaimsAcrossTenants();
      claim = all.find((c) => c.id === req.params.id) || undefined;
    }
    return claim;
  }

  // GET adjusters linked to a claim (enriched with adjuster name/carrier).
  app.get("/api/claims/:id/adjusters", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const claim = await resolveClaimForCaller(req);
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const scopeOrg = claim.organizationId;
      const links = await storage.getClaimAdjusters(claim.id, scopeOrg);
      const orgAdjusters = role === "master_admin"
        ? await storage.getAllAdjustersAcrossTenants()
        : await storage.getAdjusters(scopeOrg);
      const adjusterMap = new Map(orgAdjusters.map((a) => [a.id, a]));

      const enriched = links.map((link) => {
        const a = adjusterMap.get(link.adjusterId);
        return {
          ...link,
          adjusterName: a?.adjusterName ?? null,
          carrierName: a?.carrierName ?? null,
          region: a?.region ?? null,
        };
      });

      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Link an adjuster to a claim (multiple adjusters per claim supported).
  app.post("/api/claims/:id/adjusters", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      if (role === "executive_admin") {
        await storage.createAuditLog({
          organizationId: req.auth!.organizationId,
          actorUserId: req.auth!.userId,
          actorRole: role,
          actionType: "ADJUSTER_LINK_DENIED",
          entityType: "claim_adjuster",
          entityId: req.params.id as string,
          ipAddress: getClientIp(req),
        });
        return res.status(403).json({ message: "Not permitted for this role" });
      }

      const claim = await resolveClaimForCaller(req);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const scopeOrg = claim.organizationId;

      const adjuster = await storage.getAdjuster(req.body.adjusterId, scopeOrg);
      if (!adjuster) return res.status(400).json({ message: "Adjuster not found in this organization" });

      const requestedRole = req.body.roleOnClaim ?? "unknown";
      const existingLinks = await storage.getClaimAdjusters(claim.id, scopeOrg);
      if (existingLinks.some((l) => l.adjusterId === req.body.adjusterId && l.roleOnClaim === requestedRole)) {
        return res.status(409).json({ message: "This adjuster is already linked to this claim in that role" });
      }

      const link = await storage.linkAdjusterToClaim({
        organizationId: scopeOrg,
        claimId: claim.id,
        adjusterId: req.body.adjusterId,
        carrierId: req.body.carrierId ?? null,
        roleOnClaim: req.body.roleOnClaim ?? "unknown",
        involvementType: req.body.involvementType ?? "unknown",
        sourceType: req.body.sourceType ?? "manual",
        confidenceScore: req.body.confidenceScore ?? 1,
        needsReview: req.body.needsReview ?? false,
        notes: req.body.notes ?? null,
      });

      await storage.createAuditLog({
        organizationId: scopeOrg,
        actorUserId: req.auth!.userId,
        actorRole: role,
        isImpersonation: req.auth!.isImpersonation,
        impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "ADJUSTER_LINKED",
        entityType: "claim_adjuster",
        entityId: link.id,
        afterJson: link,
        ipAddress: getClientIp(req),
      });

      res.json(link);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // Update a claim-adjuster link (role / involvement / review status).
  app.patch("/api/claims/:id/adjusters/:linkId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      if (role === "executive_admin") return res.status(403).json({ message: "Not permitted for this role" });

      const claim = await resolveClaimForCaller(req);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const scopeOrg = claim.organizationId;

      const existing = await storage.getClaimAdjusterLink(req.params.linkId as string, scopeOrg);
      if (!existing || existing.claimId !== claim.id) return res.status(404).json({ message: "Link not found" });

      const patch: Record<string, unknown> = {};
      for (const f of ["roleOnClaim", "involvementType", "carrierId", "confidenceScore", "needsReview", "notes"]) {
        if (req.body[f] !== undefined) patch[f] = req.body[f];
      }

      const updated = await storage.updateClaimAdjusterLink(req.params.linkId as string, scopeOrg, patch);
      if (!updated) return res.status(404).json({ message: "Link not found" });

      await storage.createAuditLog({
        organizationId: scopeOrg,
        actorUserId: req.auth!.userId,
        actorRole: role,
        isImpersonation: req.auth!.isImpersonation,
        impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "ADJUSTER_ROLE_CHANGED",
        entityType: "claim_adjuster",
        entityId: updated.id,
        beforeJson: existing,
        afterJson: updated,
        ipAddress: getClientIp(req),
      });

      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // Unlink an adjuster from a claim (preserves adjuster + other claims; history intact).
  app.delete("/api/claims/:id/adjusters/:linkId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      if (role === "executive_admin") return res.status(403).json({ message: "Not permitted for this role" });

      const claim = await resolveClaimForCaller(req);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const scopeOrg = claim.organizationId;

      const existing = await storage.getClaimAdjusterLink(req.params.linkId as string, scopeOrg);
      if (!existing || existing.claimId !== claim.id) return res.status(404).json({ message: "Link not found" });

      const ok = await storage.unlinkClaimAdjuster(req.params.linkId as string, scopeOrg);
      if (!ok) return res.status(404).json({ message: "Link not found" });

      await storage.createAuditLog({
        organizationId: scopeOrg,
        actorUserId: req.auth!.userId,
        actorRole: role,
        isImpersonation: req.auth!.isImpersonation,
        impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "ADJUSTER_UNLINKED",
        entityType: "claim_adjuster",
        entityId: req.params.linkId as string,
        beforeJson: existing,
        ipAddress: getClientIp(req),
      });

      res.json({ message: "Unlinked" });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Cross-claim history for an adjuster (feeds Adjuster Intelligence / profile).
  app.get("/api/adjusters/:id/claims", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;
      const adjusterId = req.params.id as string;

      const links = role === "master_admin"
        ? await storage.getAdjusterClaims(adjusterId)
        : await storage.getAdjusterClaims(adjusterId, orgId);

      const allClaims = role === "master_admin"
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);
      const claimMap = new Map(allClaims.map((c) => [c.id, c]));

      // Collect the claim IDs already covered by the claimAdjusters join table.
      const linkedClaimIds = new Set(links.map((l) => l.claimId));

      // Legacy fallback: claims linked via the direct claims.adjusterId column
      // are not in the claimAdjusters table. Include them as synthetic link rows
      // so the profile correctly reflects all known cross-claim history.
      const legacyLinks: typeof links = [];
      for (const claim of allClaims) {
        if (claim.adjusterId === adjusterId && !linkedClaimIds.has(claim.id)) {
          legacyLinks.push({
            id: `legacy-${claim.id}`,
            organizationId: claim.organizationId,
            claimId: claim.id,
            adjusterId,
            carrierId: null,
            roleOnClaim: "primary_adjuster",
            involvementType: "unknown",
            firstSeenDate: null,
            lastSeenDate: null,
            sourceDocumentId: null,
            sourceAudioId: null,
            sourceTranscriptId: null,
            sourceCommunicationId: null,
            sourceType: "legacy_backfill",
            confidenceScore: 1,
            needsReview: false,
            notes: null,
            createdAt: claim.createdAt ?? null,
            updatedAt: claim.updatedAt ?? null,
          } as unknown as (typeof links)[0]);
        }
      }

      const allLinks = [...links, ...legacyLinks];
      const claimIds = Array.from(new Set(allLinks.map((l) => l.claimId)));

      const enriched = allLinks.map((link) => {
        const c = claimMap.get(link.claimId);
        return {
          ...link,
          claimNumber: c?.claimNumber ?? null,
          carrier: c?.carrier ?? null,
          status: c?.status ?? null,
          initialOutcome: c?.initialOutcome ?? null,
          finalOutcome: c?.finalOutcome ?? null,
          denialOverturned: c?.denialOverturned ?? null,
        };
      });

      res.json({ linkedClaimCount: claimIds.length, links: enriched });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Adjuster Scorecard (Section 14) — behavioral metrics from REAL linked claims.
  // Separate from cross-claim history; never fabricates; < 3 claims => insufficient.
  // ── Adjuster Intel Report (print-friendly data endpoint) ──────────────────
  app.get("/api/adjusters/:id/report", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;
      const adjusterId = req.params.id as string;

      const adjuster = isMaster(role)
        ? (await storage.getAdjusters(orgId)).find((a) => a.id === adjusterId) ||
          (await storage.getAllAdjustersAcrossTenants()).find((a) => a.id === adjusterId)
        : (await storage.getAdjusters(orgId)).find((a) => a.id === adjusterId);

      if (!adjuster) return res.status(404).json({ message: "Adjuster not found" });

      const links = isMaster(role)
        ? await storage.getAdjusterClaims(adjusterId)
        : await storage.getAdjusterClaims(adjusterId, orgId);
      const allClaims = isMaster(role)
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);

      const scorecard = computeAdjusterScorecard(links, allClaims);

      // Linked claims summary (masked — no PII in report)
      const claimMap = new Map(allClaims.map((c) => [c.id, c]));
      const linkedClaimsummary = Array.from(new Set(links.map((l) => l.claimId)))
        .map((id) => {
          const c = claimMap.get(id);
          if (!c) return null;
          return {
            id: c.id,
            carrier: c.carrier ?? null,
            lossType: c.lossType ?? null,
            status: c.status,
            initialOutcome: c.initialOutcome ?? null,
            finalOutcome: c.finalOutcome ?? null,
            denialOverturned: c.denialOverturned ?? false,
          };
        })
        .filter(Boolean);

      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "ADJUSTER_REPORT_DOWNLOADED", entityType: "adjuster", entityId: adjusterId,
        afterJson: { linkedClaimCount: scorecard.linkedClaimCount }, ipAddress: getClientIp(req),
      });

      res.json({ adjuster, scorecard, linkedClaims: linkedClaimsummary, generatedAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/adjusters/:id/scorecard", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;
      const adjusterId = req.params.id as string;

      const links = isMaster(role)
        ? await storage.getAdjusterClaims(adjusterId)
        : await storage.getAdjusterClaims(adjusterId, orgId);
      const allClaims = isMaster(role)
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);

      const scorecard = computeAdjusterScorecard(links, allClaims);

      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "ADJUSTER_SCORECARD_VIEWED", entityType: "adjuster", entityId: adjusterId,
        afterJson: { linkedClaimCount: scorecard.linkedClaimCount, insufficient: scorecard.insufficient },
        ipAddress: getClientIp(req),
      });

      res.json({ method: "behavioral-pattern-aggregation", ...scorecard });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/adjusters", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const adjustersList = role === "master_admin"
        ? await storage.getAllAdjustersAcrossTenants()
        : await storage.getAdjusters(req.auth!.organizationId);
      res.json(adjustersList);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/adjusters", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const parsed = insertAdjusterSchema.parse({
        ...req.body,
        organizationId: req.auth!.organizationId,
      });
      const adjuster = await storage.createAdjuster(parsed);

      await storage.createAuditLog({
        organizationId: req.auth!.organizationId,
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        actionType: "ADJUSTER_CREATED",
        entityType: "adjuster",
        entityId: adjuster.id,
        afterJson: adjuster,
        ipAddress: getClientIp(req),
      });

      res.json(adjuster);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Carrier Intelligence (MVP) — aggregated from claims, contains no homeowner PII
  // ──────────────────────────────────────────────────────────────────────────
  app.get("/api/carriers/intelligence", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const role = req.auth!.role;
      // Master sees cross-tenant patterns; others see their own tenant's claims.
      const claims = isMaster(role)
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);
      const evidenceFiles = isMaster(role)
        ? await storage.getAllEvidenceFilesAcrossTenants()
        : await storage.getEvidenceFiles(orgId);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "CARRIER_INTELLIGENCE_VIEWED", entityType: "carrier_intelligence", entityId: "aggregate",
        afterJson: { scope: isMaster(role) ? "cross_tenant" : "tenant", carrierCount: undefined },
        ipAddress: getClientIp(req),
      });
      res.json(computeCarrierIntelligence(claims, evidenceFiles));
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AI Timeline / Date Extraction — review candidates
  // ──────────────────────────────────────────────────────────────────────────
  app.get("/api/timeline/candidates", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const claimId = typeof req.query.claimId === "string" ? req.query.claimId : undefined;
      res.json(await storage.getTimelineCandidates(orgId, claimId));
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // Run MVP extraction over provided text (or sample text) and create candidates.
  app.post("/api/claims/:id/extract-timeline", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const claim = await storage.getClaim(req.params.id as string, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const text: string = (typeof req.body?.text === "string" && req.body.text.trim())
        ? req.body.text
        : sampleClaimDocumentText(claim.claimNumber);
      const created = await createCandidatesFromText({
        text, claimId: claim.id, orgId,
        createdByUserId: req.auth!.userId,
        sourceHint: typeof req.body?.sourceHint === "string" ? req.body.sourceHint : undefined,
        sourceDocumentId: req.body?.sourceDocumentId ?? null,
        sourceAudioId: req.body?.sourceAudioId ?? null,
        sourceTranscriptId: req.body?.sourceTranscriptId ?? null,
      });
      // AUDIT uses the upload/action date (now), NOT the extracted event dates.
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "TIMELINE_EXTRACTION_RUN", entityType: "claim", entityId: claim.id,
        afterJson: { createdCount: created.length, usedSample: !req.body?.text },
        ipAddress: getClientIp(req),
      });
      res.json({ created: created.length, events: created });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // Review actions: accept | edit | reject | verify | change event type
  app.patch("/api/timeline/:id/review", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const ev = await storage.getTimelineEvent(req.params.id as string, orgId);
      if (!ev) return res.status(404).json({ message: "Timeline event not found" });
      const action = String(req.body?.action || "");
      const patch: Partial<TimelineEvent> = {};
      if (action === "accept") { patch.reviewStatus = "accepted"; patch.needsReview = false; }
      else if (action === "verify") { patch.reviewStatus = "verified"; patch.needsReview = false; patch.dateSource = "user_entered"; }
      else if (action === "reject") { patch.reviewStatus = "rejected"; patch.needsReview = false; patch.deletedAt = new Date(); }
      else if (action === "edit") {
        patch.reviewStatus = "verified"; patch.needsReview = false; patch.dateSource = "user_entered";
        if (req.body?.eventDate) { const d = new Date(req.body.eventDate); patch.eventDate = d; patch.extractedDate = d; }
        if (typeof req.body?.eventType === "string") patch.eventType = req.body.eventType;
        if (typeof req.body?.title === "string") patch.title = req.body.title;
      } else if (action === "change_type") {
        if (typeof req.body?.eventType === "string") patch.eventType = req.body.eventType;
        if (typeof req.body?.title === "string") patch.title = req.body.title;
      } else {
        return res.status(400).json({ message: "Unknown review action" });
      }
      const updated = await storage.updateTimelineEvent(ev.id, orgId, patch);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "TIMELINE_REVIEW", entityType: "timeline_event", entityId: ev.id,
        beforeJson: ev, afterJson: updated, ipAddress: getClientIp(req),
      });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Playbook Engine (MVP) — historical "what has worked before" patterns
  // ──────────────────────────────────────────────────────────────────────────
  app.get("/api/playbooks", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const entries = await storage.getPlaybookEntries();
      await storage.createAuditLog({
        organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "PLAYBOOK_VIEWED", entityType: "playbook", entityId: "list",
        ipAddress: getClientIp(req),
      });
      // Executive: aggregate metrics only. Master: full. Others: sanitized.
      if (role === "executive_admin") return res.json(entries.map(toPlaybookAggregate));
      return res.json(sanitizePlaybookList(entries, role));
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.get("/api/playbooks/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      if (role === "executive_admin") {
        return res.status(403).json({ message: "Executive role has aggregate-only playbook access" });
      }
      const entry = await storage.getPlaybookEntry(req.params.id as string);
      if (!entry) return res.status(404).json({ message: "Playbook not found" });
      await storage.createAuditLog({
        organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "PLAYBOOK_VIEWED", entityType: "playbook", entityId: entry.id,
        ipAddress: getClientIp(req),
      });
      res.json(sanitizePlaybookRecord(entry, role));
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.post("/api/playbooks/generate", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      if (!isOpenAIConfigured()) {
        return res.status(503).json({ message: "OpenAI integration is not configured. Cannot generate playbook entry." });
      }
      const { scenarioType, carrier, claimType, denialReason } = req.body as Record<string, string | undefined>;
      const generated = await generatePlaybookEntry({ scenarioType, carrier, claimType, denialReason });
      return res.json(generated);
    } catch (err) {
      recordAiError("generatePlaybookEntry", err);
      return res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/playbooks", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const data = insertPlaybookEntrySchema.parse({
        ...req.body,
        organizationId: req.auth!.organizationId,
        createdBy: req.auth!.userId,
      });
      const entry = await storage.createPlaybookEntry(data);
      await storage.createAuditLog({
        organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "PLAYBOOK_CREATED", entityType: "playbook", entityId: entry.id,
        afterJson: entry, ipAddress: getClientIp(req),
      });
      res.json(entry);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.patch("/api/playbooks/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const existing = await storage.getPlaybookEntry(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "Playbook not found" });
      const updated = await storage.updatePlaybookEntry(existing.id, req.body);
      await storage.createAuditLog({
        organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "PLAYBOOK_EDITED", entityType: "playbook", entityId: existing.id,
        beforeJson: existing, afterJson: updated, ipAddress: getClientIp(req),
      });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.delete("/api/playbooks/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const existing = await storage.getPlaybookEntry(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "Playbook not found" });
      await storage.softDeletePlaybookEntry(existing.id);
      await storage.createAuditLog({
        organizationId: req.auth!.organizationId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "PLAYBOOK_DELETED", entityType: "playbook", entityId: existing.id,
        beforeJson: existing, ipAddress: getClientIp(req),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // Action Engine ↔ Playbook bridge: MVP rule-based recommendation for a claim.
  app.get("/api/claims/:id/playbook-recommendations", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const role = req.auth!.role;
      const claim = await storage.getClaim(req.params.id as string, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const all = await storage.getPlaybookEntries();
      // Rule-based scoring: match carrier / claimType / denial reason / scenario signals.
      // Carrier matching is bidirectional includes() to handle variants like
      // "State Farm" vs "State Farm Insurance Company".
      const carrierMatch = (a: string, b: string): boolean => {
        const al = a.toLowerCase(), bl = b.toLowerCase();
        return al === bl || al.includes(bl) || bl.includes(al);
      };
      const scored = all.map((pb) => {
        let score = 0;
        const reasons: string[] = [];
        if (pb.carrier && claim.carrier && carrierMatch(pb.carrier, claim.carrier)) { score += 3; reasons.push("same carrier"); }
        const claimLossType = String(claim.claimType || claim.lossType || "").toLowerCase();
        if (pb.claimType && claimLossType) {
          const pbType = pb.claimType.toLowerCase();
          if (pbType === claimLossType || pbType.split(/[\s\/]/).some((t) => claimLossType.includes(t)) || claimLossType.split(/[\s\/]/).some((t) => pbType.includes(t))) {
            score += 2; reasons.push("same claim type");
          }
        }
        if (pb.denialReason && claim.denialReason && pb.denialReason.toLowerCase().includes(claim.denialReason.toLowerCase().slice(0, 6))) { score += 3; reasons.push("similar denial reason"); }
        if (pb.escalationUsed && claim.escalationUsed) { score += 1; reasons.push("escalation context"); }
        if (pb.region && claim.state && pb.region.toLowerCase() === claim.state.toLowerCase()) { score += 1; reasons.push("same region"); }
        return { playbook: sanitizePlaybookRecord(pb, role), matchScore: score, matchReasons: reasons };
      }).filter((x) => x.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore).slice(0, 5);

      // AI strategy synthesis — runs after rule-based matching when OpenAI is available.
      // If no library matches exist, fall back to pure AI recommendations.
      let aiStrategy = null;
      let aiFallbackRecs: Array<{ playbook: { id: string; title: string; recommendedNextStep?: string | null; source?: string }; matchScore: number; matchReasons: string[] }> = [];
      let method = "rule-based";

      if (scored.length > 0 && isOpenAIConfigured()) {
        try {
          aiStrategy = await generatePlaybookStrategy(claim, scored.map((s) => s.playbook));
          method = "AI-enhanced";
        } catch (aiErr) {
          recordAiError("generatePlaybookStrategy", aiErr);
          console.error("[playbook-ai] strategy generation failed (non-fatal):", (aiErr as Error)?.message);
        }
      } else if (scored.length === 0 && isOpenAIConfigured()) {
        // No library matches — generate pure AI fallback recommendations
        try {
          const fallback = await generateAiFallbackPlaybookRecs(claim);
          aiFallbackRecs = fallback.map((rec, i) => ({
            playbook: {
              id: `ai-fallback-${i}`,
              title: rec.title,
              recommendedNextStep: rec.recommendedNextStep,
              source: "ai_generated",
            },
            matchScore: 0,
            matchReasons: [rec.rationale],
          }));
          method = "AI-generated";
        } catch (aiErr) {
          recordAiError("generateAiFallbackPlaybookRecs", aiErr);
          console.error("[playbook-ai] fallback generation failed (non-fatal):", (aiErr as Error)?.message);
        }
      }

      const allRecommendations = scored.length > 0 ? scored : aiFallbackRecs;

      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "PLAYBOOK_RECOMMENDATION_GENERATED", entityType: "claim", entityId: claim.id,
        afterJson: { count: allRecommendations.length, aiStrategy: !!aiStrategy, aiFallback: aiFallbackRecs.length > 0 }, ipAddress: getClientIp(req),
      });
      res.json({ method, recommendations: allRecommendations, aiStrategy });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // ── Section 17A — Playbook Recommendation Engine ───────────────────────────
  // Finds REAL historical claims similar to this claim. Separate from Action
  // Engine and from the curated /playbook-recommendations library.
  app.get("/api/claims/:id/playbook-matches", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const role = req.auth!.role;
      const claimId = req.params.id as string;

      let target = await storage.getClaim(claimId, orgId);
      if (!target && isMaster(role)) {
        const all = await storage.getAllClaimsAcrossTenants();
        target = all.find((c) => c.id === claimId);
      }
      if (!target) return res.status(404).json({ message: "Claim not found" });

      const allClaims = isMaster(role)
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);

      // Bulk load adjusters for name resolution.
      const allAdj = isMaster(role)
        ? await storage.getAllAdjustersAcrossTenants()
        : await storage.getAdjusters(orgId);
      const adjById = new Map(allAdj.map((a) => [a.id, a.adjusterName as string]));

      // Get target adjuster IDs and resolve which candidate claims share them.
      const targetLinks = await storage.getClaimAdjusters(claimId, isMaster(role) ? undefined : orgId);
      const targetAdjIds = new Set(targetLinks.map((l) => l.adjusterId));

      // For each target adjuster, fetch the other claims they're linked to.
      const sharedAdjClaimIds = new Set<string>();
      for (const adjId of Array.from(targetAdjIds)) {
        const adjLinks = isMaster(role)
          ? await storage.getAdjusterClaims(adjId)
          : await storage.getAdjusterClaims(adjId, orgId);
        adjLinks.forEach((l) => sharedAdjClaimIds.add(l.claimId));
      }

      // Candidates: usable outcomes, not the target claim itself.
      const candidates = allClaims.filter((c) => c.id !== claimId && isUsableOutcome(c));

      // Score all candidates.
      const scored = candidates.map((c) => {
        const candidateAdjIds = sharedAdjClaimIds.has(c.id)
          ? targetAdjIds // approximation: shared = overlapping
          : new Set<string>();
        const { score, factors } = similarityScore(target!, c, targetAdjIds, candidateAdjIds);
        return { c, score, factors };
      }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

      if (scored.length === 0) {
        await storage.createAuditLog({
          organizationId: orgId, actorUserId: req.auth!.userId, actorRole: role,
          isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
          actionType: "PLAYBOOK_RECOMMENDATION_VIEWED", entityType: "claim", entityId: claimId,
          afterJson: { matchCount: 0 }, ipAddress: getClientIp(req),
        });
        return res.json({ method: "MVP rule-based", matches: [], message: "No similar playbook history found yet." });
      }

      // Build result cards.
      const matches = await Promise.all(scored.map(async ({ c, score, factors }) => {
        const links = await storage.getClaimAdjusters(c.id, isMaster(role) ? undefined : orgId);
        const adjNames = links.map((l) => adjById.get(l.adjusterId)).filter(Boolean) as string[];
        const masked = applyPiiMasking(c, role);
        const strategy = buildStrategySummary(c);
        return {
          claimId: c.id,
          claimIdentifier: masked.claimNumber ?? "Claim (masked)",
          carrier: c.carrier,
          lossType: c.lossType,
          adjusters: adjNames,
          initialOutcome: c.initialOutcome ?? null,
          finalOutcome: c.finalOutcome ?? null,
          escalationUsed: c.escalationUsed ?? false,
          reinspectionRequested: c.reinspectionRequested ?? false,
          similarityScore: score,
          keyFactors: factors,
          strategySummary: strategy,
        };
      }));

      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "PLAYBOOK_RECOMMENDATION_VIEWED", entityType: "claim", entityId: claimId,
        afterJson: { matchCount: matches.length, topScore: scored[0]?.score }, ipAddress: getClientIp(req),
      });

      res.json({ method: "MVP rule-based", similarClaimsFound: matches.length, matches });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Section 17 — Playbook Search Engine ────────────────────────────────────
  // NL query → deterministic filters → role-scoped, PII-masked historical claim
  // result cards + reusable strategy summaries. Executive role gets aggregate only.
  // Separate from Action Engine (/api/playbooks*) and 17A similarity above.
  app.post("/api/playbook/search", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const role = req.auth!.role;
      const { query = "", filters: explicitFilters = {}, page = 1 } = req.body as {
        query?: string;
        filters?: PlaybookFilters;
        page?: number;
      };
      const PAGE_SIZE = 20;

      const allClaims = isMaster(role)
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);

      // Build carrier name list for NL parser context.
      const knownCarriers = Array.from(new Set(allClaims.map((c) => c.carrier).filter(Boolean))) as string[];

      // Parse NL query → filters: AI-first, keyword fallback.
      let parsedFilters: PlaybookFilters;
      let searchMethod = "rule-based natural-language parsing";
      if (query.trim() && isOpenAIConfigured()) {
        try {
          const aiFilters = await parsePlaybookQueryWithAI(query, knownCarriers);
          // Merge AI filters with keyword-parsed fallback (AI wins on overlapping keys).
          parsedFilters = { ...parseQueryToFilters(query, knownCarriers), ...aiFilters };
          searchMethod = "AI-enhanced natural-language parsing";
        } catch (aiErr) {
          recordAiError("parsePlaybookQueryWithAI", aiErr);
          parsedFilters = parseQueryToFilters(query, knownCarriers);
        }
      } else {
        parsedFilters = parseQueryToFilters(query, knownCarriers);
      }
      const merged: PlaybookFilters = { ...parsedFilters, ...explicitFilters };

      // Bulk load adjusters for name resolution.
      const allAdj = isMaster(role)
        ? await storage.getAllAdjustersAcrossTenants()
        : await storage.getAdjusters(orgId);
      const adjById = new Map(allAdj.map((a) => [a.id, a.adjusterName as string]));

      // Build adjusterNames-by-claim for adjuster-name filtering when needed.
      // We lazily resolve only if adjusterName filter is set.
      let adjNamesByClaim: Map<string, string[]> | undefined;
      if (merged.adjusterName) {
        adjNamesByClaim = new Map();
        const usableCandidates = allClaims.filter(isUsableOutcome);
        for (const c of usableCandidates) {
          const links = await storage.getClaimAdjusters(c.id, isMaster(role) ? undefined : orgId);
          adjNamesByClaim.set(c.id, links.map((l) => adjById.get(l.adjusterId)).filter(Boolean) as string[]);
        }
      }

      // Filter claims to usable outcomes, then apply search filters.
      const usable = allClaims.filter(isUsableOutcome);
      const filtered = filterClaims(usable, merged, adjNamesByClaim);

      // Audit the search.
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "PLAYBOOK_SEARCH_PERFORMED", entityType: "playbook_search", entityId: "search",
        afterJson: { query, matchCount: filtered.length, filtersApplied: Object.keys(merged).length },
        ipAddress: getClientIp(req),
      });

      // Executive role: aggregate intelligence only — no individual claim cards.
      if (role === "executive_admin") {
        if (filtered.length === 0) {
          return res.json({ executiveAggregateOnly: true, totalResults: 0, message: "No matching playbook history found yet." });
        }
        const overturned = filtered.filter((c) => c.denialOverturned === true).length;
        const denied = filtered.filter((c) => c.initialOutcome?.toLowerCase().includes("deni")).length;
        const topCarriers = Array.from(
          filtered.reduce((m, c) => { m.set(c.carrier || "Unknown", (m.get(c.carrier || "Unknown") || 0) + 1); return m; }, new Map<string, number>())
        ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
        return res.json({
          executiveAggregateOnly: true, totalResults: filtered.length,
          overturnRate: denied > 0 ? Math.round((overturned / denied) * 100) : null,
          topCarriers,
          message: filtered.length < 3 ? "Limited historical evidence available." : null,
        });
      }

      if (filtered.length === 0) {
        return res.json({ totalResults: 0, results: [], message: "No matching playbook history found yet.", method: searchMethod });
      }

      const confidenceNote = filtered.length <= 2 ? "Limited historical evidence available." : null;

      // Paginate and build masked result cards.
      const pageStart = (page - 1) * PAGE_SIZE;
      const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

      const results = await Promise.all(pageItems.map(async (c) => {
        const links = await storage.getClaimAdjusters(c.id, isMaster(role) ? undefined : orgId);
        const adjNames = links.map((l) => adjById.get(l.adjusterId)).filter(Boolean) as string[];
        const masked = applyPiiMasking(c, role);
        const strategy = buildStrategySummary(c);
        return {
          claimId: c.id,
          claimIdentifier: masked.claimNumber ?? "Claim (masked)",
          carrier: c.carrier,
          lossType: c.lossType,
          adjusters: adjNames,
          initialOutcome: c.initialOutcome ?? null,
          finalOutcome: c.finalOutcome ?? null,
          escalationUsed: c.escalationUsed ?? false,
          reinspectionRequested: c.reinspectionRequested ?? false,
          strategySummary: strategy,
        };
      }));

      res.json({
        method: searchMethod,
        totalResults: filtered.length,
        page, pageSize: PAGE_SIZE,
        parsedFilters: merged,
        results,
        confidenceNote,
      });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // AI-generated claim analysis (OpenAI). Persists narrative + structured intelligence.
  app.post("/api/claims/:id/ai-analysis", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      if (!isOpenAIConfigured()) {
        return res.status(503).json({ message: "AI analysis is not configured." });
      }
      const orgId = req.auth!.organizationId;
      const role = req.auth!.role;
      let claim = await storage.getClaim(req.params.id as string, orgId);
      if (!claim && role === "master_admin") {
        const all = await storage.getAllClaimsAcrossTenants();
        claim = all.find((c) => c.id === req.params.id) || undefined;
      }
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const analysis = await generateClaimAnalysis(claim);
      const generatedAt = new Date();
      const updated = await storage.updateClaim(claim.id, claim.organizationId, {
        aiClaimSummary: analysis.narrative,
        aiAnalysisJson: analysis as unknown as Record<string, unknown>,
        aiAnalysisAt: generatedAt,
      });

      await storage.createAuditLog({
        organizationId: claim.organizationId,
        actorUserId: req.auth!.userId,
        actorRole: role,
        isImpersonation: req.auth!.isImpersonation,
        impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "CLAIM_AI_ANALYSIS_GENERATED",
        entityType: "claim",
        entityId: claim.id,
        ipAddress: getClientIp(req),
      });

      res.json({ analysis, generatedAt: generatedAt.toISOString(), claim: updated });
    } catch (err) {
      recordAiError("generateClaimAnalysis", err);
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // AI pattern detection: what worked to go from denial to approval
  app.get("/api/claims/:id/denial-patterns", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      if (!isOpenAIConfigured()) {
        return res.status(503).json({ message: "AI pattern detection is not configured." });
      }
      const orgId = req.auth!.organizationId;
      const role = req.auth!.role;
      let target = await storage.getClaim(req.params.id as string, orgId);
      if (!target && role === "master_admin") {
        const all = await storage.getAllClaimsAcrossTenants();
        target = all.find((c) => c.id === req.params.id) || undefined;
      }
      if (!target) return res.status(404).json({ message: "Claim not found" });

      const allClaims = isMaster(role)
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);

      const allAdj = isMaster(role)
        ? await storage.getAllAdjustersAcrossTenants()
        : await storage.getAdjusters(orgId);
      const adjById = new Map(allAdj.map((a) => [a.id, a.adjusterName as string]));

      const allFiles = isMaster(role)
        ? await storage.getAllEvidenceFilesAcrossTenants()
        : await storage.getEvidenceFiles(orgId);

      const allEvents = isMaster(role)
        ? await storage.getAllTimelineEvents()
        : await storage.getTimelineEventsByOrgId(orgId);

      const deniedThenApproved = allClaims.filter((c) => {
        if (c.id === target!.id) return false;
        const initialDenied = c.initialOutcome && (c.initialOutcome.toLowerCase().includes("deni") || c.initialOutcome.toLowerCase().includes("reject"));
        const finalApproved = c.finalOutcome && (c.finalOutcome.toLowerCase().includes("approv") || c.finalOutcome.toLowerCase().includes("full") || c.finalOutcome.toLowerCase().includes("paid"));
        return c.denialOverturned || (initialDenied && finalApproved);
      });

      const historicalCases = await Promise.all(
        deniedThenApproved.slice(0, 20).map(async (c) => {
          const links = await storage.getClaimAdjusters(c.id, isMaster(role) ? undefined : orgId);
          const adjusterNames = links.map((l) => adjById.get(l.adjusterId)).filter(Boolean) as string[];
          const claimFiles = allFiles.filter((f: { claimId: string | null }) => f.claimId === c.id);
          const evidenceCategories = Array.from(new Set(claimFiles.map((f: { docCategory: string | null }) => f.docCategory).filter((v): v is string => v !== null)));
          const claimEvents = allEvents.filter((e: { claimId: string | null }) => e.claimId === c.id);
          const timelinePhases = Array.from(new Set(claimEvents.map((e: { eventType: string }) => e.eventType).filter(Boolean)));
          return {
            carrier: c.carrier || "Unknown",
            lossType: c.lossType || undefined,
            claimType: c.claimType || undefined,
            initialOutcome: c.initialOutcome || undefined,
            finalOutcome: c.finalOutcome || undefined,
            denialReason: c.denialReason || undefined,
            whatWorked: c.whatWorked || undefined,
            whatDidNotWork: c.whatDidNotWork || undefined,
            escalationUsed: c.escalationUsed || false,
            reinspectionRequested: c.reinspectionRequested || false,
            reinspectionOutcome: c.reinspectionOutcome || undefined,
            supplementOutcome: c.supplementOutcome || undefined,
            denialOverturned: c.denialOverturned || false,
            adjusterNames,
            evidenceCategories,
            timelinePhases,
            aiSummary: c.aiClaimSummary || undefined,
          };
        })
      );

      const result = await generateDenialToApprovalPatterns(
        {
          carrier: target.carrier || undefined,
          lossType: target.lossType || undefined,
          claimType: target.claimType || undefined,
          denialReason: target.denialReason || undefined,
          city: target.city || undefined,
          state: target.state || undefined,
        },
        historicalCases
      );

      await storage.createAuditLog({
        organizationId: orgId,
        actorUserId: req.auth!.userId,
        actorRole: role,
        isImpersonation: req.auth!.isImpersonation,
        impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "DENIAL_PATTERN_ANALYSIS",
        entityType: "claim",
        entityId: target.id,
        afterJson: { caseCount: historicalCases.length, confidence: result.confidence },
        ipAddress: getClientIp(req),
      });

      res.json({
        available: true,
        caseCount: historicalCases.length,
        ...result,
      });
    } catch (err) {
      recordAiError("generateDenialToApprovalPatterns", err);
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Historical weather for the claim's date of loss (keyless Open-Meteo).
  app.get("/api/claims/:id/weather", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const role = req.auth!.role;
      let claim = await storage.getClaim(req.params.id as string, orgId);
      if (!claim && role === "master_admin") {
        const all = await storage.getAllClaimsAcrossTenants();
        claim = all.find((c) => c.id === req.params.id) || undefined;
      }
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const weatherResult = await getClaimWeather(claim);
      if (!weatherResult) {
        return res.json({ available: false, reason: "Insufficient location or date-of-loss data to resolve weather." });
      }
      const { weather } = weatherResult;

      // Audit cross-tenant access (master_admin viewing another org's claim).
      if (claim.organizationId !== orgId) {
        await storage.createAuditLog({
          organizationId: claim.organizationId,
          actorUserId: req.auth!.userId,
          actorRole: role,
          isImpersonation: req.auth!.isImpersonation,
          impersonatorUserId: req.auth!.impersonatorUserId,
          actionType: "CLAIM_WEATHER_VIEWED_CROSS_TENANT",
          entityType: "claim",
          entityId: claim.id,
          ipAddress: getClientIp(req),
        });
      }

      const { latitude: _lat, longitude: _lng, ...safeWeather } = weather;
      res.json({ available: true, weather: safeWeather });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Claim-specific transcripts endpoint ───────────────────────────────
  app.get("/api/claims/:id/transcripts", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const claim = await storage.getClaim(req.params.id as string, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const transcripts = await storage.getAudioRecordings(claim.id, orgId);
      res.json(transcripts);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Capture claim outcome as playbook (auto-populated) ───────────────
  app.post("/api/claims/:id/generate-playbook-draft", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const claim = await storage.getClaim(req.params.id as string, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const linkedAdjs = await storage.getClaimAdjusters(claim.id);
      const primaryAdj = linkedAdjs.find(l => l.roleOnClaim === "primary_adjuster");
      const adjuster = primaryAdj ? await storage.getAdjuster(primaryAdj.adjusterId, orgId) : null;

      const vendor = claim.vendorName ? { vendorName: claim.vendorName, vendorType: claim.vendorType } : null;
      const evidence = await storage.getEvidenceFiles(orgId, claim.id);
      const docs = evidence.filter(e => !e.fileName.match(/\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i));
      const audioFiles = evidence.filter(e => e.fileName.match(/\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i));

      const transcripts: Array<{ id: string; evidenceFileId?: string | null; transcriptText?: string | null; transcriptStatus?: string | null; }> = [];
      for (const audio of audioFiles) {
        const ar = await storage.getAudioRecordingByEvidenceFile(audio.id);
        if (ar) {
          transcripts.push({ id: ar.id, evidenceFileId: ar.evidenceFileId, transcriptText: ar.transcriptText, transcriptStatus: ar.transcriptStatus });
        }
      }

      const timelineEvents = await storage.getTimelineEvents(claim.id, orgId);

      if (!isOpenAIConfigured()) {
        return res.status(503).json({ message: "AI service is not configured." });
      }

      const draft = await generatePlaybookDraft(claim, {
        evidenceFiles: docs,
        transcripts,
        timelineEvents: timelineEvents.map(t => ({ id: t.id, eventType: t.eventType, description: t.description, eventDate: t.eventDate })),
        adjuster: adjuster ? { adjusterName: adjuster.adjusterName, carrierName: adjuster.carrierName } : null,
        vendor: vendor ? { vendorName: vendor.vendorName, vendorType: vendor.vendorType } : null,
      });

      return res.json(draft);
    } catch (err) {
      console.error("[generate-playbook-draft] error", err);
      return res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/claims/:id/capture-playbook", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const role = req.auth!.role;
      const claim = await storage.getClaim(req.params.id as string, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      // Gather claim adjusters
      const linkedAdjs = await storage.getClaimAdjusters(claim.id);
      const primaryAdj = linkedAdjs.find(l => l.roleOnClaim === "primary_adjuster");
      const adjuster = primaryAdj ? await storage.getAdjuster(primaryAdj.adjusterId, orgId) : undefined;

      const evidence = await storage.getEvidenceFiles(orgId, claim.id);
      const audioEvidence = evidence.filter(e => e.fileName.match(/\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i));
      const docEvidence = evidence.filter(e => !e.fileName.match(/\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i));

      const data = insertPlaybookEntrySchema.parse({
        ...req.body,
        organizationId: orgId,
        sourceClaimId: claim.id,
        carrier: claim.carrier || undefined,
        adjuster: adjuster?.adjusterName || undefined,
        adjusterId: adjuster?.id || undefined,
        claimType: claim.claimType || claim.lossType || undefined,
        denialReason: claim.denialReason || undefined,
        outcome: claim.finalOutcome || claim.initialOutcome || undefined,
        outcomeType: claim.finalOutcome || claim.initialOutcome || undefined,
        state: claim.state || undefined,
        region: claim.city || undefined,
        actionTaken: claim.notes || undefined,
        whatWorked: claim.whatWorked || undefined,
        recommendedNextStep: claim.actionNote || undefined,
        timelineSummary: claim.notes || undefined,
        documentationUsed: docEvidence.map(e => e.docCategory).filter(Boolean),
        metadataJson: {
          evidenceFileIds: docEvidence.map(e => e.id),
          audioFileIds: audioEvidence.map(e => e.id),
          claimStatus: claim.status,
          claimPhase: claim.currentPhase,
          supplementAmount: claim.supplementAmountTotal,
          approvedAmount: claim.approvedAmount,
          rcvAmount: claim.rcvAmount,
          acvAmount: claim.acvAmount,
          deductible: claim.deductible,
        },
        createdBy: userId,
      });
      const entry = await storage.createPlaybookEntry(data);
      await storage.createAuditLog({
        organizationId: orgId,
        actorUserId: userId,
        actorRole: role,
        isImpersonation: req.auth!.isImpersonation,
        impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "PLAYBOOK_CREATED",
        entityType: "playbook",
        entityId: entry.id,
        afterJson: entry,
        ipAddress: getClientIp(req),
      });
      res.json(entry);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.use("/api/evidence", requireAuth, requireActiveSubscription, evidenceRouter);
  app.use("/api/intelligence", requireAuth, requireActiveSubscription, intelligenceRouter);

  // IRC / Building Codes lookup
  app.get("/api/irc-codes", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const codes = await storage.getIrcCodes();
      res.json(codes);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/claims/:id/irc-screening", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const role = req.auth!.role;
      let claim = await storage.getClaim(req.params.id as string, orgId);
      if (!claim && role === "master_admin") {
        const all = await storage.getAllClaimsAcrossTenants();
        claim = all.find((c) => c.id === req.params.id) || undefined;
      }
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const allCodes = await storage.getIrcCodes();
      const claimType = (claim.claimType || claim.lossType || "").toLowerCase();
      const state = (claim.state || "").toUpperCase();
      const city = claim.city || "";

      // Match codes by claim type keywords
      const matched = allCodes.filter((code) => {
        const kw = code.supplementTriggerKeywords as string[] | null;
        if (!kw || !Array.isArray(kw)) return false;
        return kw.some((k) => claimType.includes(k.toLowerCase()));
      });

      // Also include common roofing/building codes for all claims
      const commonCodes = allCodes.filter((code) => {
        const ref = code.codeReference?.toLowerCase() || "";
        return ref.includes("r905") || ref.includes("r907") || ref.includes("r806");
      });

      const screening = Array.from(new Map([...matched, ...commonCodes].map((c) => [c.id, c])).values());

      res.json({
        available: screening.length > 0,
        state,
        city,
        claimType: claim.claimType || claim.lossType || "unknown",
        codes: screening,
        permitNote: `Permit requirements vary by jurisdiction. Contact ${city || "your local"} building department for exact permit rules.`,
      });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Audio recordings
  app.get("/api/audio", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const recordings = await storage.getAudioRecordingsByOrg(req.auth!.organizationId);
      res.json(recordings);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/audio/claim/:claimId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const recordings = await storage.getAudioRecordings(req.params.claimId as string, req.auth!.organizationId);
      res.json(recordings);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/audio", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const recording = await storage.createAudioRecording({
        organizationId: req.auth!.organizationId,
        uploadedByUserId: req.auth!.userId,
        claimId: req.body.claimId || null,
        fileUrl: req.body.fileUrl || null,
        durationSeconds: req.body.durationSeconds ? Number(req.body.durationSeconds) : null,
        transcriptText: req.body.transcriptText || null,
      });
      res.json(recording);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.patch("/api/audio/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateAudioRecording(req.params.id as string, req.auth!.organizationId, req.body);
      if (!updated) return res.status(404).json({ message: "Recording not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // AI transcription: accepts a base64-encoded audio file, transcribes via OpenAI,
  // and creates an audio_recording with the resulting transcript text.
  app.post(
    "/api/audio/transcribe",
    express.json({ limit: "30mb" }),
    requireAuth,
    requireActiveSubscription,
    async (req: AuthRequest, res) => {
      try {
        if (!isOpenAIConfigured()) {
          return res.status(503).json({ message: "Transcription is not configured." });
        }
        const { audioBase64, fileName, claimId, durationSeconds } = req.body || {};
        if (!audioBase64 || typeof audioBase64 !== "string") {
          return res.status(400).json({ message: "audioBase64 is required" });
        }
        const base64 = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
        const buffer = Buffer.from(base64, "base64");
        if (buffer.length === 0) return res.status(400).json({ message: "Empty audio payload" });

        const sha256Hash = createHash("sha256").update(buffer).digest("hex");
        const transcriptText = await transcribeAudio(buffer);

        // Run LLM field extraction on the transcript so spoken claim data
        // (claim #, carrier, adjuster, dates, amounts) is captured for review.
        let transcriptExtraction = null;
        if (transcriptText && transcriptText.trim().length > 80) {
          try {
            transcriptExtraction = await extractClaimFieldsFromText(transcriptText, "transcript");
          } catch (extErr) {
            recordAiError("extractClaimFieldsFromText/transcript", extErr);
            console.error("[audio/transcribe] extraction non-fatal:", (extErr as Error)?.message);
          }
        }

        const recording = await storage.createAudioRecording({
          organizationId: req.auth!.organizationId,
          uploadedByUserId: req.auth!.userId,
          claimId: claimId || null,
          fileUrl: fileName ? `#upload/${fileName}` : null,
          durationSeconds: durationSeconds ? Number(durationSeconds) : null,
          sha256Hash,
          transcriptText,
        });

        await storage.createAuditLog({
          organizationId: req.auth!.organizationId,
          actorUserId: req.auth!.userId,
          actorRole: req.auth!.role,
          isImpersonation: req.auth!.isImpersonation,
          impersonatorUserId: req.auth!.impersonatorUserId,
          actionType: "AUDIO_TRANSCRIBED",
          entityType: "audio_recording",
          entityId: recording.id,
          ipAddress: getClientIp(req),
        });

        // Connect audio to claim intelligence: when the recording is linked to a
        // claim, run MVP timeline/date extraction over the transcript so spoken
        // events (loss date, inspection, denial, etc.) feed the claim's timeline.
        let extractedEventCount = 0;
        let linkedClaim: Awaited<ReturnType<typeof storage.getClaim>> | null = null;
        if (claimId && transcriptText && transcriptText.trim()) {
          try {
            linkedClaim = await storage.getClaim(claimId, req.auth!.organizationId);
            if (linkedClaim) {
              const created = await createCandidatesFromText({
                text: transcriptText,
                claimId: linkedClaim.id,
                orgId: req.auth!.organizationId,
                createdByUserId: req.auth!.userId,
                sourceHint: "transcript",
                sourceAudioId: recording.id,
              });
              extractedEventCount = created.length;
              if (extractedEventCount > 0) {
                await storage.createAuditLog({
                  organizationId: req.auth!.organizationId,
                  actorUserId: req.auth!.userId,
                  actorRole: req.auth!.role,
                  isImpersonation: req.auth!.isImpersonation,
                  impersonatorUserId: req.auth!.impersonatorUserId,
                  actionType: "TIMELINE_EXTRACTION_RUN",
                  entityType: "claim",
                  entityId: linkedClaim.id,
                  afterJson: { createdCount: extractedEventCount, source: "audio_transcript", audioId: recording.id },
                  ipAddress: getClientIp(req),
                });
              }
            }
          } catch (extractErr) {
            // Extraction is best-effort; transcription itself already succeeded.
            console.error("[audio/transcribe] timeline extraction failed:", (extractErr as Error)?.message);
          }
        }

        // Auto-link adjusters mentioned in the transcript to the associated claim.
        if (claimId && transcriptText && transcriptText.trim()) {
          try {
            const transcriptOrgId = linkedClaim?.organizationId || req.auth!.organizationId;
            const transcriptCarrier = linkedClaim?.carrier || undefined;

            const llmExtracted = await extractAdjustersFromTranscript(transcriptText);
            const llmMentions: AdjusterMention[] = llmExtracted.map(m => ({
              name: m.name,
              roleLabel: m.roleLabel,
              carrier: m.carrier || transcriptCarrier,
              confidenceScore: 0.85,
            }));
            console.log(`[audio/transcribe] LLM extracted ${llmMentions.length} adjuster mention(s) from transcript`);

            if (llmMentions.length > 0) {
              await extractAndLinkAdjustersForClaim(claimId, transcriptOrgId, llmMentions, {
                sourceType: "transcript",
                sourceTranscriptId: recording.id,
              });
            }
          } catch (adjErr) {
            // Non-fatal: adjuster extraction failure must never break transcription.
            console.error("[audio/transcribe] adjuster extraction non-fatal:", (adjErr as Error)?.message);
          }
        }

        res.json({ ...recording, extractedEventCount, extraction: transcriptExtraction });
      } catch (err) {
        res.status(500).json({ message: (err as Error).message });
      }
    }
  );

  // Communications (emails table)
  app.get("/api/communications", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const comms = await storage.getEmailsByOrg(req.auth!.organizationId);
      res.json(comms);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/communications/claim/:claimId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const comms = await storage.getEmails(req.params.claimId as string, req.auth!.organizationId);
      res.json(comms);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/communications", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      if (!req.body.claimId) return res.status(400).json({ message: "claimId is required" });
      if (!req.body.body) return res.status(400).json({ message: "body is required" });
      const comm = await storage.createEmail({
        claimId: req.body.claimId,
        organizationId: req.auth!.organizationId,
        direction: req.body.direction || "incoming",
        subject: req.body.subject || "other",
        body: req.body.body,
      });
      res.json(comm);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.use("/api", exportsRouter);

  app.get("/api/clients", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const clientsList = await storage.getClients(req.auth!.organizationId);
      res.json(clientsList);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/clients/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const client = await storage.getClient(req.params.id as string, req.auth!.organizationId);
      if (!client) return res.status(404).json({ message: "Client not found" });
      res.json(client);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/clients", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const parsed = insertClientSchema.parse({
        ...req.body,
        organizationId: req.auth!.organizationId,
      });
      const client = await storage.createClient(parsed);
      res.json(client);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.put("/api/clients/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateClient(req.params.id as string, req.auth!.organizationId, req.body);
      if (!updated) return res.status(404).json({ message: "Client not found" });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.get("/api/claims/:claimId/supplements", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const supps = await storage.getSupplements(req.params.claimId as string, req.auth!.organizationId);
      res.json(supps);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/claims/:claimId/supplements", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const parsed = insertSupplementSchema.parse({
        ...req.body,
        claimId: req.params.claimId as string,
        organizationId: req.auth!.organizationId,
      });
      const supp = await storage.createSupplement(parsed);
      res.json(supp);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.put("/api/supplements/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateSupplement(req.params.id as string, req.auth!.organizationId, req.body);
      if (!updated) return res.status(404).json({ message: "Supplement not found" });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // ── Revenue Intelligence ──────────────────────────────────────────────
  app.get("/api/revenue/opportunities", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, role } = req.auth!;
      const isGlobal = isMaster(role);
      const orgScoped = orgId;
      const opps = isGlobal
        ? await storage.getAllRevenueOpportunitiesAcrossTenants()
        : await storage.getRevenueOpportunities(orgScoped);
      res.json(opps);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.post("/api/revenue/opportunities", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId } = req.auth!;
      const parsed = insertRevenueOpportunitySchema.parse({ ...req.body, organizationId: orgId });
      const opp = await storage.createRevenueOpportunity(parsed);
      res.status(201).json(opp);
    } catch (err) { res.status(400).json({ message: (err as Error).message }); }
  });

  app.put("/api/revenue/opportunities/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId } = req.auth!;
      const updated = await storage.updateRevenueOpportunity(req.params.id as string, orgId, req.body);
      if (!updated) return res.status(404).json({ message: "Opportunity not found" });
      res.json(updated);
    } catch (err) { res.status(400).json({ message: (err as Error).message }); }
  });

  app.get("/api/revenue/alerts", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, role } = req.auth!;
      const isGlobal = isMaster(role);
      const claims = isGlobal ? await storage.getAllClaimsAcrossTenants() : await storage.getClaims(orgId);
      const alerts: Array<{
        alertType: string;
        claimId: string;
        claimNumber?: string;
        estimatedImpact: number;
        confidence: number;
        recommendedAction: string;
        urgency: "low" | "medium" | "high";
      }> = [];
      for (const c of claims) {
        const rcv = c.rcvAmount ?? 0;
        const paid = c.finalPaidAmount ?? 0;
        const deductible = c.deductible ?? 0;
        const supplement = c.supplementAmountTotal ?? 0;
        const recoverableDep = c.recoverableDepreciation ?? 0;
        const outstanding = Math.max(0, rcv - paid - deductible);
        if (outstanding > 1000 && c.status !== "closed") {
          alerts.push({
            alertType: "underpayment",
            claimId: c.id,
            claimNumber: c.claimNumber || undefined,
            estimatedImpact: outstanding,
            confidence: 0.75,
            recommendedAction: "Review claim for underpayment — difference between RCV and paid amount exceeds $1,000",
            urgency: outstanding > 5000 ? "high" : "medium",
          });
        }
        if (recoverableDep > 0 && c.status !== "closed") {
          alerts.push({
            alertType: "recoverable_depreciation",
            claimId: c.id,
            claimNumber: c.claimNumber || undefined,
            estimatedImpact: recoverableDep,
            confidence: 0.82,
            recommendedAction: "Recoverable depreciation available — submit depreciation release request",
            urgency: "medium",
          });
        }
        if (supplement > 0 && c.status !== "closed" && c.supplementOutcome !== "approved") {
          alerts.push({
            alertType: "supplement_pending",
            claimId: c.id,
            claimNumber: c.claimNumber || undefined,
            estimatedImpact: supplement,
            confidence: 0.68,
            recommendedAction: "Supplement submitted but not yet approved — follow up with carrier",
            urgency: "medium",
          });
        }
      }
      res.json({ alerts: alerts.sort((a, b) => b.estimatedImpact - a.estimatedImpact) });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/revenue/summary", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, role } = req.auth!;
      const isGlobal = isMaster(role);
      const claims = isGlobal ? await storage.getAllClaimsAcrossTenants() : await storage.getClaims(orgId);
      let totalPotential = 0;
      let totalConfirmed = 0;
      let underpaidCount = 0;
      let depCount = 0;
      let supplementCount = 0;
      for (const c of claims) {
        const rcv = c.rcvAmount ?? 0;
        const paid = c.finalPaidAmount ?? 0;
        const deductible = c.deductible ?? 0;
        const supplement = c.supplementAmountTotal ?? 0;
        const recoverableDep = c.recoverableDepreciation ?? 0;
        const outstanding = Math.max(0, rcv - paid - deductible);
        if (outstanding > 1000) { totalPotential += outstanding; underpaidCount++; }
        if (recoverableDep > 0) { totalPotential += recoverableDep; depCount++; }
        if (supplement > 0 && c.supplementOutcome === "approved") { totalConfirmed += supplement; }
        if (supplement > 0 && c.supplementOutcome !== "approved") { totalPotential += supplement; supplementCount++; }
      }
      res.json({ totalPotential, totalConfirmed, underpaidCount, depCount, supplementCount, claimCount: claims.length });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.post("/api/billing/checkout", requireAuth, blockDuringImpersonation, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      const validPlans = ["founder", "individual", "pro", "team", "enterprise"];
      const rawPlan = validPlans.includes(req.body?.planType) ? req.body.planType : "individual";
      const planType = rawPlan === "pro" ? "individual" : rawPlan;
      const extraSeats = planType === "team" && typeof req.body?.extraSeats === "number" ? Math.max(0, req.body.extraSeats) : 0;

      if (planType === "founder") {
        const founderCount = await storage.getFounderSubscriptionCount();
        if (founderCount >= 3) {
          return res.status(400).json({ message: "Founder tier unavailable - all 3 spots are taken" });
        }
      }

      const result = await createCheckoutSession(orgId, userId, user.email, planType, extraSeats);
      if ("error" in result) {
        if (result.error.includes("not configured")) {
          return res.json({ message: result.error, fallback: true });
        }
        return res.status(400).json({ message: result.error });
      }

      res.json({ url: result.url });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/billing/webhook", async (req, res) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      if (!signature) {
        return res.status(400).json({ message: "Missing stripe-signature header" });
      }
      const result = await handleWebhookEvent(req.body, signature);
      if (!result.received) {
        return res.status(400).json({ message: result.error });
      }
      res.json({ received: true });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/billing/status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const billing = await storage.getBillingAccountByOrg(req.auth!.organizationId);
      res.json(billing || null);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/legal/founder", requireAuth, async (req: AuthRequest, res) => {
    try {
      const agreement = await storage.getFounderAgreement(req.auth!.organizationId);
      res.json(agreement || null);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/legal/founder/sign", requireAuth, blockDuringImpersonation, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;

      const existing = await storage.getFounderAgreement(orgId);
      if (existing) {
        return res.status(400).json({ message: "Agreement already signed" });
      }

      const version = req.body.version || "1.0";
      const ip = getClientIp(req);
      const hash = createHash("sha256").update(`${orgId}-${userId}-${version}-${Date.now()}`).digest("hex");

      const agreement = await storage.createFounderAgreement(orgId, userId, ip, version, hash);

      await storage.createAuditLog({
        organizationId: orgId,
        actorUserId: userId,
        actorRole: req.auth!.role,
        actionType: "FOUNDER_AGREEMENT_SIGNED",
        entityType: "founder_agreement",
        entityId: agreement.id,
        afterJson: agreement,
        ipAddress: ip,
      });

      res.json(agreement);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // --- Platform Owner / Admin routes ---
  app.get("/api/admin/overview", requireAuth, requirePlatformOwner, async (_req: AuthRequest, res) => {
    try {
      const [allUsers, allOrgs, allBilling, totalClaims] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllOrganizations(),
        storage.getAllBillingAccounts(),
        storage.getTotalClaimCount(),
      ]);
      res.json({
        totalUsers: allUsers.length,
        totalOrgs: allOrgs.length,
        totalBillingAccounts: allBilling.length,
        totalClaims,
        trialingCount: allBilling.filter(b => b.subscriptionStatus === "trialing").length,
        activeCount: allBilling.filter(b => b.subscriptionStatus === "active").length,
        canceledCount: allBilling.filter(b => b.subscriptionStatus === "canceled").length,
      });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // —— Founding Partner Request (public) ——
  app.post("/api/founding-partner/request", async (req, res) => {
    try {
      const data = foundingPartnerRequestSchema.parse(req.body);
      const request = await storage.createFoundingPartnerRequest(data);
      await sendAdminNotificationEmail({
        subject: "New Founding Partner Application",
        body: `Founding Partner Application Received\n\nName: ${data.fullName}\nEmail: ${data.email}\nCompany: ${data.companyName}\nPhone: ${data.phone || "N/A"}\nEstimated Monthly Claims: ${data.estimatedMonthlyClaimVolume || "N/A"}\nReason: ${data.reasonForJoining || "N/A"}`,
      });
      res.json({ success: true, id: (request as Record<string, unknown>).id });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.get("/api/admin/founding-partner-requests", requireAuth, requirePlatformOwner, async (_req: AuthRequest, res) => {
    try {
      const requests = await storage.getFoundingPartnerRequests();
      res.json(requests);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // —— Enterprise Contact Lead (public) ——
  app.post("/api/enterprise/contact-sales", async (req, res) => {
    try {
      const data = enterpriseContactSchema.parse(req.body);
      const lead = await storage.createEnterpriseContactLead(data);
      await sendAdminNotificationEmail({
        subject: "New Enterprise Contact Lead",
        body: `Enterprise Contact Lead Received\n\nName: ${data.fullName}\nEmail: ${data.email}\nCompany: ${data.companyName}\nPhone: ${data.phone || "N/A"}\nOrganization Type: ${data.organizationType || "N/A"}\nEstimated Users: ${data.estimatedUsers || "N/A"}\nEstimated Monthly Claims: ${data.estimatedMonthlyClaimVolume || "N/A"}\nIntegration Needs: ${data.integrationNeeds || "N/A"}\nMessage: ${data.message || "N/A"}`,
      });
      res.json({ success: true, id: (lead as Record<string, unknown>).id });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.get("/api/admin/enterprise-leads", requireAuth, requirePlatformOwner, async (_req: AuthRequest, res) => {
    try {
      const leads = await storage.getEnterpriseContactLeads();
      res.json(leads);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Identity Resolution
  app.get("/api/identity/review-queue", requireAuth, requirePlatformOwner, async (_req: AuthRequest, res) => {
    try {
      const queue = await storage.getIdentityReviewQueue();
      const matches = await storage.getIdentityMatches("pending_review");
      const profiles = await storage.getIdentityProfiles();
      const enriched = await Promise.all(
        queue.map(async (q) => {
          const match = matches.find((m) => (m as Record<string, unknown>).id === (q as Record<string, unknown>).matchId);
          const source = match ? profiles.find((p) => (p as Record<string, unknown>).id === (match as Record<string, unknown>).sourceIdentityId) : null;
          const target = match ? profiles.find((p) => (p as Record<string, unknown>).id === (match as Record<string, unknown>).targetIdentityId) : null;
          return { ...q, match, source, target };
        })
      );
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/identity/matches/:id/approve", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const matchId = req.params.id as string;
      const match = await storage.getIdentityMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      await storage.updateIdentityMatch(matchId, {
        status: "approved",
        reviewedBy: req.auth!.userId,
        reviewedAt: new Date(),
      });
      await storage.updateIdentityReviewQueue((match as Record<string, unknown>).id as string, { status: "approved" });
      await storage.createAuditLog({
        organizationId: req.auth!.organizationId,
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        actionType: "IDENTITY_MERGE_APPROVED",
        entityType: "identity_match",
        entityId: matchId,
        beforeJson: match,
        afterJson: { status: "approved", reviewedBy: req.auth!.userId },
        ipAddress: getClientIp(req),
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/identity/matches/:id/reject", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const matchId = req.params.id as string;
      const match = await storage.getIdentityMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      await storage.updateIdentityMatch(matchId, {
        status: "rejected",
        reviewedBy: req.auth!.userId,
        reviewedAt: new Date(),
      });
      await storage.updateIdentityReviewQueue((match as Record<string, unknown>).id as string, { status: "rejected" });
      await storage.createAuditLog({
        organizationId: req.auth!.organizationId,
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        actionType: "IDENTITY_MERGE_REJECTED",
        entityType: "identity_match",
        entityId: matchId,
        beforeJson: match,
        afterJson: { status: "rejected", reviewedBy: req.auth!.userId },
        ipAddress: getClientIp(req),
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/admin/users", requireAuth, requirePlatformOwner, async (_req: AuthRequest, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allOrgs = await storage.getAllOrganizations();
      const allBilling = await storage.getAllBillingAccounts();

      const enriched = allUsers.map((u) => {
        const org = allOrgs.find((o) => o.id === u.organizationId);
        const billing = allBilling.find((b) => b.organizationId === u.organizationId);
        return {
          ...sanitizeUser(u),
          orgName: org?.name || null,
          subscriptionStatus: billing?.subscriptionStatus || null,
          trialEndDate: billing?.trialEndDate || null,
          trialStartDate: billing?.trialStartDate || null,
          planType: billing?.planType || null,
          stripeCustomerId: billing?.stripeCustomerId || null,
        };
      });

      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/admin/audit-logs", requireAuth, requirePlatformOwner, async (_req: AuthRequest, res) => {
    try {
      const logs = await storage.getAuditLogs();
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/admin/login-activity", requireAuth, requirePlatformOwner, async (_req: AuthRequest, res) => {
    try {
      const logs = await storage.getLoginAttempts();
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Entity Classification & Privacy Guard Routes ──

  app.post("/api/admin/entity-cleanup/scan", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const { runEntityCleanupScan } = await import("./entity-privacy");
      const result = await runEntityCleanupScan();
      await storage.createAuditLog({
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        actionType: "ENTITY_CLEANUP_SCAN",
        entityType: "entity_cleanup",
        entityId: "scan",
        afterJson: { totalFlags: result.totalFlags },
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/admin/entity-cleanup/flags", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const status = req.query.status as string | undefined;
      const severity = req.query.severity as string | undefined;
      const flags = await storage.getEntityCleanupFlags(status, severity);
      res.json(flags);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/admin/entity-cleanup/flags/:id/review", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const { status, reviewAction, reviewNotes } = req.body;
      const updated = await storage.updateEntityCleanupFlag(req.params.id as string, {
        status,
        reviewAction,
        reviewNotes,
        reviewedBy: req.auth!.userId,
      });
      if (!updated) return res.status(404).json({ message: "Flag not found" });
      await storage.createAuditLog({
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        actionType: "ENTITY_CLEANUP_REVIEW",
        entityType: "entity_cleanup_flag",
        entityId: req.params.id as string,
        afterJson: { status, reviewAction, reviewNotes },
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/admin/privacy-guard/logs", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 500;
      const logs = await storage.getPrivacyGuardLogs(limit);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/admin/entity-classifications", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const { name, entityType, classificationReason, sourceDocumentId, claimId, confidenceScore } = req.body;
      const { classifyEntity } = await import("./entity-privacy");
      const result = await classifyEntity(name, entityType, {
        classificationReason,
        sourceDocumentId,
        claimId,
        classifiedBy: req.auth!.userId,
        confidenceScore,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/admin/entity-classifications", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const claimId = req.query.claimId as string | undefined;
      const orgId = req.query.orgId as string | undefined;
      const records = await storage.getEntityClassifications(orgId, claimId);
      res.json(records);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/admin/impersonate/:userId", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const targetUser = await storage.getUser(req.params.userId as string);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      const { accessToken, refreshToken } = await createAuthSession(
        targetUser.id,
        targetUser.organizationId,
        {
          ipAddress: getClientIp(req),
          userAgent: req.headers["user-agent"],
          isImpersonation: true,
          impersonatorUserId: req.auth!.userId,
        }
      );

      await storage.createAuditLog({
        organizationId: targetUser.organizationId,
        actorUserId: req.auth!.userId,
        actorRole: "master_admin",
        isImpersonation: true,
        impersonatorUserId: req.auth!.userId,
        targetUserId: targetUser.id,
        actionType: "IMPERSONATION_START",
        entityType: "user",
        entityId: targetUser.id,
        ipAddress: getClientIp(req),
      });

      setRefreshTokenCookie(res, refreshToken);
      res.json({ accessToken, user: sanitizeUser(targetUser), orgId: targetUser.organizationId });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/admin/stop-impersonation", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.auth!.isImpersonation || !req.auth!.impersonatorUserId) {
        return res.status(400).json({ message: "Not currently impersonating" });
      }

      if (req.auth!.sessionId) {
        await storage.revokeSession(req.auth!.sessionId);
      }

      const owner = await storage.getUser(req.auth!.impersonatorUserId);
      if (!owner) return res.status(500).json({ message: "Owner not found" });

      await storage.createAuditLog({
        organizationId: req.auth!.organizationId,
        actorUserId: req.auth!.impersonatorUserId,
        actorRole: "master_admin",
        isImpersonation: true,
        impersonatorUserId: req.auth!.impersonatorUserId,
        targetUserId: req.auth!.userId,
        actionType: "IMPERSONATION_END",
        entityType: "user",
        entityId: req.auth!.userId,
        ipAddress: getClientIp(req),
      });

      const { accessToken, refreshToken } = await createAuthSession(
        owner.id, owner.organizationId,
        { ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] }
      );

      setRefreshTokenCookie(res, refreshToken);
      res.json({ accessToken, user: sanitizeUser(owner), orgId: owner.organizationId });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Storm Events (Roadmap MVP module) ──────────────────────────────────────
  app.get("/api/storm-events", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const events = await storage.getStormEvents(req.auth!.organizationId);
      res.json(events);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/storm-events/claim/:claimId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const events = await storage.getStormEventsByClaim(req.params.claimId as string, req.auth!.organizationId);
      res.json(events);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/storm-events/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const event = await storage.getStormEvent(req.params.id as string, req.auth!.organizationId);
      if (!event) return res.status(404).json({ message: "Storm event not found" });
      res.json(event);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/storm-events", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const parsed = insertStormEventSchema.safeParse({
        ...req.body,
        organizationId: req.auth!.organizationId,
        createdByUserId: req.auth!.userId,
      });
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
      const event = await storage.createStormEvent(parsed.data);
      res.status(201).json(event);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.patch("/api/storm-events/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateStormEvent(req.params.id as string, req.auth!.organizationId, req.body);
      if (!updated) return res.status(404).json({ message: "Storm event not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.delete("/api/storm-events/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const existing = await storage.getStormEvent(req.params.id as string, req.auth!.organizationId);
      if (!existing) return res.status(404).json({ message: "Storm event not found" });
      await storage.deleteStormEvent(req.params.id as string, req.auth!.organizationId);
      await storage.createAuditLog({
        organizationId: req.auth!.organizationId,
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        actionType: "STORM_EVENT_DELETED",
        entityType: "storm_event",
        entityId: req.params.id as string,
        beforeJson: existing,
        ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Governance routes ────────────────────────────────────────────────────

  function requireCanArchive(req: AuthRequest, res: Response, next: NextFunction) {
    if (!req.auth) return res.status(401).json({ message: "Not authenticated" });
    const noDestructive = ['executive_admin'];
    if (noDestructive.includes(req.auth.role)) {
      return res.status(403).json({ message: "Your role cannot perform destructive actions" });
    }
    next();
  }

  // GET governance overview (Master only)
  app.get("/api/admin/governance", requireAuth, requirePlatformOwner, async (_req: AuthRequest, res) => {
    try {
      const overview = await storage.getGovernanceOverview();
      res.json(overview);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // GET duplicate report (Master only — safe, read-only)
  app.get("/api/admin/duplicates", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const { role, organizationId } = req.auth!;
      const orgFilter = req.query.orgId as string | undefined;
      const groups = await findDuplicateClaims(role, orgFilter || organizationId);
      res.json({ groups, totalGroups: groups.length });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // GET archived records (Master only)
  app.get("/api/admin/archived/:entity", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const { entity } = req.params;
      let records: unknown[] = [];
      switch (entity) {
        case "claims": records = await storage.getArchivedClaims(); break;
        case "adjusters": records = await storage.getArchivedAdjusters(); break;
        case "clients": records = await storage.getArchivedClients(); break;
        case "evidence": records = await storage.getArchivedEvidenceFiles(); break;
        case "audio": records = await storage.getArchivedAudioRecordings(); break;
        case "emails": records = await storage.getArchivedEmails(); break;
        default: return res.status(400).json({ message: "Unknown entity type" });
      }
      res.json(records);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Adjuster Deduplication (Master only) ───────────────────────────────────
  // Merges duplicate adjuster profiles within each org using normalized name
  // matching. Idempotent — safe to run multiple times. Returns a structured
  // result with counts and a full operation log.
  app.post("/api/admin/dedupe-adjusters", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const { runAdjusterDedup } = await import("./dedupe-adjusters-util");
      const orgId = req.query.orgId as string | undefined;
      const result = await runAdjusterDedup(orgId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Adjuster Deduplication Status ─────────────────────────────────────────
  // Returns counts needed for a "Duplicate Review" panel. Read-only, so it is
  // available to any authenticated user for their own org.
  app.get("/api/admin/dedupe-adjusters/status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { getDedupStatus } = await import("./dedupe-adjusters-util");
      const orgId = req.auth?.organizationId ?? "";
      const status = await getDedupStatus(orgId);
      res.json(status);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ── Clear Demo Data (Master only) ──────────────────────────────────────────
  // Hard-deletes all records belonging to demo/test organizations
  // (any org whose users have @claimsignal.test emails or test@example.com),
  // excluding the master's own organization. Irreversible — requires explicit
  // confirmation from the caller. Gated behind requirePlatformOwner.
  app.post("/api/admin/clear-demo-data", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const masterOrgId = req.auth!.organizationId;

      // 1. Identify demo organizations by email domain AND org-name "(DEMO)" suffix
      const allUsers = await storage.getAllUsers();
      const allOrgs = await storage.getAllOrganizations();

      // Orgs whose users have test email addresses
      const emailDemoOrgIds = new Set(
        allUsers
          .filter(
            (u) =>
              (u.email.endsWith("@claimsignal.test") || u.email === "test@example.com") &&
              u.organizationId !== masterOrgId,
          )
          .map((u) => u.organizationId),
      );

      // Orgs explicitly marked with a "(DEMO)" suffix in their name
      const nameDemoOrgIds = new Set(
        allOrgs
          .filter((o) => o.id !== masterOrgId && o.name.includes("(DEMO)"))
          .map((o) => o.id),
      );

      const demoOrgIds = Array.from(
        new Set([...Array.from(emailDemoOrgIds), ...Array.from(nameDemoOrgIds)]),
      );

      if (demoOrgIds.length === 0) {
        return res.json({ deleted: 0, message: "No demo organizations found." });
      }

      let claimsDeleted = 0;
      let adjustersDeleted = 0;
      let orgsDeleted = 0;

      for (const orgId of demoOrgIds) {
        // 2a. Delete all claim-child records then claims
        const orgClaims = await db.select({ id: claimsTable.id }).from(claimsTable).where(eq(claimsTable.organizationId, orgId));
        for (const { id: claimId } of orgClaims) {
          await db.delete(aiInsights).where(eq(aiInsights.claimId, claimId));
          await db.delete(timelineEvents).where(eq(timelineEvents.claimId, claimId));
          await db.delete(supplements).where(eq(supplements.claimId, claimId));
          await db.delete(evidenceFiles).where(eq(evidenceFiles.claimId, claimId));
          await db.delete(claimAdjusters).where(eq(claimAdjusters.claimId, claimId));
          await db.delete(claimsTable).where(eq(claimsTable.id, claimId));
        }
        claimsDeleted += orgClaims.length;

        // 2b. Delete adjusters scoped to this demo org
        const deleted = await db.delete(adjustersTable).where(eq(adjustersTable.organizationId, orgId)).returning({ id: adjustersTable.id });
        adjustersDeleted += deleted.length;

        // 2c. Delete audit logs, billing, founder agreements, sessions, users, org
        await db.delete(auditLogsTable).where(eq(auditLogsTable.organizationId, orgId));
        await db.delete(founderAgreements).where(eq(founderAgreements.organizationId, orgId));
        await db.delete(billingAccounts).where(eq(billingAccounts.organizationId, orgId));

        const orgUserIds = allUsers.filter((u) => u.organizationId === orgId).map((u) => u.id);
        if (orgUserIds.length > 0) {
          await db.delete(userSessions).where(inArray(userSessions.userId, orgUserIds));
          await db.delete(users).where(inArray(users.id, orgUserIds));
        }

        await db.delete(organizations).where(eq(organizations.id, orgId));
        orgsDeleted++;
      }

      // Audit the clear-demo-data action on the master's own org
      await storage.createAuditLog({
        organizationId: masterOrgId,
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        actionType: "DEMO_DATA_CLEARED",
        entityType: "platform",
        afterJson: { demoOrgsDeleted: orgsDeleted, claimsDeleted, adjustersDeleted },
        ipAddress: getClientIp(req),
      });

      res.json({
        deleted: orgsDeleted,
        claimsDeleted,
        adjustersDeleted,
        message: `Cleared ${orgsDeleted} demo org${orgsDeleted === 1 ? "" : "s"}, ${claimsDeleted} claim${claimsDeleted === 1 ? "" : "s"}, ${adjustersDeleted} adjuster${adjustersDeleted === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Claims governance
  app.patch("/api/claims/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const scopedOrgId = isSuperAdmin ? undefined : orgId;
      const ok = await storage.archiveClaim(req.params.id as string, scopedOrgId);
      if (!ok) return res.status(404).json({ message: "Claim not found or already archived" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "CLAIM_ARCHIVED", entityType: "claim", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ archived: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.patch("/api/claims/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const scopedOrgId = isSuperAdmin ? undefined : orgId;
      const ok = await storage.restoreClaim(req.params.id as string, scopedOrgId);
      if (!ok) return res.status(404).json({ message: "Claim not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "CLAIM_RESTORED", entityType: "claim", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.delete("/api/claims/:id/permanent", requireAuth, requireMasterDelete, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteClaim(req.params.id as string, undefined);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "CLAIM_PERMANENTLY_DELETED", entityType: "claim", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // Adjusters governance
  app.patch("/api/adjusters/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const scopedOrgId = isSuperAdmin ? undefined : orgId;
      const ok = await storage.archiveAdjuster(req.params.id as string, scopedOrgId);
      if (!ok) return res.status(404).json({ message: "Adjuster not found or already archived" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "ADJUSTER_ARCHIVED", entityType: "adjuster", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ archived: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.patch("/api/adjusters/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const scopedOrgId = isSuperAdmin ? undefined : orgId;
      const ok = await storage.restoreAdjuster(req.params.id as string, scopedOrgId);
      if (!ok) return res.status(404).json({ message: "Adjuster not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "ADJUSTER_RESTORED", entityType: "adjuster", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.delete("/api/adjusters/:id/permanent", requireAuth, requireMasterDelete, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteAdjuster(req.params.id as string, undefined);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "ADJUSTER_PERMANENTLY_DELETED", entityType: "adjuster", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // Clients governance
  app.patch("/api/clients/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const scopedOrgId = isSuperAdmin ? undefined : orgId;
      const ok = await storage.archiveClient(req.params.id as string, scopedOrgId);
      if (!ok) return res.status(404).json({ message: "Client not found or already archived" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "CLIENT_ARCHIVED", entityType: "client", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ archived: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.patch("/api/clients/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const scopedOrgId = isSuperAdmin ? undefined : orgId;
      const ok = await storage.restoreClient(req.params.id as string, scopedOrgId);
      if (!ok) return res.status(404).json({ message: "Client not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "CLIENT_RESTORED", entityType: "client", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.delete("/api/clients/:id/permanent", requireAuth, requireMasterDelete, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteClient(req.params.id as string, undefined);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "CLIENT_PERMANENTLY_DELETED", entityType: "client", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // Evidence governance
  app.patch("/api/evidence/files/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const ok = await storage.archiveEvidenceFile(req.params.id as string, isSuperAdmin ? undefined : orgId);
      if (!ok) return res.status(404).json({ message: "File not found or already archived" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "EVIDENCE_ARCHIVED", entityType: "evidence_file", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ archived: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.patch("/api/evidence/files/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const ok = await storage.restoreEvidenceFile(req.params.id as string, isSuperAdmin ? undefined : orgId);
      if (!ok) return res.status(404).json({ message: "File not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "EVIDENCE_RESTORED", entityType: "evidence_file", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.delete("/api/evidence/files/:id/permanent", requireAuth, requireMasterDelete, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteEvidenceFile(req.params.id as string, undefined);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "EVIDENCE_PERMANENTLY_DELETED", entityType: "evidence_file", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // Audio governance
  app.patch("/api/audio/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const ok = await storage.archiveAudioRecording(req.params.id as string, isSuperAdmin ? undefined : orgId);
      if (!ok) return res.status(404).json({ message: "Recording not found or already archived" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "AUDIO_ARCHIVED", entityType: "audio_recording", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ archived: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.patch("/api/audio/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const ok = await storage.restoreAudioRecording(req.params.id as string, isSuperAdmin ? undefined : orgId);
      if (!ok) return res.status(404).json({ message: "Recording not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "AUDIO_RESTORED", entityType: "audio_recording", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.delete("/api/audio/:id/permanent", requireAuth, requireMasterDelete, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteAudioRecording(req.params.id as string, undefined);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "AUDIO_PERMANENTLY_DELETED", entityType: "audio_recording", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // Communications governance
  app.patch("/api/communications/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "master_admin";
      const orgId = req.auth!.organizationId;
      const ok = await storage.archiveEmail(req.params.id as string, isSuperAdmin ? undefined : orgId);
      if (!ok) return res.status(404).json({ message: "Communication not found or already archived" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "COMMUNICATION_ARCHIVED", entityType: "email", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ archived: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.patch("/api/communications/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const ok = await storage.restoreEmail(req.params.id as string, orgId);
      if (!ok) return res.status(404).json({ message: "Communication not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "COMMUNICATION_RESTORED", entityType: "email", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.delete("/api/communications/:id/permanent", requireAuth, requireMasterDelete, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteEmail(req.params.id as string, orgId);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "COMMUNICATION_PERMANENTLY_DELETED", entityType: "email", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  function groupByMonth(items: Record<string, unknown>[], field: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const item of items) {
      const d = item[field] ? new Date(item[field] as string | number | Date) : null;
      if (!d) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  }
  function countLastNDays(items: Record<string, unknown>[], field: string, n: number): number {
    const cutoff = Date.now() - n * 24 * 60 * 60 * 1000;
    return items.filter(i => i[field] && new Date(i[field] as string | number | Date).getTime() >= cutoff).length;
  }

  // ─── Section 18: Document Intelligence ────────────────────────────────────
  app.post("/api/claims/:id/evidence/:docId/analyze", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const { id: claimId, docId } = req.params as Record<string, string>;
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const ef = await storage.getEvidenceFile(docId, orgId);
      if (!ef) return res.status(404).json({ message: "Evidence file not found" });
      const efWithText = ef as typeof ef & { extractedText?: string };
      const textToAnalyze = efWithText.extractedText || sampleClaimDocumentText(ef.fileName || "");
      const suggestions = analyzeDocumentText(textToAnalyze, ef.fileName || "");
      const suggestionsRec = suggestions as unknown as Record<string, unknown>;
      await storage.updateEvidenceFileIntelligence(docId, orgId, { suggestions, analyzedAt: new Date().toISOString() }, "pending");
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "DOCUMENT_ANALYZED", entityType: "evidence_file", entityId: docId, ipAddress: getClientIp(req), afterJson: { claimId, filename: ef.fileName } });
      if ((suggestionsRec.denialDetection as Record<string, unknown> | undefined)?.isDenied) {
        await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "DENIAL_DETECTED", entityType: "evidence_file", entityId: docId, ipAddress: getClientIp(req), afterJson: { denialType: (suggestionsRec.denialDetection as Record<string, unknown>)?.denialType } });
      }
      if (((suggestionsRec.missingLineItems as unknown[] | undefined)?.length ?? 0) > 0) {
        await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "MISSING_ITEMS_DETECTED", entityType: "evidence_file", entityId: docId, ipAddress: getClientIp(req), afterJson: { count: (suggestionsRec.missingLineItems as unknown[])?.length } });
      }
      res.json({ suggestions });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.post("/api/claims/:id/evidence/:docId/suggestions/accept", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const { id: claimId, docId } = req.params as Record<string, string>;
      const { acceptedFields } = req.body as { acceptedFields: Partial<InsertClaim> };
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      if (acceptedFields && Object.keys(acceptedFields).length > 0) {
        await storage.updateClaim(claimId, orgId, acceptedFields);
      }
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "DATA_EXTRACTED_ACCEPTED", entityType: "evidence_file", entityId: docId, ipAddress: getClientIp(req), afterJson: { claimId, fields: Object.keys(acceptedFields || {}) } });
      res.json({ updated: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // ─── Section 18b: Documentation Checklist ───────────────────────────────
  app.patch("/api/claims/:id/checklist", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId } = req.auth!;
      const { id: claimId } = req.params as Record<string, string>;
      const { checklist } = req.body as { checklist: Record<string, boolean> };
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const existing = (claim.documentationChecklist as Record<string, boolean> | null) || {};
      const merged = { ...existing, ...checklist };
      await storage.updateClaim(claimId, orgId, { documentationChecklist: merged });
      res.json({ updated: true, checklist: merged });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // ─── Section 19: Escalation CRUD + Intelligence ───────────────────────────
  app.get("/api/claims/:id/escalations", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId } = req.auth!;
      const claimId = String(req.params.id);
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      res.json(await storage.getEscalations(claimId, orgId));
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.post("/api/claims/:id/escalations", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const claimId = String(req.params.id);
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const parsed = insertEscalationSchema.safeParse({ ...req.body, claimId, organizationId: orgId, initiatedByUserId: userId });
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const esc = await storage.createEscalation(parsed.data);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "ESCALATION_CREATED", entityType: "escalation", entityId: esc.id, ipAddress: getClientIp(req), afterJson: { claimId, type: esc.escalationType } });
      res.status(201).json(esc);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.patch("/api/escalations/:escId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const escId = String(req.params.escId);
      const updated = await storage.updateEscalation(escId, orgId, req.body);
      if (!updated) return res.status(404).json({ message: "Escalation not found" });
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "ESCALATION_UPDATED", entityType: "escalation", entityId: escId, ipAddress: getClientIp(req) });
      res.json(updated);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.delete("/api/escalations/:escId", requireAuth, requireMasterDelete, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const escId = String(req.params.escId);
      await storage.deleteEscalation(escId, orgId);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "ESCALATION_DELETED", entityType: "escalation", entityId: escId, ipAddress: getClientIp(req) });
      res.json({ deleted: true });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/escalations/effectiveness", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const { carrierId, type } = req.query as Record<string, string>;
      let escs = await storage.getAllOrgEscalations(orgId);
      if (type) escs = escs.filter(e => e.escalationType === type);
      const effectiveness = computeEscalationEffectiveness(escs, carrierId, type);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "ESCALATION_EFFECTIVENESS_VIEWED", entityType: "escalation", entityId: "effectiveness", ipAddress: getClientIp(req) });
      res.json(effectiveness);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/claims/:id/escalation-path", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const claimId = String(req.params.id);
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const [escs, allClaims] = await Promise.all([storage.getAllOrgEscalations(orgId), storage.getClaims(orgId)]);
      const recommendation = buildRecommendedEscalationPath(claim, escs, allClaims);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "ESCALATION_PATH_VIEWED", entityType: "claim", entityId: claimId, ipAddress: getClientIp(req) });
      res.json(recommendation);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // ─── Section 20: Claim Timeline & Audit Intelligence ──────────────────────
  app.get("/api/claims/:id/timeline", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const claimId = String(req.params.id);
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      let events = await storage.getTimelineEvents(claimId, orgId);
      const { eventType, dateFrom, dateTo, keyword } = req.query as Record<string, string>;
      if (eventType) events = events.filter(e => e.eventType === eventType);
      if (dateFrom) events = events.filter(e => new Date(e.eventDate ?? 0) >= new Date(dateFrom));
      if (dateTo) events = events.filter(e => new Date(e.eventDate ?? 0) <= new Date(dateTo));
      if (keyword) {
        const kw = keyword.toLowerCase();
        events = events.filter(e => e.title.toLowerCase().includes(kw) || (e.description || "").toLowerCase().includes(kw));
      }
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "TIMELINE_VIEWED", entityType: "claim", entityId: claimId, ipAddress: getClientIp(req) });
      res.json(events);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.post("/api/claims/:id/timeline", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const claimId = String(req.params.id);
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const parsed = insertTimelineEventSchema.safeParse({ ...req.body, claimId, organizationId: orgId, createdByUserId: userId });
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const event = await storage.createTimelineEvent(parsed.data);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "TIMELINE_EVENT_CREATED", entityType: "timeline_event", entityId: event.id, ipAddress: getClientIp(req), afterJson: { claimId: String(req.params.id) } });
      res.status(201).json(event);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/claims/:id/activity-summary", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId } = req.auth!;
      const claimId = String(req.params.id);
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const [events, escs, docs, adjusters] = await Promise.all([
        storage.getTimelineEvents(claimId, orgId),
        storage.getEscalations(claimId, orgId),
        storage.getEvidenceFiles(orgId, claimId),
        storage.getClaimAdjusters(claimId, orgId).catch(() => []),
      ]);
      res.json({
        totalDocuments: docs.length,
        totalTimelineEvents: events.length,
        totalEscalations: escs.length,
        totalPayments: events.filter(e => e.eventType === "payment_received").length,
        totalAdjusters: adjusters.length,
        totalStatusChanges: events.filter(e => e.eventType === "status_change").length,
      });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/claims/:id/dispute-export", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, role } = req.auth!;
      const claimId = String(req.params.id);
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const [events, escs, docs] = await Promise.all([
        storage.getTimelineEvents(claimId, orgId),
        storage.getEscalations(claimId, orgId),
        storage.getEvidenceFiles(orgId, claimId),
      ]);
      const safeClaim = canViewUnmasked(role) ? claim : applyPiiMasking(claim, role);
      res.json({
        exportType: "dispute_support",
        generatedAt: new Date().toISOString(),
        claim: safeClaim,
        timeline: events,
        escalations: escs,
        documents: docs.map(d => ({ id: d.id, filename: d.fileName, category: d.docCategory, uploadedAt: d.uploadedAt })),
      });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // ─── Section 21: Claim Intelligence Dashboard ─────────────────────────────
  app.get("/api/claims/:id/intelligence-dashboard", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const claimId = String(req.params.id);
      const claim = await storage.getClaim(claimId, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const [adjLinks, docs, escs, allOrgClaims] = await Promise.all([
        storage.getClaimAdjusters(claimId, orgId).catch(() => []),
        storage.getEvidenceFiles(orgId, claimId),
        storage.getEscalations(claimId, orgId),
        storage.getClaims(orgId),
      ]);
      const healthScore = computeClaimHealthScore(claim, adjLinks.length, docs.length, escs.length);
      const riskSignals = computeRiskSignals(claim, adjLinks.length, docs.length);
      const alerts = computeAlerts(claim, adjLinks.length);
      const summary = buildExecutiveSummary(claim, riskSignals, healthScore, adjLinks.length, false);
      const carrierSignal = claim.carrier
        ? (computeCarrierIntelligence(allOrgClaims.filter(c => c.carrier === claim.carrier)).find(() => true) ?? null)
        : null;
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "CLAIM_INTELLIGENCE_DASHBOARD_VIEWED", entityType: "claim", entityId: claimId, ipAddress: getClientIp(req) });
      res.json({ healthScore, riskSignals, alerts, executiveSummary: summary, carrierSignal, documentCount: docs.length, escalationCount: escs.length });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // ─── Section 22: AI Copilot ────────────────────────────────────────────────
  app.post("/api/copilot/chat", requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const { claimId, question } = req.body as { claimId?: string; question: string };
      if (!question?.trim()) return res.status(400).json({ message: "Question is required" });
      let claim: import("@shared/schema").Claim | undefined = undefined;
      let docs: import("@shared/schema").EvidenceFile[] = [];
      if (claimId) {
        claim = await storage.getClaim(claimId, orgId);
        if (claim) {
          if (!canViewUnmasked(role)) claim = applyPiiMasking(claim, role);
          docs = await storage.getEvidenceFiles(orgId, claimId);
        }
      }
      const answer = await runCopilotQuery(question, claim ?? null, [], [], docs, role);
      const copilotEntityId = claimId ?? "general";
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "COPILOT_QUESTION_SUBMITTED", entityType: "copilot", entityId: copilotEntityId, ipAddress: getClientIp(req), afterJson: { question: question.substring(0, 100) } });
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "COPILOT_RESPONSE_GENERATED", entityType: "copilot", entityId: copilotEntityId, ipAddress: getClientIp(req) });
      res.json({ ...answer, disclosure: AI_DISCLOSURE });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // ─── Section 23: Master Intelligence Center ───────────────────────────────
  app.get("/api/master/intelligence", requireAuth, requirePlatformOwner, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const [allClaims, allOrgs, allUsers, allBilling, allEscs, allAdj] = await Promise.all([
        storage.getAllClaimsAcrossTenants(),
        storage.getAllOrganizations(),
        storage.getAllUsers(),
        storage.getAllBillingAccounts(),
        storage.getAllEscalationsAcrossTenants(),
        storage.getAllAdjustersAcrossTenants(),
      ]);
      const playbooks = await storage.getPlaybookEntries();
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "MASTER_INTELLIGENCE_VIEWED", entityType: "platform", entityId: "overview", ipAddress: getClientIp(req) });
      res.json({
        totalClaims: allClaims.length,
        totalOrganizations: allOrgs.length,
        totalUsers: allUsers.length,
        totalEscalations: allEscs.length,
        totalAdjusters: allAdj.length,
        totalPlaybooks: playbooks.length,
        activeSubscriptions: allBilling.filter(b => ["active", "trialing"].includes(b.subscriptionStatus || "")).length,
        claimsByStatus: Object.entries(allClaims.reduce((acc: Record<string, number>, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {})),
      });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/master/intelligence/carriers", requireAuth, requirePlatformOwner, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const allClaims = await storage.getAllClaimsAcrossTenants();
      const leaderboard = computeCarrierIntelligence(allClaims)
        .sort((a, b) => b.claimsCount - a.claimsCount).slice(0, 50);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "MASTER_INTELLIGENCE_VIEWED", entityType: "platform", entityId: "carriers", ipAddress: getClientIp(req) });
      res.json(leaderboard);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/master/intelligence/adjusters", requireAuth, requirePlatformOwner, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const [allClaims, allAdj] = await Promise.all([storage.getAllClaimsAcrossTenants(), storage.getAllAdjustersAcrossTenants()]);
      const leaderboard = allAdj.slice(0, 50).map((adj) => {
        const adjClaims = allClaims.filter(c => c.adjusterId === adj.id);
        return { adjusterId: adj.id, adjusterName: adj.adjusterName || "Unknown", totalClaims: adjClaims.length, ...computeAdjusterScorecard([], adjClaims) };
      });
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "MASTER_INTELLIGENCE_VIEWED", entityType: "platform", entityId: "adjusters", ipAddress: getClientIp(req) });
      res.json(leaderboard);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/master/intelligence/playbooks", requireAuth, requirePlatformOwner, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const all = await storage.getPlaybookEntries();
      const byOutcome = all.reduce((acc: Record<string, number>, p) => { const k = p.outcome ?? "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "MASTER_INTELLIGENCE_VIEWED", entityType: "platform", entityId: "playbooks", ipAddress: getClientIp(req) });
      res.json({ total: all.length, byOutcome: Object.entries(byOutcome) });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // ─── Section 24: Executive / Investor Reporting ───────────────────────────
  const requireExecAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
    const r = req.auth?.role;
    if (!r || !['master_admin', 'executive_admin', 'founder'].includes(r)) return res.status(403).json({ message: "Executive reporting access required" });
    next();
  };

  app.get("/api/executive/overview", requireAuth, requireActiveSubscription, requireExecAccess, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const isGlobal = isMaster(role);
      const allUsers = await storage.getAllUsers();
      const [claims, escs, adjs] = await Promise.all([
        isGlobal ? storage.getAllClaimsAcrossTenants() : storage.getClaims(orgId),
        isGlobal ? storage.getAllEscalationsAcrossTenants() : storage.getAllOrgEscalations(orgId),
        isGlobal ? storage.getAllAdjustersAcrossTenants() : storage.getAdjusters(orgId),
      ]);
      const users = isGlobal ? allUsers : allUsers.filter((u) => u.organizationId === orgId);
      const orgs = isGlobal ? await storage.getAllOrganizations() : [await storage.getOrganization(orgId)].filter(Boolean);
      const billing = isGlobal ? await storage.getAllBillingAccounts() : [await storage.getBillingAccountByOrg(orgId)].filter(Boolean);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "EXECUTIVE_DASHBOARD_VIEWED", entityType: "platform", entityId: "overview", ipAddress: getClientIp(req) });
      res.json({
        totalClaims: claims.length,
        activeClaims: claims.filter(c => !["closed", "resolved"].includes(c.status)).length,
        closedClaims: claims.filter(c => ["closed", "resolved"].includes(c.status)).length,
        totalUsers: users.length,
        totalOrganizations: orgs.length,
        totalAdjusters: adjs.length,
        totalEscalations: escs.length,
        activeSubscriptions: billing.filter(b => b && ["active", "trialing"].includes(b.subscriptionStatus || "")).length,
      });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/executive/growth", requireAuth, requireActiveSubscription, requireExecAccess, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const isGlobal = isMaster(role);
      const allUsers = await storage.getAllUsers();
      const users = isGlobal ? allUsers : allUsers.filter((u) => u.organizationId === orgId);
      const claims = isGlobal ? await storage.getAllClaimsAcrossTenants() : await storage.getClaims(orgId);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "EXECUTIVE_DASHBOARD_VIEWED", entityType: "platform", entityId: "growth", ipAddress: getClientIp(req) });
      res.json({
        monthlyUsers: groupByMonth(users, "createdAt"),
        monthlyClaims: groupByMonth(claims, "createdAt"),
        newUsersLast30: countLastNDays(users, "createdAt", 30),
        newClaimsLast30: countLastNDays(claims, "createdAt", 30),
        newUsersLast90: countLastNDays(users, "createdAt", 90),
        newClaimsLast90: countLastNDays(claims, "createdAt", 90),
      });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/executive/revenue", requireAuth, requirePlatformOwner, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const PLAN_PRICES: Record<string, number> = { founder: 79, individual: 99, pro: 99, team: 299, enterprise: 0 };
      const allBilling = await storage.getAllBillingAccounts();
      const active = allBilling.filter(b => ["active", "trialing"].includes(b.subscriptionStatus || ""));
      const mrr = active.reduce((sum, b) => {
        const planType = b.planType === "pro" ? "individual" : b.planType;
        return sum + (PLAN_PRICES[planType] || 0);
      }, 0);
      const byPlan = active.reduce((acc: Record<string, number>, b) => {
        const planType = b.planType === "pro" ? "individual" : b.planType;
        acc[planType] = (acc[planType] || 0) + 1;
        return acc;
      }, {});
      const canceled = allBilling.filter(b => b.subscriptionStatus === "canceled").length;
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "EXECUTIVE_DASHBOARD_VIEWED", entityType: "platform", entityId: "revenue", ipAddress: getClientIp(req) });
      res.json({
        mrr,
        arr: mrr * 12,
        totalSubscribers: active.length,
        subscribersByPlan: byPlan,
        canceledCount: canceled,
        churnRate: allBilling.length > 0 ? Number(((canceled / allBilling.length) * 100).toFixed(1)) : 0,
      });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/executive/usage", requireAuth, requireActiveSubscription, requireExecAccess, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const isGlobal = isMaster(role);
      const claims = isGlobal ? await storage.getAllClaimsAcrossTenants() : await storage.getClaims(orgId);
      const docs = await storage.getEvidenceFiles(orgId).catch(() => []);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "EXECUTIVE_DASHBOARD_VIEWED", entityType: "platform", entityId: "usage", ipAddress: getClientIp(req) });
      res.json({
        totalClaimsWithScoring: claims.filter(c => c.frictionScore != null).length,
        totalDocumentsProcessed: isGlobal ? null : docs.length,
        note: "Detailed per-event usage metrics require audit log aggregation.",
      });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/executive/investor-safe", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      if (!['master_admin', 'executive_admin', 'founder'].includes(role)) return res.status(403).json({ message: "Access denied" });
      const isGlobal = isMaster(role);
      const allUsers = await storage.getAllUsers();
      const users = isGlobal ? allUsers : allUsers.filter((u) => u.organizationId === orgId);
      const claims = isGlobal ? await storage.getAllClaimsAcrossTenants() : await storage.getClaims(orgId);
      const adjs = isGlobal ? await storage.getAllAdjustersAcrossTenants() : await storage.getAdjusters(orgId);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "INVESTOR_DASHBOARD_VIEWED", entityType: "platform", entityId: "investor-safe", ipAddress: getClientIp(req) });
      res.json({
        disclaimer: "Aggregate metrics only. No protected claim data included.",
        totalClaimsProcessed: claims.length,
        totalUsers: users.length,
        totalAdjustersTracked: adjs.length,
        platformAdoptionTrend: countLastNDays(users, "createdAt", 30) >= 1 ? "growing" : "stable",
        newUsersLast30Days: countLastNDays(users, "createdAt", 30),
        newClaimsLast30Days: countLastNDays(claims, "createdAt", 30),
      });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // ─── Section 24b: Executive Intelligence Aggregation ──────────────────────
  app.get("/api/executive/intelligence", requireAuth, requireActiveSubscription, requireExecAccess, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const isGlobal = isMaster(role);
      const [claims, allTimeline, allEvidence, allPlaybooks, allAdjusters] = await Promise.all([
        isGlobal ? storage.getAllClaimsAcrossTenants() : storage.getClaims(orgId),
        isGlobal ? storage.getAllTimelineEvents() : storage.getTimelineEventsByOrgId(orgId),
        isGlobal ? storage.getAllEvidenceFilesAcrossTenants() : storage.getEvidenceFiles(orgId),
        storage.getPlaybookEntries(),
        isGlobal ? storage.getAllAdjustersAcrossTenants() : storage.getAdjusters(orgId),
      ]);

      // Financial aggregates
      const totalRCV = claims.reduce((sum: number, c: typeof claims[0]) => sum + (c.rcvAmount ?? c.rcvTotal ?? 0), 0);
      const totalACV = claims.reduce((sum: number, c: typeof claims[0]) => sum + (c.acvAmount ?? c.acvTotal ?? 0), 0);
      const _totalDeductible = claims.reduce((sum: number, c: typeof claims[0]) => sum + (c.deductible ?? 0), 0);
      const _totalDepreciation = claims.reduce((sum: number, c: typeof claims[0]) => sum + (c.recoverableDepreciation ?? 0) + (c.nonRecoverableDepreciation ?? 0), 0);
      const totalPayments = claims.reduce((sum: number, c: typeof claims[0]) => sum + (c.finalPaidAmount ?? 0) + (c.priorPayments ?? 0), 0);
      const totalSupplementRequested = claims.reduce((sum: number, c: typeof claims[0]) => sum + (c.supplementRequested ?? 0), 0);
      const totalSupplementApproved = claims.reduce((sum: number, c: typeof claims[0]) => sum + (c.supplementApproved ?? 0), 0);
      const totalRecovered = totalPayments + totalSupplementApproved - totalACV;
      const revenueOpportunity = claims.reduce((sum: number, c: typeof claims[0]) => sum + (c.outstandingAmount ?? 0), 0);

      // Status breakdown
      const openClaims = claims.filter((c: typeof claims[0]) => !["closed", "resolved", "denied"].includes(c.status));
      const deniedClaims = claims.filter((c: typeof claims[0]) => c.status === "denied" || c.finalOutcome === "denied");
      const approvedClaims = claims.filter((c: typeof claims[0]) => c.status === "resolved" || c.finalOutcome === "approved");
      const overturned = claims.filter((c: typeof claims[0]) => c.denialOverturned === true);
      const supplementApprovedClaims = claims.filter((c: typeof claims[0]) => c.supplementOutcome === "approved");

      // Aging claims (open > 30 days without status change)
      const now = new Date();
      const aging30 = openClaims.filter(c => {
        const claimEvents = allTimeline.filter(t => t.claimId === c.id).sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
        const lastEvent = claimEvents[0];
        const daysSince = lastEvent?.createdAt ? (now.getTime() - new Date(lastEvent.createdAt).getTime()) / 86400000 : 999;
        return daysSince > 30;
      });
      const aging60 = aging30.filter(c => {
        const claimEvents = allTimeline.filter(t => t.claimId === c.id).sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
        const lastEvent = claimEvents[0];
        const daysSince = lastEvent?.createdAt ? (now.getTime() - new Date(lastEvent.createdAt).getTime()) / 86400000 : 999;
        return daysSince > 60;
      });
      const aging90 = aging60.filter(c => {
        const claimEvents = allTimeline.filter(t => t.claimId === c.id).sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
        const lastEvent = claimEvents[0];
        const daysSince = lastEvent?.createdAt ? (now.getTime() - new Date(lastEvent.createdAt).getTime()) / 86400000 : 999;
        return daysSince > 90;
      });

      // Missing documents per claim
      const claimDocs = new Map<string, string[]>();
      for (const e of allEvidence) {
        if (!e.claimId) continue;
        if (!claimDocs.has(e.claimId)) claimDocs.set(e.claimId, []);
        claimDocs.get(e.claimId)!.push(e.docCategory || "unknown");
      }
      const missingDenialLetters = claims.filter(c => (c.status === "denied" || c.finalOutcome === "denied") && !(claimDocs.get(c.id)?.includes("denial_letter")));
      const missingEstimates = claims.filter(c => (c.status === "resolved" || c.finalOutcome === "approved") && !(claimDocs.get(c.id)?.includes("estimate")));
      const missingSupplements = claims.filter(c => (c.supplementRequested ?? 0) > 0 && !(claimDocs.get(c.id)?.includes("supplement")));

      // Carrier performance
      const carrierGroups = new Map<string, typeof claims>();
      for (const c of claims) {
        if (!c.carrier) continue;
        if (!carrierGroups.has(c.carrier)) carrierGroups.set(c.carrier, []);
        carrierGroups.get(c.carrier)!.push(c);
      }
      const carrierPerformance = Array.from(carrierGroups.entries()).map(([carrier, carrierClaims]) => {
        const cDenied = carrierClaims.filter(c => c.status === "denied" || c.finalOutcome === "denied").length;
        const cApproved = carrierClaims.filter(c => c.status === "resolved" || c.finalOutcome === "approved").length;
        return {
          carrier,
          claims: carrierClaims.length,
          denialRate: carrierClaims.length > 0 ? Number((cDenied / carrierClaims.length).toFixed(2)) : 0,
          approvalRate: carrierClaims.length > 0 ? Number((cApproved / carrierClaims.length).toFixed(2)) : 0,
          confidence: carrierClaims.length >= 3 ? Math.min(0.5 + carrierClaims.length * 0.02, 0.95) : 0.3,
        };
      }).sort((a, b) => b.claims - a.claims).slice(0, 10);

      // Adjuster performance (linked via claims)
      const adjusterClaims = new Map<string, typeof claims>();
      for (const c of claims) {
        if (!c.adjusterId) continue;
        if (!adjusterClaims.has(c.adjusterId)) adjusterClaims.set(c.adjusterId, []);
        adjusterClaims.get(c.adjusterId)!.push(c);
      }
      const adjusterPerformance = Array.from(adjusterClaims.entries()).map(([adjId, adjClaims]) => {
        const adj = allAdjusters.find(a => a.id === adjId);
        const cDenied = adjClaims.filter(c => c.status === "denied" || c.finalOutcome === "denied").length;
        const cApproved = adjClaims.filter(c => c.status === "resolved" || c.finalOutcome === "approved").length;
        return {
          adjusterId: adjId,
          adjusterName: adj?.adjusterName || "Unknown",
          claims: adjClaims.length,
          denialRate: adjClaims.length > 0 ? Number((cDenied / adjClaims.length).toFixed(2)) : 0,
          approvalRate: adjClaims.length > 0 ? Number((cApproved / adjClaims.length).toFixed(2)) : 0,
          confidence: adjClaims.length >= 3 ? Math.min(0.5 + adjClaims.length * 0.02, 0.95) : 0.3,
        };
      }).sort((a, b) => b.claims - a.claims).slice(0, 10);

      // Top risks
      const topRisks = [
        { label: "Denied claims with no overturn attempt", count: deniedClaims.filter(c => !c.denialOverturned && !c.reinspectionRequested).length, recommendedAction: "Review denial letters and consider supplement or reinspection submission" },
        { label: "Aging claims with no recent activity", count: aging30.length, recommendedAction: "Follow up on open claims with no status change in 30+ days" },
        { label: "Claims missing critical documents", count: missingDenialLetters.length + missingEstimates.length + missingSupplements.length, recommendedAction: "Upload missing denial letters, estimates, or supplement documents" },
      ];

      // Top opportunities
      const topOpportunities = [
        { label: "Claims with recoverable depreciation", count: claims.filter(c => (c.recoverableDepreciation ?? 0) > 0).length, recommendedAction: "Pursue release of recoverable depreciation" },
        { label: "Claims with outstanding amounts", count: claims.filter(c => (c.outstandingAmount ?? 0) > 0).length, recommendedAction: "Submit supplements for outstanding scope" },
        { label: "Underpaid claims (paid < ACV)", count: claims.filter(c => (c.finalPaidAmount ?? 0) > 0 && (c.finalPaidAmount ?? 0) < (c.acvAmount ?? c.acvTotal ?? 0)).length, recommendedAction: "Review underpaid claims for supplement opportunities" },
      ];

      // Recommended actions
      const recommendedActions: string[] = [];
      const noOverturn = deniedClaims.filter(c => !c.denialOverturned && !c.reinspectionRequested);
      if (noOverturn.length > 0) recommendedActions.push(`Review ${noOverturn.length} denied claims with no overturn attempt`);
      const outstandingHigh = claims.filter(c => (c.outstandingAmount ?? 0) > 10000);
      if (outstandingHigh.length > 0) recommendedActions.push(`Submit supplements for ${outstandingHigh.length} claims with outstanding amounts > $10,000`);
      if (aging90.length > 0) recommendedActions.push(`Follow up on ${aging90.length} claims open for 90+ days`);
      if (missingDenialLetters.length > 0) recommendedActions.push(`Upload missing denial letters for ${missingDenialLetters.length} claims`);

      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "EXECUTIVE_INTELLIGENCE_VIEWED", entityType: "platform", entityId: "intelligence", ipAddress: getClientIp(req) });
      res.json({
        executiveSummary: {
          period: `${new Date(now.getTime() - 90 * 86400000).toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`,
          totalClaims: claims.length,
          openClaims: openClaims.length,
          closedClaims: claims.length - openClaims.length,
          deniedClaims: deniedClaims.length,
          approvedClaims: approvedClaims.length,
          overturnedDenials: overturned.length,
          supplementApprovals: supplementApprovedClaims.length,
          totalRCV,
          totalACV,
          totalPayments,
          totalSupplementRequested,
          totalSupplementApproved,
          totalRecovered,
          revenueOpportunity,
        },
        topRisks,
        topOpportunities,
        carrierPerformance,
        adjusterPerformance,
        agingClaims: [
          { age: "30-60 days", count: aging30.length - aging60.length },
          { age: "60-90 days", count: aging60.length - aging90.length },
          { age: "90+ days", count: aging90.length },
        ],
        missingDocuments: [
          { document: "Denial letter", count: missingDenialLetters.length },
          { document: "Estimate", count: missingEstimates.length },
          { document: "Supplement", count: missingSupplements.length },
        ],
        recommendedActions,
        playbookPerformance: allPlaybooks.slice(0, 5).map(p => ({
          pattern: p.title || "Unnamed pattern",
          label: (p.sourceClaimCount ?? 0) >= 3 ? "Validated Pattern" : "Example",
          confidence: p.confidenceScore ?? 0,
          sourceClaimCount: p.sourceClaimCount ?? 0,
        })),
      });
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  // ─── Section 25: Network Intelligence Engine ──────────────────────────────
  app.get("/api/master/intelligence/patterns", requireAuth, requirePlatformOwner, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const [allClaims, allEscs] = await Promise.all([storage.getAllClaimsAcrossTenants(), storage.getAllEscalationsAcrossTenants()]);
      const patterns = computePatterns(allClaims, allEscs);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "NETWORK_INTELLIGENCE_VIEWED", entityType: "platform", entityId: "patterns", ipAddress: getClientIp(req) });
      res.json(patterns);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/master/intelligence/trends", requireAuth, requirePlatformOwner, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const rawDays = parseInt(req.query.days as string) || 90;
      const days = ([30, 90, 180, 365].includes(rawDays) ? rawDays : 90) as 30 | 90 | 180 | 365;
      const allClaims = await storage.getAllClaimsAcrossTenants();
      const trends = computeTrends(allClaims, days);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "NETWORK_INTELLIGENCE_VIEWED", entityType: "platform", entityId: "trends", ipAddress: getClientIp(req) });
      res.json(trends);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/master/intelligence/correlations", requireAuth, requirePlatformOwner, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const allClaims = await storage.getAllClaimsAcrossTenants();
      const correlations = computeOutcomeCorrelations(allClaims);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "NETWORK_INTELLIGENCE_VIEWED", entityType: "platform", entityId: "correlations", ipAddress: getClientIp(req) });
      res.json(correlations);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  app.get("/api/master/intelligence/signals", requireAuth, requirePlatformOwner, async (req: AuthRequest, res: Response) => {
    try {
      const { organizationId: orgId, userId, role } = req.auth!;
      const [allClaims, allEscs] = await Promise.all([storage.getAllClaimsAcrossTenants(), storage.getAllEscalationsAcrossTenants()]);
      const signals = computeEmergingSignals(allClaims, allEscs);
      await storage.createAuditLog({ organizationId: orgId, actorUserId: userId, actorRole: role, actionType: "NETWORK_INTELLIGENCE_VIEWED", entityType: "platform", entityId: "signals", ipAddress: getClientIp(req) });
      res.json(signals);
    } catch (err) { res.status(500).json({ message: (err as Error).message }); }
  });

  seedPlatformOwner().catch(console.error);
  seedDefaultWeights().catch(console.error);
  if (isDemoSeedingAllowed()) {
    seedDemoData().catch(console.error);
    seedDemoUsers().catch(console.error);
    seedSamplePlaybooks()
      .then((n) => n > 0 && console.log(`[seedSamplePlaybooks] created ${n} sample playbook(s)`))
      .catch(console.error);
  } else {
    console.log("[seedDemoData] skipped — demo seeding not allowed in this environment.");
  }

  registerSeoRoutes(app);

  return httpServer;
}

function sanitizeUser(user: import("@shared/schema").User) {
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

// Create or promote a Master (master_admin) platform-owner user. Idempotent.
// Also syncs the password hash whenever ADMIN_PASSWORD secret changes.
async function ensureMasterUser(email: string, password: string, fullName: string) {
  const existing = await storage.getUserByEmail(email);
  if (existing) {
    const updates: Record<string, unknown> = {};
    if (!existing.isPlatformOwner || existing.role !== 'master_admin') {
      updates.isPlatformOwner = true;
      updates.role = 'master_admin';
    }
    // Sync display name: strip any stale "(DEMO)" suffix or other drift.
    if (existing.fullName !== fullName) {
      updates.fullName = fullName;
      console.log(`[ensureMasterUser] Display name synced: "${existing.fullName}" → "${fullName}".`);
    }
    // Sync password: if the secret changed since last seed, update the hash.
    const passwordMatch = existing.passwordHash
      ? await bcrypt.compare(password, existing.passwordHash)
      : false;
    if (!passwordMatch) {
      updates.passwordHash = await bcrypt.hash(password, 12);
      console.log("[ensureMasterUser] Password synced from ADMIN_PASSWORD secret.");
    }
    if (Object.keys(updates).length > 0) {
      await storage.updateUser(existing.id, updates);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const org = await storage.createOrganization({ name: "ClaimSignal Platform" });

  await storage.createUser({
    email,
    passwordHash,
    fullName,
    organizationId: org.id,
    role: 'master_admin',
    isPlatformOwner: true,
    founderFlag: false,
  });

  await storage.createBillingAccount({
    organizationId: org.id,
    subscriptionStatus: "active",
    planType: "founder",
  });
}

async function seedPlatformOwner() {
  // Credential policy is centralized in config: production never uses hardcoded
  // defaults (even with DEMO_MODE) and requires explicit MASTER_* env values.
  const seed = resolveSeedMasterCredentials();
  if (!seed) {
    console.warn(
      "[seedPlatformOwner] No Master seeded — production requires explicit MASTER_EMAIL / " +
        "MASTER_INITIAL_PASSWORD, or seeding is disabled in this environment. No default credentials created.",
    );
    return;
  }

  await ensureMasterUser(seed.email, seed.password, process.env.MASTER_DISPLAY_NAME || "Platform Owner");

  // The hardcoded demo/test login is ONLY ever created outside production.
  if (!seed.isDemo) {
    console.log("[seedPlatformOwner] Production Master ensured from explicit env credentials.");
    return;
  }

  // Demo/test login used for the local environment & demos.
  // Password is configurable via DEMO_USER_PASSWORD env var; the fallback is
  // intentionally obvious and only ever used in dev/test — never in production.
  const testEmail = "user@claimsignal.test";
  const testPassword = process.env.DEMO_USER_PASSWORD || "password123";
  const testExisting = await storage.getUserByEmail(testEmail);
  if (!testExisting) {
    const testPasswordHash = await bcrypt.hash(testPassword, 12);
    const testOrg = await storage.createOrganization({ name: "Test Organization (DEMO)" });

    await storage.createUser({
      email: testEmail,
      passwordHash: testPasswordHash,
      fullName: "Test User (DEMO)",
      organizationId: testOrg.id,
      role: 'master_admin',
      isPlatformOwner: true,
      founderFlag: false,
    });

    await storage.createBillingAccount({
      organizationId: testOrg.id,
      subscriptionStatus: "active",
      planType: "pro",
    });
  } else {
    const billing = await storage.getBillingAccountByOrg(testExisting.organizationId);
    if (billing && billing.planType === "founder") {
      await storage.updateBillingAccount(billing.id, { planType: "pro" });
    }
  }
}

async function seedDemoData() {
  const testEmail = "user@claimsignal.test";
  const testUser = await storage.getUserByEmail(testEmail);
  if (!testUser) {
    console.log("[seedDemoData] test user not found, skipping");
    return;
  }

  const orgId = testUser.organizationId;
  const userId = testUser.id;

  const existingClaims = await storage.getClaims(orgId);
  if (existingClaims.length > 0) {
    console.log("[seedDemoData] claims already exist, skipping");
    return;
  }

  const adjuster = await storage.createAdjuster({
    organizationId: orgId,
    carrierName: "StateFarm Mutual",
    adjusterName: "Michael Carter",
    adjusterEmail: "m.carter@statefarm.example.com",
    adjusterPhone: "214-555-0192",
    region: "Dallas/Fort Worth",
    ladderAssistVendor: "EagleView",
    isFieldAdjuster: true,
    isDeskAdjuster: false,
    avgResponseTimeHours: 18,
    avgDaysToInitialDetermination: 5.2,
    supplementAcceptanceRate: 0.38,
    reinspectionRate: 0.22,
    denialRate: 0.14,
    escalationTriggerRate: 0.09,
    totalClaimsTracked: 47,
    totalDenials: 7,
    totalReinspections: 11,
    totalSupplementsRequested: 19,
    totalSupplementsApproved: 7,
    frictionScore: 6.2,
    integrityScore: 7.1,
    escalationScore: 5.4,
    outcomeMigrationScore: 4.8,
    denialRatio: 0.14,
    partialApprovalRatio: 0.41,
    supplementReductionRatio: 0.63,
    transcriptDelayLanguageRate: 0.08,
    transcriptDeflectionLanguageRate: 0.12,
    ircRejectionRate: 0.06,
    paymentUnderScopeRatio: 0.18,
  });

  const dateOfLoss = new Date("2026-04-12");
  const inspectionDate = new Date("2026-04-18");
  const determinationDate = new Date("2026-04-25");

  const claim = await storage.createClaim({
    organizationId: orgId,
    adjusterId: adjuster.id,
    claimNumber: "SF-2026-0412897",
    carrier: "StateFarm Mutual",
    policyNumber: "TX-H-8847291-A",
    homeownerName: "J. S***",
    homeownerPhone: "21****92",
    homeownerEmail: "js****@example.com",
    insuredName: "J. S***",
    propertyAddress: "**** Oak Ave, Dallas, TX 75201",
    address: "1234 Oak Avenue",
    city: "Dallas",
    state: "TX",
    zipCode: "75201",
    lossType: "Hail / Wind",
    roofType: "Asphalt Shingle",
    shingleType: "GAF Timberline HDZ",
    notes: "Hail damage to roof and gutters. Initial inspection completed April 18. Determination issued April 25 with partial approval. Supplement submitted May 3 for gutter replacement and siding. Awaiting reinspection.",
    status: "open",
    currentPhase: "supplement_submitted",
    dateOfLoss,
    inspectionDate,
    determinationDate,
    rcvAmount: 28450.0,
    acvAmount: 22100.0,
    deductible: 2500.0,
    supplementAmountTotal: 4200.0,
    finalPaidAmount: 0,
    claimAmount: 28450.0,
    approvedAmount: 19600.0,
    rcvTotal: 28450.0,
    acvTotal: 22100.0,
    lifecycleVelocityScore: 62.0,
    scopeDeltaScore: 48.0,
    escalationLevel: 2,
    outcomeMigrationDelta: 0.18,
    frictionScore: 6,
    approvalProbability: 0.71,
    escalationCategory: "supplement_resistance",
    riskScore: 5,
    lossDate: dateOfLoss,
    aiClaimSummary: "Hail damage claim with partial approval. Supplement pending for gutter and siding scope. Reinspection likely required.",
    adjusterFrictionScore: 6.2,
    supplementProbabilityScore: 0.73,
    ircComplianceRiskScore: 3.2,
  });

  await storage.linkAdjusterToClaim({ claimId: claim.id, adjusterId: adjuster.id, organizationId: orgId, roleOnClaim: "primary_adjuster" });

  await storage.createSupplement({
    claimId: claim.id,
    organizationId: orgId,
    amountRequested: 4200.0,
    amountApproved: 0,
    amountDenied: 0,
    dateSubmitted: new Date("2026-05-03"),
    status: "pending",
    notes: "Gutter replacement and siding repair scope delta. Supporting photos included.",
  });

  const evidenceFile = await storage.createEvidenceFile({
    claimId: claim.id,
    organizationId: orgId,
    uploadedByUserId: userId,
    fileName: "SF_Initial_Determination_2026-04-25.pdf",
    fileType: "pdf",
    storageUrl: "#demo",
    sha256: "demo-sha256-determination",
    docCategory: "payment_letter",
    extractionStatus: "complete",
    confidence: 0.88,
    carrierName: "StateFarm Mutual",
    extractedJson: {
      claimNumber: "SF-2026-0412897",
      policyNumber: "TX-H-8847291-A",
      rcv: "28450.00",
      acv: "22100.00",
      deductible: "2500.00",
      netClaim: "19600.00",
    },
  });

  const evidenceFile2 = await storage.createEvidenceFile({
    claimId: claim.id,
    organizationId: orgId,
    uploadedByUserId: userId,
    fileName: "Xactimate_Estimate_Roof_2026-04-18.pdf",
    fileType: "pdf",
    storageUrl: "#demo",
    sha256: "demo-sha256-estimate",
    docCategory: "estimate",
    extractionStatus: "complete",
    confidence: 0.91,
    carrierName: "StateFarm Mutual",
    extractedJson: {
      claimNumber: "SF-2026-0412897",
      rcv: "28450.00",
      acv: "22100.00",
      deductible: "2500.00",
      roofingSquares: "24.2",
      opIncluded: false,
    },
  });

  await storage.createTimelineEvent({
    claimId: claim.id,
    organizationId: orgId,
    eventType: "doc_uploaded",
    eventDate: new Date("2026-04-25T10:15:00"),
    title: "Initial Determination Letter Received",
    description: "StateFarm issued partial approval. ACV: $22,100 — Deductible: $2,500 — Net: $19,600.",
    evidenceFileId: evidenceFile.id,
    createdByUserId: userId,
  });

  await storage.createTimelineEvent({
    claimId: claim.id,
    organizationId: orgId,
    eventType: "doc_uploaded",
    eventDate: new Date("2026-04-18T09:30:00"),
    title: "Xactimate Estimate Uploaded",
    description: "Carrier estimate for roof replacement: RCV $28,450 / ACV $22,100. Scope gaps identified: O&P, drip edge, permit.",
    evidenceFileId: evidenceFile2.id,
    createdByUserId: userId,
  });

  await storage.createTimelineEvent({
    claimId: claim.id,
    organizationId: orgId,
    eventType: "supplement_filed",
    eventDate: new Date("2026-05-03T14:00:00"),
    title: "Supplement Filed — Gutters & Siding",
    description: "Supplement submitted for $4,200 covering gutter replacement and siding repair not included in initial scope.",
    createdByUserId: userId,
  });

  await storage.createAiInsight({
    claimId: claim.id,
    organizationId: orgId,
    insightType: "escalation_risk",
    confidenceScore: 0.78,
    summary: "Adjuster Carter has below-average supplement acceptance rate (38%). Historical pattern shows 63% supplement reduction ratio. Recommend detailed scope documentation and photo evidence to counter depreciation disputes.",
  });

  await storage.createAiInsight({
    claimId: claim.id,
    organizationId: orgId,
    insightType: "friction_pattern",
    confidenceScore: 0.82,
    summary: "Response velocity within normal range (18h avg), but deflection language detected in transcripts. 12% deflection rate above carrier average. Escalation to desk supervisor may be warranted if supplement is reduced again.",
  });

  console.log("[seedDemoData] demo data seeded successfully");
}

// ─── Demo Role Accounts ───────────────────────────────────────────────────────
// Creates one safe demo login for every required role. Fully idempotent —
// checks email existence before acting. Passwords are temporary demo values.
// Never exposes hashes or secrets; all values are logged only as labels.
async function seedDemoUsers() {
  const DEMO_PASSWORD = "Demo@ClaimSignal1";

  async function ensureUser(opts: {
    email: string;
    fullName: string;
    orgName?: string;          // omit to join an existing org by ID
    orgId?: string;            // provide to join existing org
    role: 'executive_admin' | 'team_admin' | 'team_member' | "founder" | 'individual' | 'master_admin';
    founderFlag?: boolean;
    planType?: string;
    subscriptionStatus?: "active" | "trialing";
    trialDays?: number;
  }): Promise<{ userId: string; orgId: string }> {
    const existing = await storage.getUserByEmail(opts.email);
    if (existing) return { userId: existing.id, orgId: existing.organizationId };

    const orgId = opts.orgId ?? (await storage.createOrganization({ name: opts.orgName! })).id;
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const user = await storage.createUser({
      email: opts.email,
      passwordHash: hash,
      fullName: opts.fullName,
      organizationId: orgId,
      role: opts.role,
      founderFlag: opts.founderFlag ?? false,
    });

    // Billing (org-level — only create once per org)
    const existingBilling = await storage.getBillingAccountByOrg(orgId);
    if (!existingBilling && opts.planType) {
      const billingData: Record<string, unknown> = { organizationId: orgId, planType: opts.planType };
      if (opts.subscriptionStatus === "trialing" && opts.trialDays) {
        billingData.subscriptionStatus = "trialing";
        billingData.trialStartDate = new Date();
        billingData.trialEndDate = new Date(Date.now() + opts.trialDays * 86400_000);
      } else {
        billingData.subscriptionStatus = opts.subscriptionStatus ?? "active";
      }
      await storage.createBillingAccount(billingData as Parameters<typeof storage.createBillingAccount>[0]);
    }

    return { userId: user.id, orgId };
  }

  // ── Executive (executive_admin) ──────────────────────────────────────────
  await ensureUser({
    email: "exec@claimsignal.test",
    fullName: "Executive Demo",
    orgName: "Demo Carrier Analytics",
    role: 'executive_admin',
    planType: "pro",
    subscriptionStatus: "active",
  });

  // ── Founder ───────────────────────────────────────────────────────────────
  await ensureUser({
    email: "founder@claimsignal.test",
    fullName: "Founder Demo",
    orgName: "Demo Founder Org",
    role: "founder",
    founderFlag: true,
    planType: "founder",
    subscriptionStatus: "trialing",
    trialDays: 14,
  });

  // ── Individual ────────────────────────────────────────────────────────────
  await ensureUser({
    email: "individual@claimsignal.test",
    fullName: "Individual Demo",
    orgName: "Demo Individual Org",
    role: 'individual',
    planType: "pro",
    subscriptionStatus: "active",
  });

  // ── Team Admin + Team Member (shared org) ─────────────────────────────────
  const { orgId: teamOrgId } = await ensureUser({
    email: "teamadmin@claimsignal.test",
    fullName: "Team Admin Demo",
    orgName: "Demo Team Organization",
    role: 'team_admin',
    planType: "team",
    subscriptionStatus: "active",
  });

  await ensureUser({
    email: "member@claimsignal.test",
    fullName: "Team Member Demo",
    orgId: teamOrgId,          // same org as Team Admin — billing already created
    role: 'individual',
    // no planType — billing already exists at org level
  });

  // ── Patch existing test accounts that have no billing account ─────────────
  for (const { email, planType } of [
    { email: "test@example.com", planType: "founder" },
    { email: "indiv_perm_test@claimsignal.test", planType: "pro" },
  ]) {
    const u = await storage.getUserByEmail(email);
    if (!u) continue;
    const bill = await storage.getBillingAccountByOrg(u.organizationId);
    if (!bill) {
      const bd: Record<string, unknown> = { organizationId: u.organizationId, planType };
      if (planType === "founder") {
        bd.subscriptionStatus = "trialing";
        bd.trialStartDate = new Date();
        bd.trialEndDate = new Date(Date.now() + 14 * 86400_000);
      } else {
        bd.subscriptionStatus = "active";
      }
      await storage.createBillingAccount(bd as Parameters<typeof storage.createBillingAccount>[0]);
    }
  }

  console.log("[seedDemoUsers] all demo role accounts ready");
}
