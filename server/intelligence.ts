/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Response, type NextFunction } from "express";
import { type AuthRequest } from "./auth";
import { storage } from "./storage";
import {
  computeAdjusterFrictionScore, computeFullClaimScoring, loadScoringWeights,
  computeAdjusterFrictionFromEvents, computeClaimFrictionFromEvents,
  generatePlaybookFromEvents, createSupplementDepthEvents,
} from "./scoring";
import { computeAggregatedMetrics } from "./aggregation";
import {
  insertSupplementIntelligenceSchema, insertAdjusterIrcBehaviorSchema,
  insertCommunicationSignalSchema, insertPlaybookInsightSchema,
  insertIntelligenceEventSchema,
} from "@shared/schema";
import { z } from "zod";

const router = Router();

function blockCarrierFromLayer1(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.auth!.role === "carrier_analyst") {
    return res.status(403).json({ message: "Carrier analysts can only access aggregated intelligence data" });
  }
  next();
}

router.get("/supplements/:claimId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const data = await storage.getSupplementIntelligence(req.params.claimId as string, req.auth!.organizationId);
    res.json(data);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.post("/supplements", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const validated = insertSupplementIntelligenceSchema.parse({
      ...req.body,
      organizationId: req.auth!.organizationId,
    });
    const created = await storage.createSupplementIntelligence(validated);
    res.json(created);
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }
});

router.get("/irc-behavior/:adjusterId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const data = await storage.getAdjusterIrcBehaviors(req.params.adjusterId as string, req.auth!.organizationId);
    res.json(data);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.post("/irc-behavior", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const validated = insertAdjusterIrcBehaviorSchema.parse({
      ...req.body,
      organizationId: req.auth!.organizationId,
    });
    const created = await storage.upsertAdjusterIrcBehavior(validated);
    res.json(created);
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }
});

router.get("/signals/:claimId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const data = await storage.getCommunicationSignals(req.params.claimId as string, req.auth!.organizationId);
    res.json(data);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/signals/adjuster/:adjusterId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const data = await storage.getCommunicationSignalsByAdjuster(req.params.adjusterId as string, req.auth!.organizationId);
    res.json(data);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.post("/signals", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const validated = insertCommunicationSignalSchema.parse({
      ...req.body,
      organizationId: req.auth!.organizationId,
    });
    const created = await storage.createCommunicationSignal(validated);
    res.json(created);
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }
});

router.get("/playbook/:adjusterId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const data = await storage.getPlaybookInsights(req.params.adjusterId as string, req.auth!.organizationId);
    res.json(data);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.post("/playbook", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const validated = insertPlaybookInsightSchema.parse({
      ...req.body,
      organizationId: req.auth!.organizationId,
    });
    const created = await storage.createPlaybookInsight(validated);
    res.json(created);
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }
});

