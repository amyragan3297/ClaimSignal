import type { Express } from "express";
import { getTermIndexHtml, getTermHtml } from "./glossary";
import { getCarrierIndexHtml, getCarrierHtml } from "./carriers";
import { getClaimPatternsIndexHtml, getCarrierClaimsIndexHtml, getCarrierLossTypeHtml } from "./claim-patterns";
import { generateSitemap } from "./sitemap";

const HTML = "text/html; charset=utf-8";
const XML = "application/xml; charset=utf-8";
const CACHE_STATIC = "public, max-age=86400, stale-while-revalidate=604800";

export function registerSeoRoutes(app: Express): void {
  // ── Sitemap ────────────────────────────────────────────────────────────────
  app.get("/sitemap.xml", (_req, res) => {
    res.setHeader("Content-Type", XML);
    res.setHeader("Cache-Control", CACHE_STATIC);
    res.send(generateSitemap());
  });

  app.get("/robots.txt", (_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Cache-Control", CACHE_STATIC);
    res.send(`User-agent: *\nAllow: /\nSitemap: https://claimsignal.com/sitemap.xml\n`);
  });

  // ── Glossary ───────────────────────────────────────────────────────────────
  app.get("/learn", (_req, res) => {
    res.setHeader("Content-Type", HTML);
    res.setHeader("Cache-Control", CACHE_STATIC);
    res.send(getTermIndexHtml());
  });

  app.get("/learn/:slug", (req, res) => {
    const html = getTermHtml(req.params.slug as string);
    if (!html) { res.status(404).end(); return; }
    res.setHeader("Content-Type", HTML);
    res.setHeader("Cache-Control", CACHE_STATIC);
    res.send(html);
  });

  // ── Carrier Profiles ───────────────────────────────────────────────────────
  app.get("/carriers", (_req, res) => {
    res.setHeader("Content-Type", HTML);
    res.setHeader("Cache-Control", CACHE_STATIC);
    res.send(getCarrierIndexHtml());
  });

  app.get("/carriers/:slug", (req, res) => {
    const html = getCarrierHtml(req.params.slug as string);
    if (!html) { res.status(404).end(); return; }
    res.setHeader("Content-Type", HTML);
    res.setHeader("Cache-Control", CACHE_STATIC);
    res.send(html);
  });

  // ── Claim Patterns ─────────────────────────────────────────────────────────
  app.get("/claims", (_req, res) => {
    res.setHeader("Content-Type", HTML);
    res.setHeader("Cache-Control", CACHE_STATIC);
    res.send(getClaimPatternsIndexHtml());
  });

  app.get("/claims/:carrier", (req, res) => {
    const html = getCarrierClaimsIndexHtml(req.params.carrier as string);
    if (!html) { res.status(404).end(); return; }
    res.setHeader("Content-Type", HTML);
    res.setHeader("Cache-Control", CACHE_STATIC);
    res.send(html);
  });

  app.get("/claims/:carrier/:lossType", (req, res) => {
    const html = getCarrierLossTypeHtml(req.params.carrier as string, req.params.lossType as string);
    if (!html) { res.status(404).end(); return; }
    res.setHeader("Content-Type", HTML);
    res.setHeader("Cache-Control", CACHE_STATIC);
    res.send(html);
  });
}
