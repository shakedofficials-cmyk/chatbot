import { prisma } from "../../db/client.js";
import { env } from "../../config.js";
import type { Product, ProductVariant, ProductImage } from "../../../shared/types.js";
import {
  buildEmbeddingText,
  buildSearchText,
  buildSizeText,
  buildVariantOptionText,
  extractColorTokens,
  extractColorValue,
  extractModelKey,
  extractSizeValue,
  extractStyleTokens,
  inferCategory,
  inferSilhouette,
  normalizeText,
} from "../retrieval/normalize.js";
import { ensureDefaultCatalogSynonyms } from "../retrieval/synonyms.js";
import { upsertProductEmbeddingIfNeeded } from "../retrieval/embeddings.js";
import { ensureManagedStorefrontAccessToken } from "../shopify/admin.js";
import { storefrontQuery } from "../shopify/client.js";
import { LIST_ALL_PRODUCTS } from "../shopify/queries.js";
import { mapProduct } from "../shopify/mappers.js";

interface StorefrontProductPage {
  products?: {
    pageInfo?: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    edges?: Array<{ node: unknown }>;
  };
}

/**
 * Fetch all products from Shopify's public REST API (/products.json).
 * This endpoint requires no authentication token.
 */
async function fetchAllShopifyProducts(): Promise<Product[]> {
  const all: Product[] = [];
  let page = 1;

  while (true) {
    const url = `https://${env.SHOPIFY_STORE_DOMAIN}/products.json?limit=250&page=${page}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Shopify REST API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { products: any[] };
    if (data.products.length === 0) break;

    for (const raw of data.products) {
      all.push(mapRestProduct(raw));
    }

    page++;
  }

  return all;
}

async function fetchAllStorefrontProducts(): Promise<Product[]> {
  const all: Product[] = [];
  let after: string | null = null;

  while (true) {
    const data: StorefrontProductPage = await storefrontQuery<StorefrontProductPage>(LIST_ALL_PRODUCTS, {
      first: 100,
      after,
    });

    const edges = data.products?.edges ?? [];
    for (const edge of edges) {
      if (edge?.node) {
        all.push(mapProduct(edge.node));
      }
    }

    const pageInfo: { hasNextPage: boolean; endCursor: string | null } | undefined =
      data.products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
      break;
    }

    after = pageInfo.endCursor;
  }

  return all;
}

/** Map a Shopify REST API product to our shared Product type. */
function mapRestProduct(raw: any): Product {
  const variants: ProductVariant[] = (raw.variants ?? []).map(
    (v: any, i: number): ProductVariant => {
      // Build selectedOptions from option1/option2/option3
      const selectedOptions: { name: string; value: string }[] = [];
      const options: any[] = raw.options ?? [];
      for (let oi = 0; oi < options.length; oi++) {
        const val = v[`option${oi + 1}`];
        if (val) selectedOptions.push({ name: options[oi].name, value: val });
      }

      // Find the variant's featured image, or the first product image
      const variantImage = v.featured_image
        ? {
            url: v.featured_image.src,
            altText: v.featured_image.alt ?? null,
            width: v.featured_image.width ?? undefined,
            height: v.featured_image.height ?? undefined,
          }
        : null;

      return {
        id: `gid://shopify/ProductVariant/${v.id}`,
        title: v.title,
        availableForSale: v.available ?? false,
        quantityAvailable: null, // REST API doesn't expose inventory quantity
        price: { amount: v.price, currencyCode: "USD" },
        compareAtPrice: v.compare_at_price
          ? { amount: v.compare_at_price, currencyCode: "USD" }
          : null,
        selectedOptions,
        image: variantImage,
      };
    }
  );

  const images: ProductImage[] = (raw.images ?? []).map((img: any) => ({
    url: img.src,
    altText: img.alt ?? null,
    width: img.width ?? undefined,
    height: img.height ?? undefined,
  }));

  // Compute price range from variants
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
    options: (raw.options ?? []).map((o: any) => ({
      name: o.name,
      values: o.values,
    })),
    variants,
    priceRange: {
      minVariantPrice: { amount: minPrice, currencyCode: "USD" },
      maxVariantPrice: { amount: maxPrice, currencyCode: "USD" },
    },
    metafields: {}, // REST API doesn't include metafields without auth
  };
}

