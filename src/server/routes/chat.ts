import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { openaiOrchestrate } from "../services/ai/openai-orchestrator.js";
import { devOrchestrate } from "../services/ai/dev-orchestrator.js";
import { getOrCreateSession, updateSession, trimHistory } from "../services/session/index.js";
import { logEvent } from "../services/analytics/index.js";
import { aiProvider, env, hasLiveShopifyStore } from "../config.js";
import { understandCatalogQuery } from "../services/retrieval/query-understanding.js";
import { buildFilteredSearchUrl } from "../services/shopify/search-url.js";
import { searchPublicFilteredProducts } from "../services/shopify/public-search.js";
import { rankProductsForRevenue } from "../services/revenue/recommendations.js";
import { buildWhatsAppActions } from "../services/revenue/whatsapp.js";
import { searchProducts as searchCatalogProducts } from "../services/products/db-products.js";
import type { ChatMessage, PageContext, Product, SearchFilters, ShopperPreferences } from "../../shared/types.js";

const PRODUCTS_PER_RESPONSE = 5;

const router = Router();

const chatRequestSchema = z.object({
  sessionId: z.string().min(1).max(128),
  message: z.string().min(1).max(2000),
  cartId: z.string().optional(),
  whatsappNumber: z.string().max(32).optional(),
  pageContext: z.object({
    type: z.enum(["home", "product", "collection", "search", "other"]),
    handle: z.string().max(256).optional(),
    path: z.string().max(1024).optional(),
    query: z.string().max(512).optional(),
  }).optional(),
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

function addRevenueCloser(reply: string, size: string | undefined, productCount: number): string {
  if (!size || productCount === 0 || new RegExp(`want\\s+size\\s+${size}\\b`, "i").test(reply)) {
    return reply;
  }
  return `${reply.replace(/\s+$/, "")} Want size ${size}?`;
}

async function findClosestSizeAlternatives(
  query: string,
  filters: SearchFilters,
  sessionId: string
): Promise<Product[]> {
  if (!filters.size) return [];

  const relaxedFilters: SearchFilters = {
    ...filters,
    size: undefined,
    inStock: true,
  };
  let products = await searchCatalogProducts(query, relaxedFilters, 8, sessionId);

  if (products.length === 0 && hasLiveShopifyStore) {
    products = await searchPublicFilteredProducts(query, relaxedFilters, 8);
  }

  return products;
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const { sessionId, message, cartId: clientCartId, pageContext, whatsappNumber } = parsed.data;

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
        pageContext,
      }
    );

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

    let ranked = rankProductsForRevenue(result.products, understanding.filters);
    let products = ranked.products;
    let productInsights = ranked.insights;
    let responseContent = result.reply;
    let viewAllFilters = understanding.filters;
    let shouldAddCloser = true;

    if (products.length === 0 && understanding.filters.size) {
      const alternatives = await findClosestSizeAlternatives(searchTerm, understanding.filters, sessionId);
      if (alternatives.length > 0) {
        ranked = rankProductsForRevenue(alternatives, understanding.filters);
        products = ranked.products;
        productInsights = ranked.insights;
        responseContent = `I didn't find size ${understanding.filters.size} exactly. These are the closest in-stock options I found.`;
        viewAllFilters = { ...understanding.filters, size: undefined, inStock: true };
        shouldAddCloser = false;
      }
    }

    const actions = buildWhatsAppActions({
      whatsappNumber: env.WHATSAPP_NUMBER || whatsappNumber || "",
      userMessage: message,
      products,
      productInsights,
      filters: understanding.filters,
      pageContext: pageContext as PageContext | undefined,
      cartId: result.cartId ?? cartId,
      intent: understanding.intent,
      hasComparison: Boolean(result.comparison),
    });
    const hasMore = products.length > PRODUCTS_PER_RESPONSE;
    const responseMessage: ChatMessage = {
      id: nanoid(),
      role: "assistant",
      content: addRevenueCloser(
        responseContent,
        shouldAddCloser ? understanding.filters.size : undefined,
        products.length
      ),
      products: products.length > 0 ? products.slice(0, PRODUCTS_PER_RESPONSE) : undefined,
      productInsights: productInsights.length > 0
        ? productInsights.slice(0, PRODUCTS_PER_RESPONSE)
        : undefined,
      comparison: result.comparison ?? undefined,
      cartAction: result.cartAction ?? undefined,
      actions: actions.length > 0 ? actions : undefined,
      viewAllUrl: hasMore
        ? buildFilteredSearchUrl(searchTerm, viewAllFilters, products)
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
          ...products.map((p) => p.handle),
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
