import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import { signupSchema, loginSchema } from "@shared/schema";
import { shouldMask, maskClaims, maskClaim } from "./masking";
import { createCheckoutSession, handleWebhookEvent } from "./billing";
import { createHash } from "crypto";
import {
  type AuthRequest,
  requireAuth,
  requireActiveSubscription,
  requirePlatformOwner,
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
      res.status(401).json({ message: "Refresh failed" });
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
      res.json({ totalClaims, openClaims, totalAdjusters });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/claims", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      let claimsData = await storage.getClaims(orgId);

      const billing = await storage.getBillingAccountByOrg(orgId);
      const agreement = await storage.getFounderAgreement(orgId);
      if (shouldMask(billing?.planType || null, !!agreement)) {
        claimsData = maskClaims(claimsData);
      }

      res.json(claimsData);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/claims/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      let claim = await storage.getClaim(req.params.id, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const billing = await storage.getBillingAccountByOrg(orgId);
      const agreement = await storage.getFounderAgreement(orgId);
      if (shouldMask(billing?.planType || null, !!agreement)) {
        claim = maskClaim(claim);
      }

      res.json(claim);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/claims/:id/versions", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const versions = await storage.getClaimVersions(req.params.id, orgId);
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
      const existing = await storage.getClaim(req.params.id, orgId);
      if (!existing) return res.status(404).json({ message: "Claim not found" });

      if (existing.status === "closed") {
        const lockedFields = ["claimNumber", "carrier", "dateOfLoss", "propertyAddress"];
        const attempted = Object.keys(req.body).filter(k => lockedFields.includes(k));
        if (attempted.length > 0) {
          return res.status(400).json({ message: `Cannot modify locked fields on closed claim: ${attempted.join(", ")}` });
        }
      }

      const claim = await storage.updateClaim(req.params.id, orgId, req.body);
      if (!claim) return res.status(404).json({ message: "Claim not found" });

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

  app.delete("/api/claims/:id", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.organizationId;
      const existing = await storage.getClaim(req.params.id, orgId);
      if (!existing) return res.status(404).json({ message: "Claim not found" });

      const deleted = await storage.softDeleteClaim(req.params.id, orgId);
      if (!deleted) return res.status(404).json({ message: "Claim not found" });

      await storage.createAuditLog({
        organizationId: orgId,
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        actionType: "CLAIM_DELETED",
        entityType: "claim",
        entityId: req.params.id,
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
      const adjustersList = await storage.getAdjusters(req.auth!.organizationId);
      res.json(adjustersList);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/adjusters", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const adjuster = await storage.createAdjuster({
        ...req.body,
        organizationId: req.auth!.organizationId,
      });

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

  app.get("/api/adjusters/:id/metrics", requireAuth, requireActiveSubscription, async (req: AuthRequest, res) => {
    try {
      const metrics = await storage.getAdjusterMetrics(req.params.id, req.auth!.organizationId);
      res.json(metrics || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
      const targetUser = await storage.getUser(req.params.userId);
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
        actorRole: "platform_owner",
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
        actorRole: "platform_owner",
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
    return;
  }

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
