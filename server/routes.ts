import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import bcrypt from "bcryptjs";
import { registerSchema, loginSchema, insertClaimSchema } from "@shared/schema";
import { shouldMask, maskClaim, maskClaims } from "./masking";
import { createCheckoutSession, handleWebhookEvent, isStripeConfigured } from "./billing";
import { createHash } from "crypto";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";

declare module "express-session" {
  interface SessionData {
    userId: string;
    orgId: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || !req.session.orgId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "claimsignal-dev-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      },
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({
        email: data.email,
        password: hashedPassword,
        fullName: data.fullName,
      });

      const org = await storage.createOrg({ name: data.orgName, type: "individual" });
      await storage.addOrgMember(org.id, user.id, "owner");
      await storage.createSubscription({
        orgId: org.id,
        tier: "pro",
        status: "active",
        seatLimit: 1,
      });

      req.session.userId = user.id;
      req.session.orgId = org.id;

      res.json({ message: "Registered successfully" });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(data.password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const member = await findUserOrg(user.id);
      if (!member) {
        return res.status(500).json({ message: "No organization found" });
      }

      req.session.userId = user.id;
      req.session.orgId = member.orgId;

      res.json({ message: "Logged in" });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "User not found" });

      const org = await storage.getOrg(req.session.orgId!);
      if (!org) return res.status(401).json({ message: "Org not found" });

      const membership = await storage.getOrgMember(org.id, user.id);
      const subscription = await storage.getSubscriptionByOrg(org.id);
      const founderAgreement = await storage.getFounderAgreement(org.id);

      const { password, ...safeUser } = user;

      res.json({
        user: safeUser,
        org,
        membership: membership ? { role: membership.role } : { role: "member" },
        subscription: subscription || null,
        founderAgreement: founderAgreement || null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const orgId = req.session.orgId!;
      const [totalClaims, openClaims, totalCarriers, totalAdjusters] = await Promise.all([
        storage.getClaimCount(orgId),
        storage.getOpenClaimCount(orgId),
        storage.getCarrierCount(orgId),
        storage.getAdjusterCount(orgId),
      ]);
      res.json({ totalClaims, openClaims, totalCarriers, totalAdjusters });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/claims", requireAuth, async (req, res) => {
    try {
      const orgId = req.session.orgId!;
      let claimsData = await storage.getClaims(orgId);

      const subscription = await storage.getSubscriptionByOrg(orgId);
      const agreement = await storage.getFounderAgreement(orgId);
      if (shouldMask(subscription?.tier || null, !!agreement)) {
        claimsData = maskClaims(claimsData);
      }

      res.json(claimsData);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/claims/:id", requireAuth, async (req, res) => {
    try {
      const orgId = req.session.orgId!;
      let claim = await storage.getClaim(req.params.id, orgId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      const subscription = await storage.getSubscriptionByOrg(orgId);
      const agreement = await storage.getFounderAgreement(orgId);
      if (shouldMask(subscription?.tier || null, !!agreement)) {
        claim = maskClaim(claim);
      }

      res.json(claim);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/claims", requireAuth, async (req, res) => {
    try {
      const orgId = req.session.orgId!;
      const data = {
        ...req.body,
        orgId,
        claimAmount: req.body.claimAmount ? Number(req.body.claimAmount) : undefined,
      };
      const claim = await storage.createClaim(data);
      res.json(claim);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/claims/:id", requireAuth, async (req, res) => {
    try {
      const orgId = req.session.orgId!;
      const claim = await storage.updateClaim(req.params.id, orgId, req.body);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      res.json(claim);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/claims/:id", requireAuth, async (req, res) => {
    try {
      const orgId = req.session.orgId!;
      const deleted = await storage.deleteClaim(req.params.id, orgId);
      if (!deleted) return res.status(404).json({ message: "Claim not found" });
      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/carriers", requireAuth, async (req, res) => {
    try {
      const carriers = await storage.getCarriers(req.session.orgId!);
      res.json(carriers);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/carriers", requireAuth, async (req, res) => {
    try {
      const carrier = await storage.createCarrier({ ...req.body, orgId: req.session.orgId! });
      res.json(carrier);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/adjusters", requireAuth, async (req, res) => {
    try {
      const adjusters = await storage.getAdjusters(req.session.orgId!);
      res.json(adjusters);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/adjusters", requireAuth, async (req, res) => {
    try {
      const adjuster = await storage.createAdjuster({ ...req.body, orgId: req.session.orgId! });
      res.json(adjuster);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/billing/checkout-session", requireAuth, async (req, res) => {
    try {
      const orgId = req.session.orgId!;
      const userId = req.session.userId!;
      const { tier } = req.body;

      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      const result = await createCheckoutSession(orgId, userId, tier, user.email);

      if ("error" in result) {
        if (result.error.includes("not configured") || result.error.includes("development")) {
          return res.json({ message: result.error, tier, fallback: true });
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

  app.get("/api/billing/status", requireAuth, async (req, res) => {
    try {
      const subscription = await storage.getSubscriptionByOrg(req.session.orgId!);
      res.json(subscription || { tier: "pro", status: "active" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/legal/founder", requireAuth, async (req, res) => {
    try {
      const agreement = await storage.getFounderAgreement(req.session.orgId!);
      res.json(agreement || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/legal/founder/sign", requireAuth, async (req, res) => {
    try {
      const orgId = req.session.orgId!;
      const userId = req.session.userId!;

      const subscription = await storage.getSubscriptionByOrg(orgId);
      if (!subscription || subscription.tier !== "founder") {
        return res.status(403).json({ message: "Only founder tier can sign this agreement" });
      }

      const existing = await storage.getFounderAgreement(orgId);
      if (existing) {
        return res.status(400).json({ message: "Agreement already signed" });
      }

      const version = req.body.version || "1.0";
      const ip = req.ip || req.headers["x-forwarded-for"] as string || "unknown";
      const hash = createHash("sha256").update(`${orgId}-${userId}-${version}-${Date.now()}`).digest("hex");

      const agreement = await storage.createFounderAgreement(orgId, userId, ip, version, hash);
      res.json(agreement);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/founder/count", async (_req, res) => {
    try {
      const count = await storage.getFounderCount();
      res.json({ count, max: 3, available: count < 3 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}

async function findUserOrg(userId: string) {
  const { db } = await import("./db");
  const { orgMembers } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const [member] = await db.select().from(orgMembers).where(eq(orgMembers.userId, userId));
  return member;
}