router.get("/playbook/auto/:adjusterId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const adjusterId = req.params.adjusterId as string;
    const orgId = req.auth!.organizationId;
    const events = await storage.getIntelligenceEventsByAdjuster(adjusterId, orgId);
    const playbook = generatePlaybookFromEvents(events);
    res.json({
      adjusterId,
      eventCount: events.length,
      ...playbook,
    });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/scoring/claim/:claimId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const scores = await computeFullClaimScoring(req.params.claimId as string, req.auth!.organizationId);
    res.json(scores);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/scoring/adjuster/:adjusterId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const adjusterId = req.params.adjusterId as string;
    const orgId = req.auth!.organizationId;
    const adjuster = await storage.getAdjuster(adjusterId, orgId);
    if (!adjuster) return res.status(404).json({ message: "Adjuster not found" });
    const dbWeights = await loadScoringWeights();
    const frictionScore = computeAdjusterFrictionScore(adjuster, dbWeights);

    const events = await storage.getIntelligenceEventsByAdjuster(adjusterId, orgId);
    const frictionScoreEventDriven = computeAdjusterFrictionFromEvents(events);

    res.json({
      adjusterId: adjuster.id,
      adjusterName: adjuster.adjusterName,
      frictionScore,
      frictionScoreEventDriven,
      eventCount: events.length,
    });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/weights", async (req: AuthRequest, res: Response) => {
  try {
    const version = (req.query.version as string) || "v1";
    const weights = await storage.getScoringWeights(version);
    res.json(weights);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.post("/weights", async (req: AuthRequest, res: Response) => {
  try {
    if (req.auth!.role !== "super_admin") {
      return res.status(403).json({ message: "Only platform owner can modify scoring weights" });
    }
    const created = await storage.upsertScoringWeight(req.body);
    res.json(created);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/events/claim/:claimId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const claimId = req.params.claimId as string;
    const orgId = req.auth!.organizationId;
    const category = req.query.category as string | undefined;

    let events;
    if (category) {
      events = await storage.getIntelligenceEventsByCategory(claimId, orgId, category);
    } else {
      events = await storage.getIntelligenceEventsByClaim(claimId, orgId);
    }

    const claimFrictionScore = computeClaimFrictionFromEvents(events);
    res.json({ claimId, claimFrictionScore, eventCount: events.length, events });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/events/adjuster/:adjusterId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const adjusterId = req.params.adjusterId as string;
    const orgId = req.auth!.organizationId;
    const events = await storage.getIntelligenceEventsByAdjuster(adjusterId, orgId);
    const frictionScore = computeAdjusterFrictionFromEvents(events);
    const playbook = generatePlaybookFromEvents(events);
    res.json({
      adjusterId,
      frictionScore,
      eventCount: events.length,
      playbook,
      events,
    });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/events/adjuster-carrier/:adjusterId", async (req: AuthRequest, res: Response) => {
  try {
    const adjusterId = req.params.adjusterId as string;
    const events = await storage.getIntelligenceEventsByAdjusterAllOrgs(adjusterId);
    const frictionScore = computeAdjusterFrictionFromEvents(events);
    const playbook = generatePlaybookFromEvents(events);

    const categoryBreakdown: Record<string, number> = {};
    for (const e of events) {
      categoryBreakdown[e.eventCategory] = (categoryBreakdown[e.eventCategory] || 0) + 1;
    }

    res.json({
      adjusterId,
      frictionScore,
      eventCount: events.length,
      categoryBreakdown,
      playbook,
    });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.post("/events", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const validated = insertIntelligenceEventSchema.parse({
      ...req.body,
      organizationId: req.auth!.organizationId,
    });
    const created = await storage.createIntelligenceEvent(validated);
    res.json(created);
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }
});

const supplementDepthSchema = z.object({
  claimId: z.string(),
  adjusterId: z.string().optional(),
  amountRequested: z.number().positive(),
  amountApproved: z.number().min(0),
  reductionThreshold: z.number().min(0).max(1).optional(),
});

router.post("/events/supplement-depth", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const validated = supplementDepthSchema.parse(req.body);
    const eventData = createSupplementDepthEvents({
      organizationId: req.auth!.organizationId,
      ...validated,
    });

    const created = [];
    for (const event of eventData) {
      const result = await storage.createIntelligenceEvent(event as any);
      created.push(result);
    }

    res.json({ eventsCreated: created.length, events: created });
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }
});

router.get("/aggregated", async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      carrier: req.query.carrier as string | undefined,
      region: req.query.region as string | undefined,
      timePeriod: req.query.timePeriod as string | undefined,
    };
    const data = await storage.getAggregatedMetrics(filters);
    res.json(data);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/aggregated/adjuster", async (req: AuthRequest, res: Response) => {
  try {
    const { name, carrier } = req.query;
    if (!name || !carrier) return res.status(400).json({ message: "name and carrier query params required" });
    const data = await storage.getAggregatedMetricsByAdjuster(name as string, carrier as string);
    res.json(data);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.post("/aggregated/compute", async (req: AuthRequest, res: Response) => {
  try {
    if (req.auth!.role !== "super_admin") {
      return res.status(403).json({ message: "Only platform owner can trigger aggregation" });
    }
    const timePeriod = req.body.timePeriod || new Date().toISOString().slice(0, 7);
    const result = await computeAggregatedMetrics(timePeriod);
    res.json(result);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
