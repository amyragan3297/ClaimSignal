import { Router, type Response } from "express";
import { type AuthRequest, requireAuth, requireActiveSubscription, requirePlatformOwner } from "./auth";
import { storage } from "./storage";
import { computeAdjusterFrictionScore, computeFullClaimScoring, loadScoringWeights, seedDefaultWeights } from "./scoring";
import { computeAggregatedMetrics } from "./aggregation";
import { insertSupplementIntelligenceSchema, insertAdjusterIrcBehaviorSchema, insertCommunicationSignalSchema, insertPlaybookInsightSchema } from "@shared/schema";

const router = Router();

function blockCarrierFromLayer1(req: AuthRequest, res: Response, next: Function) {
  if (req.auth!.role === "carrier_analyst") {
    return res.status(403).json({ message: "Carrier analysts can only access aggregated intelligence data" });
  }
  next();
}

router.get("/supplements/:claimId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const data = await storage.getSupplementIntelligence(req.params.claimId, req.auth!.organizationId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
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
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/irc-behavior/:adjusterId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const data = await storage.getAdjusterIrcBehaviors(req.params.adjusterId, req.auth!.organizationId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
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
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/signals/:claimId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const data = await storage.getCommunicationSignals(req.params.claimId, req.auth!.organizationId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/signals/adjuster/:adjusterId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const data = await storage.getCommunicationSignalsByAdjuster(req.params.adjusterId, req.auth!.organizationId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
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
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/playbook/:adjusterId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const data = await storage.getPlaybookInsights(req.params.adjusterId, req.auth!.organizationId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
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
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/scoring/claim/:claimId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const scores = await computeFullClaimScoring(req.params.claimId, req.auth!.organizationId);
    res.json(scores);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/scoring/adjuster/:adjusterId", blockCarrierFromLayer1, async (req: AuthRequest, res: Response) => {
  try {
    const adjuster = await storage.getAdjuster(req.params.adjusterId, req.auth!.organizationId);
    if (!adjuster) return res.status(404).json({ message: "Adjuster not found" });
    const dbWeights = await loadScoringWeights();
    const frictionScore = computeAdjusterFrictionScore(adjuster, dbWeights);
    res.json({ adjusterId: adjuster.id, adjusterName: adjuster.adjusterName, frictionScore });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/weights", async (req: AuthRequest, res: Response) => {
  try {
    const version = (req.query.version as string) || "v1";
    const weights = await storage.getScoringWeights(version);
    res.json(weights);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/weights", async (req: AuthRequest, res: Response) => {
  try {
    if (req.auth!.role !== "super_admin") {
      return res.status(403).json({ message: "Only platform owner can modify scoring weights" });
    }
    const created = await storage.upsertScoringWeight(req.body);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
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
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/aggregated/adjuster", async (req: AuthRequest, res: Response) => {
  try {
    const { name, carrier } = req.query;
    if (!name || !carrier) return res.status(400).json({ message: "name and carrier query params required" });
    const data = await storage.getAggregatedMetricsByAdjuster(name as string, carrier as string);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
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
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
