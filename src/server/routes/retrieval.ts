import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config.js";
import { getProductsByIds, hybridSearchProducts } from "../services/products/db-products.js";

const router = Router();

const debugSearchSchema = z.object({
  query: z.string().min(1).max(300),
  filters: z.object({
    brand: z.string().optional(),
    model: z.string().optional(),
    silhouette: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    category: z.string().optional(),
    color: z.string().optional(),
    size: z.string().optional(),
    productType: z.string().optional(),
    inStock: z.boolean().optional(),
  }).optional(),
  limit: z.number().int().min(1).max(12).optional(),
  sessionId: z.string().min(1).max(128).optional(),
});

function getDebugSecret(): string | undefined {
  return env.RETRIEVAL_DEBUG_SECRET ?? env.SYNC_SECRET;
}

function isAuthorized(req: Request): boolean {
  const secret = getDebugSecret();
  if (!secret) {
    return env.NODE_ENV !== "production";
  }

  return req.headers["x-debug-secret"] === secret || req.headers["x-sync-secret"] === secret;
}

router.post("/debug", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = debugSearchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  try {
    const { query, filters, limit, sessionId } = parsed.data;
    const result = await hybridSearchProducts(query, filters ?? {}, {
      first: limit ?? 6,
      sessionId,
      toolName: "retrieval_debug",
    });

    const lexicalProducts = await getProductsByIds(result.lexicalCandidates.map((entry) => entry.productId));
    const semanticProducts = await getProductsByIds(result.semanticCandidates.map((entry) => entry.productId));
    const lexicalProductMap = new Map(lexicalProducts.map((product) => [product.id, product]));
    const semanticProductMap = new Map(semanticProducts.map((product) => [product.id, product]));

    res.json({
      query,
      understanding: result.understanding,
      lexicalCandidates: result.lexicalCandidates.map((entry) => ({
        productId: entry.productId,
        handle: lexicalProductMap.get(entry.productId)?.handle ?? null,
        title: lexicalProductMap.get(entry.productId)?.title ?? null,
        score: entry.score,
      })),
      semanticCandidates: result.semanticCandidates.map((entry) => ({
        productId: entry.productId,
        handle: semanticProductMap.get(entry.productId)?.handle ?? null,
        title: semanticProductMap.get(entry.productId)?.title ?? null,
        score: entry.score,
      })),
      finalResults: result.results.map((entry) => ({
        productId: entry.product.id,
        handle: entry.product.handle,
        title: entry.product.title,
        brand: entry.product.vendor,
        price: entry.product.priceRange.minVariantPrice,
        lexicalScore: entry.lexicalScore,
        semanticScore: entry.semanticScore,
        rerankScore: entry.rerankScore,
        reasoning: entry.reasoning,
        inStockSizes: entry.product.variants
          .filter((variant) => variant.availableForSale)
          .flatMap((variant) =>
            variant.selectedOptions
              .filter((option) => option.name.toLowerCase() === "size")
              .map((option) => option.value)
          )
          .filter((value, index, all) => all.indexOf(value) === index),
      })),
    });
  } catch (error) {
    console.error("[retrieval] debug route failed", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
