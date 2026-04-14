import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { logEvent } from "../services/analytics/index.js";

const router = Router();

const eventSchema = z.object({
  sessionId: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
  payload: z.record(z.unknown()).optional(),
});

router.post("/event", async (req: Request, res: Response) => {
  try {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid event data" });
      return;
    }

    const { sessionId, name, payload } = parsed.data;
    await logEvent(sessionId, name, payload ?? {});
    res.json({ ok: true });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to log event" });
  }
});

export default router;
