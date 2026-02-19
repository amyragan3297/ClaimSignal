import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import { storage } from "./storage";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.SESSION_SECRET || "claimsignal-jwt-dev-secret";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_DAYS = 30;

export interface JWTPayload {
  userId: string;
  organizationId: string;
  role: string;
  isPlatformOwner: boolean;
  isImpersonation: boolean;
  impersonatorUserId?: string;
  sessionId: string;
}

export interface AuthRequest extends Request {
  auth?: JWTPayload;
}

export function signAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return randomBytes(64).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAuthSession(
  userId: string,
  organizationId: string,
  opts?: { ipAddress?: string; userAgent?: string; isImpersonation?: boolean; impersonatorUserId?: string }
): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const user = await storage.getUser(userId);
  if (!user) throw new Error("User not found");

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  const session = await storage.createSession({
    userId,
    organizationId,
    refreshTokenHash,
    expiresAt,
    ipAddress: opts?.ipAddress,
    userAgent: opts?.userAgent,
    isImpersonation: opts?.isImpersonation ?? false,
    impersonatorUserId: opts?.impersonatorUserId,
  });

  const payload: JWTPayload = {
    userId,
    organizationId,
    role: user.role,
    isPlatformOwner: !!user.isPlatformOwner,
    isImpersonation: opts?.isImpersonation ?? false,
    impersonatorUserId: opts?.impersonatorUserId,
    sessionId: session.id,
  };

  const accessToken = signAccessToken(payload);
  return { accessToken, refreshToken, sessionId: session.id };
}

export async function refreshAuthSession(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const tokenHash = hashToken(refreshToken);
  const session = await storage.getSessionByTokenHash(tokenHash);
  if (!session) return null;

  await storage.revokeSession(session.id);

  const user = await storage.getUser(session.userId);
  if (!user) return null;

  const newRefreshToken = generateRefreshToken();
  const newHash = hashToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  const newSession = await storage.createSession({
    userId: session.userId,
    organizationId: session.organizationId,
    refreshTokenHash: newHash,
    expiresAt,
    ipAddress: session.ipAddress ?? undefined,
    userAgent: session.userAgent ?? undefined,
    isImpersonation: session.isImpersonation ?? false,
    impersonatorUserId: session.impersonatorUserId ?? undefined,
  });

  const payload: JWTPayload = {
    userId: session.userId,
    organizationId: session.organizationId,
    role: user.role,
    isPlatformOwner: !!user.isPlatformOwner,
    isImpersonation: session.isImpersonation ?? false,
    impersonatorUserId: session.impersonatorUserId ?? undefined,
    sessionId: newSession.id,
  };

  const accessToken = signAccessToken(payload);
  return { accessToken, refreshToken: newRefreshToken };
}

export function setRefreshTokenCookie(res: Response, refreshToken: string) {
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearRefreshTokenCookie(res: Response) {
  res.clearCookie("refresh_token", { path: "/" });
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ message: "Token expired or invalid" });
  }

  req.auth = payload;
  next();
}

export async function requireActiveSubscription(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ message: "Not authenticated" });

  if (req.auth.isPlatformOwner) return next();

  const billing = await storage.getBillingAccountByOrg(req.auth.organizationId);
  if (!billing) {
    return res.status(403).json({ message: "No billing account found", code: "NO_BILLING" });
  }

  const status = billing.subscriptionStatus;
  if (status === "active") return next();
  if (status === "trialing" && billing.trialEndDate && new Date(billing.trialEndDate) > new Date()) {
    return next();
  }

  return res.status(403).json({ message: "Subscription required", code: "SUBSCRIPTION_REQUIRED" });
}

export function requirePlatformOwner(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ message: "Not authenticated" });
  if (!req.auth.isPlatformOwner) return res.status(403).json({ message: "Platform owner access required" });
  next();
}

export function blockDuringImpersonation(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.auth?.isImpersonation) {
    return res.status(403).json({ message: "Not allowed during impersonation" });
  }
  next();
}

export function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}
