import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { openaiOrchestrate } from "../services/ai/openai-orchestrator.js";
import { devOrchestrate } from "../services/ai/dev-orchestrator.js";
import { getOrCreateSession, updateSession, trimHistory } from "../services/session/index.js";
import { logEvent } from "../services/analytics/index.js";
import { aiProvider } from "../config.js";
import { understandCatalogQuery } from "../services/retrieval/query-understanding.js";
import { buildFilteredSearchUrl } from "../services/shopify/search-url.js";
import type { ChatMessage, ShopperPreferences } from "../../shared/types.js";

const PRODUCTS_PER_RESPONSE = 5;

const router = Router();

const chatRequestSchema = z.object({
  sessionId: z.string().min(1).max(128),
  message: z.string().min(1).max(2000),
  cartId: z.string().optional(),
});

function pickOrchestrator() {
  return aiProvider === "openai" ? openaiOrchestrate : devOrchestrate;
}

function mergePreferences(
  existing: Record<string, unknown>,
  inferred: ShopperPreferences
): Record<string, unknown> {
  return {
    ...existing,
    ...(inferred.favoriteBrand ? { favoriteBrand: inferred.favoriteBrand } : {}),
    ...(inferred.preferredSize ? { preferredSize: inferred.preferredSize } : {}),
    ...(inferred.preferredCategory ? { preferredCategory: inferred.preferredCategory } : {}),
    ...(inferred.preferredColor ? { preferredColor: inferred.preferredColor } : {}),
    ...(inferred.lastIntent ? { lastIntent: inferred.lastIntent } : {}),
  };
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const { sessionId, message, cartId: clientCartId } = parsed.data;

    const session = await getOrCreateSession(sessionId);
    const cartId = clientCartId ?? session.cartId;

    if (session.conversationHistory.length === 0) {
      await logEvent(sessionId, "first_message_sent", {});
    }

    const runOrchestrate = pickOrchestrator();
    const understanding = await understandCatalogQuery(message);
    const result = await runOrchestrate(
      message,
      trimHistory(session.conversationHistory),
      sessionId,
      cartId,
      {
        recentProductHandles: session.recentProducts.slice(-4),
        preferences: session.preferences,
        deterministicFilters: understanding.filters,
      }
    );

    const hasMore = result.products.length > PRODUCTS_PER_RESPONSE;
    // Use the cleanest detected term for the "View More" search URL.
    // If no specific entity was extracted, strip common intent prefixes from the normalized query.
    const rawSearchTerm =
      understanding.entities.silhouette ??
      understanding.entities.model ??
      understanding.entities.brand ??
      understanding.entities.category ??
      understanding.normalizedQuery;
    const searchTerm = rawSearchTerm
      .replace(/^(show\s+me|show|i\s+want|want|find\s+me|find|get\s+me|get|i\s+need|need|look\s+for|looking\s+for|search\s+for|search|give\s+me|give)\s+/i, "")
      .replace(/\b(?:size|eu)\s*\d{1,2}(?:\.\d)?\b/gi, "")
      .replace(/\s+(options|shoes|sneakers|pairs|products|items)$/i, "")
      .trim() || rawSearchTerm;
    const responseMessage: ChatMessage = {
      id: nanoid(),
      role: "assistant",
      content: result.reply,
      products: result.products.length > 0 ? result.products.slice(0, PRODUCTS_PER_RESPONSE) : undefined,
      comparison: result.comparison ?? undefined,
      cartAction: result.cartAction ?? undefined,
      viewAllUrl: hasMore
        ? buildFilteredSearchUrl(searchTerm, understanding.filters, result.products)
        : undefined,
      timestamp: Date.now(),
    };

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
      preferences: mergePreferences(session.preferences, {
        favoriteBrand: understanding.filters.brand,
        preferredSize: understanding.filters.size,
        preferredCategory: understanding.filters.category ?? understanding.filters.productType,
        preferredColor: understanding.filters.color,
        lastIntent: understanding.intent,
      }),
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
