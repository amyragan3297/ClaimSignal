import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import { signupSchema, loginSchema, insertClientSchema, insertSupplementSchema, insertAdjusterSchema } from "@shared/schema";
import { applyPiiMasking, applyPiiMaskingToList, canViewUnmasked } from "./masking";
import { createCheckoutSession, handleWebhookEvent } from "./billing";
import exportsRouter from "./exports";
import evidenceRouter from "./evidence";
import intelligenceRouter from "./intelligence";
import { computeLifecycleVelocity } from "./scoring";
import { seedDefaultWeights } from "./scoring";
import { createHash } from "crypto";
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
      
      let claimsData = role === "super_admin"
        ? await storage.getAllClaimsAcrossTenants()
        : await storage.getClaims(orgId);

      const unmaskedRequested = req.query.unmasked === "true";
      const canSeeUnmasked = canViewUnmasked(role);

      if (canSeeUnmasked && unmaskedRequested) {
        await storage.createAuditLog({
          organizationId: orgId,
          actorUserId: req.auth!.userId,
          actorRole: role,
          actionType: "PII_UNMASK_VIEW",
          entityType: "claims",
          ipAddress: getClientIp(req),
        });
      } else {
        claimsData = applyPiiMaskingToList(claimsData, role);
      }

      res.json(claimsData);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/claims/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const role = req.auth!.role;
      const orgId = req.auth!.organizationId;
      
      let claim = role === "super_admin"
        ? await storage.getClaim(req.params.id as string, orgId)
        : await storage.getClaim(req.params.id as string, orgId);

      if (!claim && role === "super_admin") {
        const allClaims = await storage.getAllClaimsAcrossTenants();
        claim = allClaims.find(c => c.id === req.params.id) || undefined;
      }
      
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const unmaskedRequested = req.query.unmasked === "true";
      const canSeeUnmasked = canViewUnmasked(role);

      if (canSeeUnmasked && unmaskedRequested) {
        await storage.createAuditLog({
          organizationId: claim.organizationId,
          actorUserId: req.auth!.userId,
          actorRole: role,
          actionType: "PII_UNMASK_VIEW",
          entityType: "claim",
          entityId: claim.id,
          ipAddress: getClientIp(req),
        });
      } else {
        claim = applyPiiMasking(claim, role);
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
        ...req.body,
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

      const claim = await storage.updateClaim(req.params.id as string, orgId, req.body);
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

  app.use("/api/evidence", requireAuth, requireActiveSubscription, evidenceRouter);
  app.use("/api/intelligence", requireAuth, requireActiveSubscription, intelligenceRouter);

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

  seedPlatformOwner();
  seedDefaultWeights().catch(console.error);
  seedDemoData().catch(console.error);

  return httpServer;
}

function sanitizeUser(user: any) {
  const { passwordHash, ...safe } = user;
  return safe;
}

async function seedPlatformOwner() {
  const email = process.env.ADMIN_EMAIL || "admin@claimsignal.com";
  const password = process.env.ADMIN_PASSWORD || "ClaimSignal2026!";

  const existing = await storage.getUserByEmail(email);
  if (existing) {
    if (!existing.isPlatformOwner || existing.role !== "super_admin") {
      await storage.updateUser(existing.id, { isPlatformOwner: true, role: "super_admin" });
    }
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const org = await storage.createOrganization({ name: "ClaimSignal Platform" });

    await storage.createUser({
      email,
      passwordHash,
      fullName: "Platform Owner",
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

  const testEmail = "user@claimsignal.test";
  const testPassword = "password123";
  const testExisting = await storage.getUserByEmail(testEmail);
  if (!testExisting) {
    const testPasswordHash = await bcrypt.hash(testPassword, 12);
    const testOrg = await storage.createOrganization({ name: "Test Organization" });

    await storage.createUser({
      email: testEmail,
      passwordHash: testPasswordHash,
      fullName: "Test User",
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

  await storage.createDocument({
    claimId: claim.id,
    organizationId: orgId,
    fileName: "SF_Initial_Determination_2026-04-25.pdf",
    fileType: "pdf",
    fileUrl: "#demo",
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