/** Upsert a single product (with variants & images) into Postgres. */
async function upsertProduct(product: Product): Promise<void> {
  const searchText = buildSearchText([
    product.title,
    product.vendor,
    product.productType,
    product.tags.join(" "),
    product.description,
    product.metafields.styleTags?.join(" "),
    product.metafields.materialSummary,
    product.metafields.recommendedUse,
    product.metafields.compareHighlights,
  ]);
  const embeddingText = buildEmbeddingText(product);
  const modelKey = extractModelKey(product);
  const silhouette = inferSilhouette(product);
  const category = inferCategory(product);
  const colorText = extractColorTokens(product).join(" ");
  const styleText = extractStyleTokens(product).join(" ");
  const sizeText = buildSizeText(product);
  const availableVariantCount = product.variants.filter((variant) => variant.availableForSale).length;
  const totalVariantCount = product.variants.length;

  await prisma.$transaction(async (tx) => {
    // Delete old relations so we can recreate them fresh
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
        fitProfile: product.metafields.fitProfile ?? null,
        trueToSizeNote: product.metafields.trueToSizeNote ?? null,
        authenticityNote: product.metafields.authenticityNote ?? null,
        styleTags: product.metafields.styleTags
          ? JSON.stringify(product.metafields.styleTags)
          : null,
        materialSummary: product.metafields.materialSummary ?? null,
        recommendedUse: product.metafields.recommendedUse ?? null,
        compareHighlights: product.metafields.compareHighlights ?? null,
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
        fitProfile: product.metafields.fitProfile ?? null,
        trueToSizeNote: product.metafields.trueToSizeNote ?? null,
        authenticityNote: product.metafields.authenticityNote ?? null,
        styleTags: product.metafields.styleTags
          ? JSON.stringify(product.metafields.styleTags)
          : null,
        materialSummary: product.metafields.materialSummary ?? null,
        recommendedUse: product.metafields.recommendedUse ?? null,
        compareHighlights: product.metafields.compareHighlights ?? null,
        searchText,
        embeddingText,
        availableVariantCount,
        totalVariantCount,
      },
    });

    // Recreate variants
    if (product.variants.length > 0) {
      await tx.syncProductVariant.createMany({
        data: product.variants.map((v, i) => ({
          id: v.id,
          productId: product.id,
          title: v.title,
          normalizedTitle: normalizeText(v.title),
          optionText: buildVariantOptionText(v),
          sizeValue: extractSizeValue(v),
          colorValue: extractColorValue(v),
          availableForSale: v.availableForSale,
          quantityAvailable: v.quantityAvailable,
          priceAmount: parseFloat(v.price.amount),
          priceCurrency: v.price.currencyCode,
          compareAtPrice: v.compareAtPrice
            ? parseFloat(v.compareAtPrice.amount)
            : null,
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

    // Recreate images
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

/** Full sync: fetch all Shopify products, upsert into Postgres, remove stale ones. */
export async function syncShopifyProducts(): Promise<{
  total: number;
  upserted: number;
  deleted: number;
}> {
  const log = await prisma.syncLog.create({
    data: { status: "started" },
  });

  try {
    await ensureDefaultCatalogSynonyms();
    let storefrontToken: string | null = null;
    try {
      storefrontToken = await ensureManagedStorefrontAccessToken(env.SHOPIFY_STORE_DOMAIN);
    } catch (error) {
      console.warn("[sync] Unable to provision managed Storefront token. Falling back if possible.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    let products: Product[];

    if (storefrontToken) {
      console.log("[sync] Fetching all products from Shopify Storefront GraphQL...");
      products = await fetchAllStorefrontProducts();
      console.log(`[sync] Fetched ${products.length} products from Shopify Storefront GraphQL`);
    } else {
      console.log("[sync] No managed Storefront token found. Falling back to public Shopify REST catalog...");
      products = await fetchAllShopifyProducts();
      console.log(`[sync] Fetched ${products.length} products from Shopify public catalog`);
    }

    for (const product of products) {
      await upsertProduct(product);
    }

    // Delete products that no longer exist in Shopify
    const shopifyIds = products.map((p) => p.id);
    const { count: deleted } = await prisma.syncProduct.deleteMany({
      where: { id: { notIn: shopifyIds } },
    });

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "completed",
        productsTotal: products.length,
        productsUpserted: products.length,
        productsDeleted: deleted,
        completedAt: new Date(),
      },
    });

    return { total: products.length, upserted: products.length, deleted };
  } catch (err) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    throw err;
  }
}
