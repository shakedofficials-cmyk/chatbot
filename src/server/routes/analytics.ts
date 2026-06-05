import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { logEvent } from "../services/analytics/index.js";
import { summarizeAnalyticsEvents } from "../services/analytics/summary.js";
import { prisma } from "../db/client.js";
import { env } from "../config.js";
import { mergeShopperProfile } from "../services/shopper/profile.js";

const router = Router();

const eventSchema = z.object({
  sessionId: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
  shopperId: z.string().min(1).max(128).optional(),
  payload: z.record(z.unknown()).optional(),
});

router.post("/event", async (req: Request, res: Response) => {
  try {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid event data" });
      return;
    }

    const { sessionId, name, shopperId, payload } = parsed.data;
    await logEvent(sessionId, name, { ...(payload ?? {}), shopperId });
    await mergeShopperProfile(shopperId, {
      eventName: name,
      payload: payload ?? {},
      cartHasItems: name === "add_to_cart" || Boolean(payload?.cartHasItems),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to log event" });
  }
});

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const providedSecret = req.header("x-analytics-secret") ?? String(req.query.secret ?? "");
    if (!env.ANALYTICS_SECRET || providedSecret !== env.ANALYTICS_SECRET) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const days = Math.max(1, Math.min(Number(req.query.days ?? 30) || 30, 365));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const events = await prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { name: true, payload: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    res.json({
      days,
      since: since.toISOString(),
      ...summarizeAnalyticsEvents(events),
    });
  } catch (err) {
    console.error("Analytics summary error:", err);
    res.status(500).json({ error: "Failed to load analytics summary" });
  }
});

export default router;
