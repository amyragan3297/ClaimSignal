import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import { signupSchema, loginSchema, insertClientSchema, insertSupplementSchema, insertAdjusterSchema, insertStormEventSchema } from "@shared/schema";
import { applyPiiMasking, applyPiiMaskingToList, canViewUnmasked, sanitizeSharedClaimList, sanitizePlaybookList, sanitizePlaybookRecord, toPlaybookAggregate, isMaster } from "./masking";
import { computeCarrierIntelligence } from "./carrier-intelligence";
import { computeAdjusterScorecard } from "./adjuster-scorecard";
import { parseQueryToFilters, filterClaims, buildStrategySummary, similarityScore, isUsableOutcome, type PlaybookFilters } from "./playbook-engine";
import { createCandidatesFromText, sampleClaimDocumentText } from "./timeline-extraction";
import { seedSamplePlaybooks } from "./playbook-seed";
import { insertPlaybookEntrySchema } from "@shared/schema";
import { createCheckoutSession, handleWebhookEvent } from "./billing";
import exportsRouter from "./exports";
import evidenceRouter from "./evidence";
import intelligenceRouter from "./intelligence";
import { computeLifecycleVelocity } from "./scoring";
import { seedDefaultWeights } from "./scoring";
import { generateClaimAnalysis, transcribeAudio, isOpenAIConfigured } from "./ai-services";
import { getClaimWeather } from "./weather";
import express from "express";
import { createHash } from "crypto";
import { isDemoSeedingAllowed, resolveSeedMasterCredentials } from "./config";
import {
  type AuthRequest,
  requireAuth,
  requireActiveSubscription,
  requirePlatformOwner,
  requireSuperAdmin,
  blockDuringImpersonation,
  createAuthSession,
  refreshAuthSession,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getClientIp,
  hashToken,
} from "./auth";

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
function normalizeClaimInput<T extends Record<string, any>>(body: T): T {
  const out: Record<string, any> = { ...body };
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
    const d = new Date(v);
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
    res.json({ ok: true });
  });

  app.post("/api/auth/register", async (req: AuthRequest, res) => {
    try {
      const data = signupSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const planType = data.planType || "pro";

      if (planType === "founder") {
        const founderCount = await storage.getFounderSubscriptionCount();
        if (founderCount >= 3) {
          return res.status(400).json({ message: "Founder tier unavailable - all 3 spots are taken" });
        }
      }

      const passwordHash = await bcrypt.hash(data.password, 12);
      const org = await storage.createOrganization({ name: data.orgName });

      const user = await storage.createUser({
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        organizationId: org.id,
        role: planType === "founder" ? "founder" : "standard",
        founderFlag: planType === "founder",
      });

      const billingData: any = {
        organizationId: org.id,
        planType,
      };

      if (planType === "founder") {
        const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        billingData.subscriptionStatus = "trialing";
        billingData.trialStartDate = new Date();
        billingData.trialEndDate = trialEnd;
      } else {
        billingData.subscriptionStatus = "active";
      }

      await storage.createBillingAccount(billingData);

      await storage.createAuditLog({
        organizationId: org.id,
        actorUserId: user.id,
        actorRole: planType === "founder" ? "founder" : "standard",
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

      setRefreshTokenCookie(res, refreshToken);
      res.json({ accessToken, user: sanitizeUser(user), orgId: org.id });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", async (req: AuthRequest, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(data.password, user.passwordHash);
      if (!valid) {
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

      setRefreshTokenCookie(res, refreshToken);
      res.json({ accessToken, user: sanitizeUser(user), orgId: user.organizationId });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
    } catch (err: any) {
      return res.status(401).json({ message: "Refresh failed" });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.auth?.sessionId) {
        await storage.revokeSession(req.auth.sessionId);
      }
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

      res.json({
        user: sanitizeUser(user),
        org,
        billing: billing || null,
        founderAgreement: founderAgreement || null,
        isPlatformOwner: !!user.isPlatformOwner || user.role === "super_admin",
        isImpersonation: req.auth!.isImpersonation,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
      const avgSupplementOpp = claims.length > 0
        ? claims.reduce((sum, c) => sum + (c.supplementAmountTotal ?? 0), 0) / claims.length
        : 0;
      res.json({
        totalClaims,
        openClaims,
        totalAdjusters,
        highRiskClaims,
        overturnedDenials,
        avgSupplementOpp: Math.round(avgSupplementOpp * 100) / 100,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/claims", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;

      // Master sees all claims across all tenants, always unmasked
      // Non-Master sees only their own org's claims, always unmasked (own data)
      const claimsData = role === "super_admin"
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);

      if (role === "super_admin") {
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Shared platform claim library — cross-tenant, masked for all non-Master roles
  app.get("/api/claims/shared", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;

      const allClaims = await storage.getAllClaimsAcrossTenants();

      await storage.createAuditLog({
        organizationId: orgId,
        actorUserId: req.auth!.userId,
        actorRole: role,
        actionType: "SHARED_LIBRARY_ACCESS",
        entityType: "claims",
        ipAddress: getClientIp(req),
      });

      // Master always unmasked; everyone else receives sanitized/masked records
      if (role === "super_admin") {
        return res.json(allClaims);
      }

      res.json(sanitizeSharedClaimList(allClaims, role));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/claims/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;

      // Try own org first; Master falls back to cross-tenant lookup
      let claim = await storage.getClaim(req.params.id as string, orgId);

      if (!claim && role === "super_admin") {
        const allClaims = await storage.getAllClaimsAcrossTenants();
        claim = allClaims.find((c) => c.id === req.params.id) || undefined;
      }

      if (!claim) return res.status(404).json({ message: "Claim not found" });

      // Master: always unmasked, always audited
      // Non-Master: own-org claim returned unmasked (they own this data)
      if (role === "super_admin") {
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/claims/:id/versions", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const versions = await storage.getClaimVersions(req.params.id as string, orgId);
      res.json(versions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/claims", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const claim = await storage.createClaim({
        ...normalizeClaimInput(req.body),
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/claims/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const existing = await storage.getClaim(req.params.id as string, orgId);
      if (!existing) return res.status(404).json({ message: "Claim not found" });

      const deleted = await storage.softDeleteClaim(req.params.id as string, orgId);
      if (!deleted) return res.status(404).json({ message: "Claim not found" });

      await storage.createAuditLog({
        organizationId: orgId,
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        actionType: "CLAIM_DELETED",
        entityType: "claim",
        entityId: req.params.id as string,
        beforeJson: existing,
        ipAddress: getClientIp(req),
      });

      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Multi-adjuster / cross-claim linkage (Item 7) ──
  // Resolve a claim for the caller (own org, or Master cross-tenant). Returns the
  // claim plus the org scope its adjuster links live in.
  async function resolveClaimForCaller(req: AuthRequest) {
    const role = req.auth!.role;
    const orgId = req.auth!.organizationId;
    let claim = await storage.getClaim(req.params.id as string, orgId);
    if (!claim && role === "super_admin") {
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
      const orgAdjusters = role === "super_admin"
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Link an adjuster to a claim (multiple adjusters per claim supported).
  app.post("/api/claims/:id/adjusters", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      if (role === "carrier_analyst") {
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Update a claim-adjuster link (role / involvement / review status).
  app.patch("/api/claims/:id/adjusters/:linkId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      if (role === "carrier_analyst") return res.status(403).json({ message: "Not permitted for this role" });

      const claim = await resolveClaimForCaller(req);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      const scopeOrg = claim.organizationId;

      const existing = await storage.getClaimAdjusterLink(req.params.linkId as string, scopeOrg);
      if (!existing || existing.claimId !== claim.id) return res.status(404).json({ message: "Link not found" });

      const patch: any = {};
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Unlink an adjuster from a claim (preserves adjuster + other claims; history intact).
  app.delete("/api/claims/:id/adjusters/:linkId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      if (role === "carrier_analyst") return res.status(403).json({ message: "Not permitted for this role" });

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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Cross-claim history for an adjuster (feeds Adjuster Intelligence / profile).
  app.get("/api/adjusters/:id/claims", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;
      const adjusterId = req.params.id as string;

      const links = role === "super_admin"
        ? await storage.getAdjusterClaims(adjusterId)
        : await storage.getAdjusterClaims(adjusterId, orgId);

      const claimIds = Array.from(new Set(links.map((l) => l.claimId)));
      const allClaims = role === "super_admin"
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);
      const claimMap = new Map(allClaims.map((c) => [c.id, c]));

      const enriched = links.map((link) => {
        const c = claimMap.get(link.claimId);
        return {
          ...link,
          claimNumber: c?.claimNumber ?? null,
          carrier: c?.carrier ?? null,
          status: c?.status ?? null,
          initialOutcome: (c as any)?.initialOutcome ?? null,
          finalOutcome: (c as any)?.finalOutcome ?? null,
          denialOverturned: (c as any)?.denialOverturned ?? null,
        };
      });

      res.json({ linkedClaimCount: claimIds.length, links: enriched });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Adjuster Scorecard (Section 14) — behavioral metrics from REAL linked claims.
  // Separate from cross-claim history; never fabricates; < 3 claims => insufficient.
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

      res.json({ method: "MVP rule-based", ...scorecard });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/adjusters", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const adjustersList = role === "super_admin"
        ? await storage.getAllAdjustersAcrossTenants()
        : await storage.getAdjusters(req.auth!.organizationId);
      res.json(adjustersList);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "CARRIER_INTELLIGENCE_VIEWED", entityType: "carrier_intelligence", entityId: "aggregate",
        afterJson: { scope: isMaster(role) ? "cross_tenant" : "tenant", carrierCount: undefined },
        ipAddress: getClientIp(req),
      });
      res.json(computeCarrierIntelligence(claims));
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Review actions: accept | edit | reject | verify | change event type
  app.patch("/api/timeline/:id/review", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const ev = await storage.getTimelineEvent(req.params.id as string, orgId);
      if (!ev) return res.status(404).json({ message: "Timeline event not found" });
      const action = String(req.body?.action || "");
      const patch: Record<string, any> = {};
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
      if (role === "carrier_analyst") return res.json(entries.map(toPlaybookAggregate));
      return res.json(sanitizePlaybookList(entries, role));
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/playbooks/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      if (role === "carrier_analyst") {
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
      // Simple rule-based scoring (NOT AI): match carrier / claimType / denial reason / scenario signals.
      const scored = all.map((pb) => {
        let score = 0;
        const reasons: string[] = [];
        if (pb.carrier && claim.carrier && pb.carrier.toLowerCase() === claim.carrier.toLowerCase()) { score += 3; reasons.push("same carrier"); }
        if (pb.claimType && (claim.claimType || claim.lossType) && pb.claimType.toLowerCase() === String(claim.claimType || claim.lossType).toLowerCase()) { score += 2; reasons.push("same claim type"); }
        if (pb.denialReason && claim.denialReason && pb.denialReason.toLowerCase().includes(claim.denialReason.toLowerCase().slice(0, 6))) { score += 3; reasons.push("similar denial reason"); }
        if (pb.escalationUsed && claim.escalationUsed) { score += 1; reasons.push("escalation context"); }
        if (pb.region && claim.state && pb.region.toLowerCase() === claim.state.toLowerCase()) { score += 1; reasons.push("same region"); }
        return { playbook: sanitizePlaybookRecord(pb, role), matchScore: score, matchReasons: reasons };
      }).filter((x) => x.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore).slice(0, 5);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: role,
        isImpersonation: req.auth!.isImpersonation, impersonatorUserId: req.auth!.impersonatorUserId,
        actionType: "PLAYBOOK_RECOMMENDATION_GENERATED", entityType: "claim", entityId: claim.id,
        afterJson: { count: scored.length }, ipAddress: getClientIp(req),
      });
      res.json({ method: "MVP rule-based recommendation", recommendations: scored });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
      if (!claim && role === "super_admin") {
        const all = await storage.getAllClaimsAcrossTenants();
        claim = all.find((c) => c.id === req.params.id) || undefined;
      }
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const analysis = await generateClaimAnalysis(claim);
      const generatedAt = new Date();
      const updated = await storage.updateClaim(claim.id, claim.organizationId, {
        aiClaimSummary: analysis.narrative,
        aiAnalysisJson: analysis as any,
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Historical weather for the claim's date of loss (keyless Open-Meteo).
  app.get("/api/claims/:id/weather", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const role = req.auth!.role;
      let claim = await storage.getClaim(req.params.id as string, orgId);
      if (!claim && role === "super_admin") {
        const all = await storage.getAllClaimsAcrossTenants();
        claim = all.find((c) => c.id === req.params.id) || undefined;
      }
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const weather = await getClaimWeather(claim);
      if (!weather) {
        return res.json({ available: false, reason: "Insufficient location or date-of-loss data to resolve weather." });
      }

      // Audit cross-tenant access (super_admin viewing another org's claim).
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

      const { latitude, longitude, ...safeWeather } = weather;
      res.json({ available: true, weather: safeWeather });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.use("/api/evidence", requireAuth, requireActiveSubscription, evidenceRouter);
  app.use("/api/intelligence", requireAuth, requireActiveSubscription, intelligenceRouter);

  // Audio recordings
  app.get("/api/audio", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const recordings = await storage.getAudioRecordingsByOrg(req.auth!.organizationId);
      res.json(recordings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/audio/claim/:claimId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const recordings = await storage.getAudioRecordings(req.params.claimId as string, req.auth!.organizationId);
      res.json(recordings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/audio/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateAudioRecording(req.params.id as string, req.auth!.organizationId, req.body);
      if (!updated) return res.status(404).json({ message: "Recording not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

        const recording = await storage.createAudioRecording({
          organizationId: req.auth!.organizationId,
          uploadedByUserId: req.auth!.userId,
          claimId: claimId || null,
          fileUrl: fileName ? `#upload/${fileName}` : null,
          durationSeconds: durationSeconds ? Number(durationSeconds) : null,
          sha256Hash,
          transcriptText,
          processedAt: new Date(),
        } as any);

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
        if (claimId && transcriptText && transcriptText.trim()) {
          try {
            const linkedClaim = await storage.getClaim(claimId, req.auth!.organizationId);
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

        res.json({ ...recording, extractedEventCount });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  // Communications (emails table)
  app.get("/api/communications", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const comms = await storage.getEmailsByOrg(req.auth!.organizationId);
      res.json(comms);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/communications/claim/:claimId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const comms = await storage.getEmails(req.params.claimId as string, req.auth!.organizationId);
      res.json(comms);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.use("/api", exportsRouter);

  app.get("/api/clients", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const clientsList = await storage.getClients(req.auth!.organizationId);
      res.json(clientsList);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/clients/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const client = await storage.getClient(req.params.id as string, req.auth!.organizationId);
      if (!client) return res.status(404).json({ message: "Client not found" });
      res.json(client);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put("/api/clients/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateClient(req.params.id as string, req.auth!.organizationId, req.body);
      if (!updated) return res.status(404).json({ message: "Client not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/claims/:claimId/supplements", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const supps = await storage.getSupplements(req.params.claimId as string, req.auth!.organizationId);
      res.json(supps);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put("/api/supplements/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateSupplement(req.params.id as string, req.auth!.organizationId, req.body);
      if (!updated) return res.status(404).json({ message: "Supplement not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/billing/checkout", requireAuth, blockDuringImpersonation, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      const validPlans = ["founder", "pro", "team", "enterprise"];
      const planType = validPlans.includes(req.body?.planType) ? req.body.planType : "pro";

      if (planType === "founder") {
        const founderCount = await storage.getFounderSubscriptionCount();
        if (founderCount >= 3) {
          return res.status(400).json({ message: "Founder tier unavailable - all 3 spots are taken" });
        }
      }

      const result = await createCheckoutSession(orgId, userId, user.email, planType);
      if ("error" in result) {
        if (result.error.includes("not configured")) {
          return res.json({ message: result.error, fallback: true });
        }
        return res.status(400).json({ message: result.error });
      }

      res.json({ url: result.url });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/billing/status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const billing = await storage.getBillingAccountByOrg(req.auth!.organizationId);
      res.json(billing || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/legal/founder", requireAuth, async (req: AuthRequest, res) => {
    try {
      const agreement = await storage.getFounderAgreement(req.auth!.organizationId);
      res.json(agreement || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/audit-logs", requireAuth, requirePlatformOwner, async (_req: AuthRequest, res) => {
    try {
      const logs = await storage.getAuditLogs();
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
        actorRole: "super_admin",
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
        actorRole: "super_admin",
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Storm Events (Roadmap MVP module) ──────────────────────────────────────
  app.get("/api/storm-events", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const events = await storage.getStormEvents(req.auth!.organizationId);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/storm-events/claim/:claimId", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const events = await storage.getStormEventsByClaim(req.params.claimId as string, req.auth!.organizationId);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/storm-events/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const event = await storage.getStormEvent(req.params.id as string, req.auth!.organizationId);
      if (!event) return res.status(404).json({ message: "Storm event not found" });
      res.json(event);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/storm-events/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateStormEvent(req.params.id as string, req.auth!.organizationId, req.body);
      if (!updated) return res.status(404).json({ message: "Storm event not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Governance routes ────────────────────────────────────────────────────

  function requireCanArchive(req: AuthRequest, res: any, next: any) {
    if (!req.auth) return res.status(401).json({ message: "Not authenticated" });
    const noDestructive = ["carrier_analyst"];
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET archived records (Master only)
  app.get("/api/admin/archived/:entity", requireAuth, requirePlatformOwner, async (req: AuthRequest, res) => {
    try {
      const { entity } = req.params;
      let records: any[] = [];
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Claims governance
  app.patch("/api/claims/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
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
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/claims/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
      const orgId = req.auth!.organizationId;
      const scopedOrgId = isSuperAdmin ? undefined : orgId;
      const ok = await storage.restoreClaim(req.params.id as string, scopedOrgId);
      if (!ok) return res.status(404).json({ message: "Claim not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "CLAIM_RESTORED", entityType: "claim", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/claims/:id/permanent", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteClaim(req.params.id as string, undefined);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "CLAIM_PERMANENTLY_DELETED", entityType: "claim", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Adjusters governance
  app.patch("/api/adjusters/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
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
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/adjusters/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
      const orgId = req.auth!.organizationId;
      const scopedOrgId = isSuperAdmin ? undefined : orgId;
      const ok = await storage.restoreAdjuster(req.params.id as string, scopedOrgId);
      if (!ok) return res.status(404).json({ message: "Adjuster not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "ADJUSTER_RESTORED", entityType: "adjuster", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/adjusters/:id/permanent", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteAdjuster(req.params.id as string, undefined);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "ADJUSTER_PERMANENTLY_DELETED", entityType: "adjuster", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Clients governance
  app.patch("/api/clients/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
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
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/clients/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
      const orgId = req.auth!.organizationId;
      const scopedOrgId = isSuperAdmin ? undefined : orgId;
      const ok = await storage.restoreClient(req.params.id as string, scopedOrgId);
      if (!ok) return res.status(404).json({ message: "Client not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "CLIENT_RESTORED", entityType: "client", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/clients/:id/permanent", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteClient(req.params.id as string, undefined);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "CLIENT_PERMANENTLY_DELETED", entityType: "client", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Evidence governance
  app.patch("/api/evidence/files/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
      const orgId = req.auth!.organizationId;
      const ok = await storage.archiveEvidenceFile(req.params.id as string, isSuperAdmin ? undefined : orgId);
      if (!ok) return res.status(404).json({ message: "File not found or already archived" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "EVIDENCE_ARCHIVED", entityType: "evidence_file", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ archived: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/evidence/files/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
      const orgId = req.auth!.organizationId;
      const ok = await storage.restoreEvidenceFile(req.params.id as string, isSuperAdmin ? undefined : orgId);
      if (!ok) return res.status(404).json({ message: "File not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "EVIDENCE_RESTORED", entityType: "evidence_file", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/evidence/files/:id/permanent", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteEvidenceFile(req.params.id as string, undefined);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "EVIDENCE_PERMANENTLY_DELETED", entityType: "evidence_file", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Audio governance
  app.patch("/api/audio/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
      const orgId = req.auth!.organizationId;
      const ok = await storage.archiveAudioRecording(req.params.id as string, isSuperAdmin ? undefined : orgId);
      if (!ok) return res.status(404).json({ message: "Recording not found or already archived" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "AUDIO_ARCHIVED", entityType: "audio_recording", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ archived: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/audio/:id/restore", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
      const orgId = req.auth!.organizationId;
      const ok = await storage.restoreAudioRecording(req.params.id as string, isSuperAdmin ? undefined : orgId);
      if (!ok) return res.status(404).json({ message: "Recording not found" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "AUDIO_RESTORED", entityType: "audio_recording", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ restored: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/audio/:id/permanent", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteAudioRecording(req.params.id as string, undefined);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "AUDIO_PERMANENTLY_DELETED", entityType: "audio_recording", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Communications governance
  app.patch("/api/communications/:id/archive", requireAuth, requireActiveSubscription, requireCanArchive, async (req: AuthRequest, res) => {
    try {
      const isSuperAdmin = req.auth!.role === "super_admin";
      const orgId = req.auth!.organizationId;
      const ok = await storage.archiveEmail(req.params.id as string, isSuperAdmin ? undefined : orgId);
      if (!ok) return res.status(404).json({ message: "Communication not found or already archived" });
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "COMMUNICATION_ARCHIVED", entityType: "email", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ archived: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
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
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/communications/:id/permanent", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      await storage.permanentDeleteEmail(req.params.id as string, orgId);
      await storage.createAuditLog({
        organizationId: orgId, actorUserId: req.auth!.userId, actorRole: req.auth!.role,
        actionType: "COMMUNICATION_PERMANENTLY_DELETED", entityType: "email", entityId: req.params.id as string, ipAddress: getClientIp(req),
      });
      res.json({ deleted: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  seedPlatformOwner().catch(console.error);
  seedDefaultWeights().catch(console.error);
  if (isDemoSeedingAllowed()) {
    seedDemoData().catch(console.error);
    seedSamplePlaybooks()
      .then((n) => n > 0 && console.log(`[seedSamplePlaybooks] created ${n} sample playbook(s)`))
      .catch(console.error);
  } else {
    console.log("[seedDemoData] skipped — demo seeding not allowed in this environment.");
  }

  return httpServer;
}

function sanitizeUser(user: any) {
  const { passwordHash, ...safe } = user;
  return safe;
}

// Create or promote a Master (super_admin) platform-owner user. Idempotent.
async function ensureMasterUser(email: string, password: string, fullName: string) {
  const existing = await storage.getUserByEmail(email);
  if (existing) {
    if (!existing.isPlatformOwner || existing.role !== "super_admin") {
      await storage.updateUser(existing.id, { isPlatformOwner: true, role: "super_admin" });
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
    role: "super_admin",
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

  await ensureMasterUser(seed.email, seed.password, seed.isDemo ? "Platform Owner (DEMO)" : "Platform Owner");

  // The hardcoded demo/test login is ONLY ever created outside production.
  if (!seed.isDemo) {
    console.log("[seedPlatformOwner] Production Master ensured from explicit env credentials.");
    return;
  }

  // Demo/test login used for the local environment & demos.
  const testEmail = "user@claimsignal.test";
  const testPassword = "password123";
  const testExisting = await storage.getUserByEmail(testEmail);
  if (!testExisting) {
    const testPasswordHash = await bcrypt.hash(testPassword, 12);
    const testOrg = await storage.createOrganization({ name: "Test Organization (DEMO)" });

    await storage.createUser({
      email: testEmail,
      passwordHash: testPasswordHash,
      fullName: "Test User (DEMO)",
      organizationId: testOrg.id,
      role: "super_admin",
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
