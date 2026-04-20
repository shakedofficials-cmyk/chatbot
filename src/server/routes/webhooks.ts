import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { env } from "../config.js";
import { prisma } from "../db/client.js";
import {
  buildEmbeddingText,
  buildSearchText,
  buildSizeText,
  buildVariantOptionText,
  extractColorTokens,
  extractColorValue,
  extractModelKey,
  extractSizeEU,
  extractSizeValue,
  extractStyleTokens,
  inferCategory,
  inferSilhouette,
  normalizeText,
} from "../services/retrieval/normalize.js";
import { upsertProductEmbeddingIfNeeded } from "../services/retrieval/embeddings.js";
import type { Product, ProductVariant, ProductImage } from "../../shared/types.js";

const router = Router();

function verifyWebhookHmac(rawBody: Buffer, hmacHeader: string): boolean {
  if (!env.SHOPIFY_WEBHOOK_SECRET) return true; // allow-all when secret not configured
  const computed = crypto
    .createHmac("sha256", env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

function mapWebhookProduct(raw: any): Product {
  const variants: ProductVariant[] = (raw.variants ?? []).map((v: any): ProductVariant => {
    const selectedOptions: { name: string; value: string }[] = [];
    const options: any[] = raw.options ?? [];
    for (let oi = 0; oi < options.length; oi++) {
      const val = v[`option${oi + 1}`];
      if (val) selectedOptions.push({ name: options[oi].name, value: val });
    }

    const inventoryQty: number = v.inventory_quantity ?? 0;
    const inventoryPolicy: string = v.inventory_policy ?? "deny";
    const inventoryMgmt: string | null = v.inventory_management ?? null;
    const availableForSale =
      inventoryMgmt === null || inventoryPolicy === "continue" || inventoryQty > 0;

    const variantImage = v.image_id && (raw.images ?? []).length > 0
      ? (() => {
          const img = (raw.images as any[]).find((i: any) => i.id === v.image_id);
          return img
            ? { url: img.src, altText: img.alt ?? null, width: img.width ?? undefined, height: img.height ?? undefined }
            : null;
        })()
      : null;

    return {
      id: `gid://shopify/ProductVariant/${v.id}`,
      title: v.title,
      availableForSale,
      quantityAvailable: inventoryMgmt !== null ? inventoryQty : null,
      price: { amount: v.price, currencyCode: "USD" },
      compareAtPrice: v.compare_at_price
        ? { amount: v.compare_at_price, currencyCode: "USD" }
        : null,
      selectedOptions,
      image: variantImage,
    };
  });

  const images: ProductImage[] = (raw.images ?? []).map((img: any) => ({
    url: img.src,
    altText: img.alt ?? null,
    width: img.width ?? undefined,
    height: img.height ?? undefined,
  }));

  const prices = variants.map((v) => parseFloat(v.price.amount)).filter((p) => !isNaN(p));
  const minPrice = prices.length > 0 ? Math.min(...prices).toFixed(2) : "0.00";
  const maxPrice = prices.length > 0 ? Math.max(...prices).toFixed(2) : "0.00";

  return {
    id: `gid://shopify/Product/${raw.id}`,
    handle: raw.handle,
    title: raw.title,
    description: raw.body_html?.replace(/<[^>]*>/g, "") ?? "",
    vendor: raw.vendor ?? "",
    productType: raw.product_type ?? "",
    tags: typeof raw.tags === "string" ? raw.tags.split(", ").filter(Boolean) : raw.tags ?? [],
    images,
    options: (raw.options ?? []).map((o: any) => ({ name: o.name, values: o.values })),
    variants,
    priceRange: {
      minVariantPrice: { amount: minPrice, currencyCode: "USD" },
      maxVariantPrice: { amount: maxPrice, currencyCode: "USD" },
    },
    metafields: {},
  };
}

async function upsertWebhookProduct(product: Product): Promise<void> {
  const searchText = buildSearchText([
    product.title,
    product.vendor,
    product.productType,
    product.tags.join(" "),
    product.description,
  ]);
  const embeddingText = buildEmbeddingText(product);
  const modelKey = extractModelKey(product);
  const silhouette = inferSilhouette(product);
  const category = inferCategory(product);
  const colorText = extractColorTokens(product).join(" ");
  const styleText = extractStyleTokens(product).join(" ");
  const sizeText = buildSizeText(product);
  const availableVariantCount = product.variants.filter((v) => v.availableForSale).length;
  const totalVariantCount = product.variants.length;

  await prisma.$transaction(async (tx) => {
    await tx.syncProductVariant.deleteMany({ where: { productId: product.id } });
    await tx.syncProductImage.deleteMany({ where: { productId: product.id } });

    await tx.syncProduct.upsert({
      where: { id: product.id },
      update: {
        handle: product.handle,
        title: product.title,
        description: product.description,
        vendor: product.vendor,
        productType: product.productType,
        category,
        normalizedTitle: normalizeText(product.title),
        normalizedVendor: normalizeText(product.vendor),
        normalizedType: normalizeText(product.productType),
        modelKey,
        silhouette,
        colorText,
        styleText,
        sizeText,
        tags: JSON.stringify(product.tags),
        options: JSON.stringify(product.options),
        minPrice: parseFloat(product.priceRange.minVariantPrice.amount),
        maxPrice: parseFloat(product.priceRange.maxVariantPrice.amount),
        priceCurrency: product.priceRange.minVariantPrice.currencyCode,
        searchText,
        embeddingText,
        availableVariantCount,
        totalVariantCount,
        syncedAt: new Date(),
      },
      create: {
        id: product.id,
        handle: product.handle,
        title: product.title,
        description: product.description,
        vendor: product.vendor,
        productType: product.productType,
        category,
        normalizedTitle: normalizeText(product.title),
        normalizedVendor: normalizeText(product.vendor),
        normalizedType: normalizeText(product.productType),
        modelKey,
        silhouette,
        colorText,
        styleText,
        sizeText,
        tags: JSON.stringify(product.tags),
        options: JSON.stringify(product.options),
        minPrice: parseFloat(product.priceRange.minVariantPrice.amount),
        maxPrice: parseFloat(product.priceRange.maxVariantPrice.amount),
        priceCurrency: product.priceRange.minVariantPrice.currencyCode,
        searchText,
        embeddingText,
        availableVariantCount,
        totalVariantCount,
      },
    });

    if (product.variants.length > 0) {
      await tx.syncProductVariant.createMany({
        data: product.variants.map((v, i) => ({
          id: v.id,
          productId: product.id,
          title: v.title,
          normalizedTitle: normalizeText(v.title),
          optionText: buildVariantOptionText(v),
          sizeValue: extractSizeValue(v),
          sizeEU: extractSizeEU(v),
          colorValue: extractColorValue(v),
          availableForSale: v.availableForSale,
          quantityAvailable: v.quantityAvailable,
          priceAmount: parseFloat(v.price.amount),
          priceCurrency: v.price.currencyCode,
          compareAtPrice: v.compareAtPrice ? parseFloat(v.compareAtPrice.amount) : null,
          compareAtCurrency: v.compareAtPrice?.currencyCode ?? null,
          selectedOptions: JSON.stringify(v.selectedOptions),
          imageUrl: v.image?.url ?? null,
          imageAltText: v.image?.altText ?? null,
          imageWidth: v.image?.width ?? null,
          imageHeight: v.image?.height ?? null,
          sortOrder: i,
        })),
      });
    }

    if (product.images.length > 0) {
      await tx.syncProductImage.createMany({
        data: product.images.map((img, i) => ({
          productId: product.id,
          url: img.url,
          altText: img.altText,
          width: img.width ?? null,
          height: img.height ?? null,
          sortOrder: i,
        })),
      });
    }
  });

  await upsertProductEmbeddingIfNeeded(product.id, embeddingText);
}

// Shopify sends webhooks with raw JSON body — we need the raw buffer for HMAC
router.post(
  "/products",
  async (req: Request, res: Response) => {
    const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string | undefined;
    const topic = req.headers["x-shopify-topic"] as string | undefined;

    // rawBody is attached by the express.raw() middleware mounted in index.ts
    const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));

    if (hmacHeader && !verifyWebhookHmac(rawBody, hmacHeader)) {
      res.status(401).json({ error: "HMAC verification failed" });
      return;
    }

    try {
      const body = req.body;

      if (topic === "products/delete") {
        const numericId = body.id;
        const gid = `gid://shopify/Product/${numericId}`;
        await prisma.syncProduct.deleteMany({ where: { id: gid } });
        console.log(`[webhook] Deleted product ${gid}`);
        res.status(200).json({ ok: true });
        return;
      }

      // products/create or products/update
      if (topic === "products/create" || topic === "products/update") {
        if (body.status && body.status !== "active") {
          // Archive/draft — remove from catalog if present
          const gid = `gid://shopify/Product/${body.id}`;
          await prisma.syncProduct.deleteMany({ where: { id: gid } });
          console.log(`[webhook] Removed non-active product ${gid} (status: ${body.status})`);
        } else {
          const product = mapWebhookProduct(body);
          await upsertWebhookProduct(product);
          console.log(`[webhook] Upserted product ${product.handle} (${topic})`);
        }
        res.status(200).json({ ok: true });
        return;
      }

      // Unknown topic — acknowledge to prevent retries
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[webhook] Handler error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  }
);

export default router;
