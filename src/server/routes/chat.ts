import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { orchestrate } from "../services/ai/orchestrator.js";
import { devOrchestrate } from "../services/ai/dev-orchestrator.js";
import { getOrCreateSession, updateSession, trimHistory } from "../services/session/index.js";
import { logEvent } from "../services/analytics/index.js";
import { isDevMode } from "../config.js";
import type { ChatMessage } from "../../shared/types.js";

const router = Router();

const chatRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).max(2000),
  cartId: z.string().optional(),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const { sessionId, message, cartId: clientCartId } = parsed.data;

    // Get or create session
    const session = await getOrCreateSession(sessionId);
    const cartId = clientCartId ?? session.cartId;

    // Track first message
    if (session.conversationHistory.length === 0) {
      await logEvent(sessionId, "first_message_sent", {});
    }

    // Run AI orchestration (dev mode uses mock data, production uses Claude + live Shopify)
    const runOrchestrate = isDevMode ? devOrchestrate : orchestrate;
    const result = await runOrchestrate(
      message,
      trimHistory(session.conversationHistory),
      sessionId,
      cartId
    );

    // Build response message
    const responseMessage: ChatMessage = {
      id: nanoid(),
      role: "assistant",
      content: result.reply,
      products: result.products.length > 0 ? result.products : undefined,
      comparison: result.comparison ?? undefined,
      cartAction: result.cartAction ?? undefined,
      timestamp: Date.now(),
    };

    // Update session with new conversation history
    const updatedHistory = [
      ...session.conversationHistory,
      { role: "user" as const, content: message },
      { role: "assistant" as const, content: result.reply },
    ];

    await updateSession(sessionId, {
      cartId: result.cartId ?? session.cartId ?? undefined,
      conversationHistory: trimHistory(updatedHistory),
      recentProducts: [
        ...new Set([
          ...session.recentProducts,
          ...result.products.map((p) => p.handle),
        ]),
      ].slice(-20),
    });

    res.json({
      sessionId,
      message: responseMessage,
      cartId: result.cartId,
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({
      error: "Something went wrong. Please try again.",
    });
  }
});

export default router;
