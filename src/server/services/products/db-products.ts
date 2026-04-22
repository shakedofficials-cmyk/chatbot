import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { env } from "../../config.js";
import type {
  HybridSearchResult,
  Product,
  RetrievedProduct,
  SearchFilters,
} from "../../../shared/types.js";
import { embedText, cosineSimilarity } from "../retrieval/embeddings.js";
import { logRetrievalEvent } from "../retrieval/logging.js";
import { normalizeText } from "../retrieval/normalize.js";
import { understandCatalogQuery } from "../retrieval/query-understanding.js";
import { expandQueryWithSynonyms } from "../retrieval/synonyms.js";
import {
  findBestVariantMatch,
  findSizeOptionValue,
  normalizeVariantSize,
  resolveUserSize,
  sizeToEU,
} from "../size-resolution.js";

const productInclude = {
  variants: { orderBy: { sortOrder: "asc" as const } },
  images: { orderBy: { sortOrder: "asc" as const } },
};

type SyncProductRow = Prisma.SyncProductGetPayload<{
  include: typeof productInclude;
}>;

interface SearchOptions {
  first?: number;
  sessionId?: string;
  toolName?: string;
}

function dbRowToProduct(row: SyncProductRow): Product {
  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    description: row.description,
    vendor: row.vendor,
    productType: row.productType,
    tags: JSON.parse(row.tags),
    images: row.images.map((img) => ({
      url: img.url,
      altText: img.altText,
      width: img.width ?? undefined,
      height: img.height ?? undefined,
    })),
    options: JSON.parse(row.options),
    variants: row.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      availableForSale: variant.availableForSale,
      quantityAvailable: variant.quantityAvailable,
      price: {
        amount: variant.priceAmount.toString(),
        currencyCode: variant.priceCurrency,
      },
      compareAtPrice: variant.compareAtPrice
        ? {
            amount: variant.compareAtPrice.toString(),
            currencyCode: variant.compareAtCurrency ?? variant.priceCurrency,
          }
        : null,
      selectedOptions: JSON.parse(variant.selectedOptions),
      image: variant.imageUrl
        ? {
            url: variant.imageUrl,
            altText: variant.imageAltText,
            width: variant.imageWidth ?? undefined,
            height: variant.imageHeight ?? undefined,
          }
        : null,
    })),
    priceRange: {
      minVariantPrice: {
        amount: row.minPrice.toString(),
        currencyCode: row.priceCurrency,
      },
      maxVariantPrice: {
        amount: row.maxPrice.toString(),
        currencyCode: row.priceCurrency,
      },
    },
    metafields: {
      fitProfile: row.fitProfile ?? undefined,
      trueToSizeNote: row.trueToSizeNote ?? undefined,
      authenticityNote: row.authenticityNote ?? undefined,
      styleTags: row.styleTags ? JSON.parse(row.styleTags) : undefined,
      materialSummary: row.materialSummary ?? undefined,
      recommendedUse: row.recommendedUse ?? undefined,
      compareHighlights: row.compareHighlights ?? undefined,
    },
  };
}

function buildWhere(filters: SearchFilters): Prisma.SyncProductWhereInput {
  const where: Prisma.SyncProductWhereInput = {};
  const and: Prisma.SyncProductWhereInput[] = [];

  if (filters.brand) {
    and.push({ normalizedVendor: normalizeText(filters.brand) });
  }
  if (filters.productType) {
    and.push({ normalizedType: { contains: normalizeText(filters.productType) } });
  }
  if (filters.category) {
    and.push({
      OR: [
        { category: { contains: normalizeText(filters.category), mode: "insensitive" } },
        { normalizedType: { contains: normalizeText(filters.category) } },
      ],
    });
  }
  if (filters.color) {
    and.push({
      OR: [
        { colorText: { contains: normalizeText(filters.color) } },
        { variants: { some: { colorValue: { equals: filters.color, mode: "insensitive" } } } },
      ],
    });
  }
  if (filters.model) {
    const model = normalizeText(filters.model);
    and.push({
      OR: [
        { normalizedTitle: { contains: model } },
        { modelKey: { contains: model } },
        { silhouette: { contains: model } },
        { searchText: { contains: model } },
      ],
    });
  }
  if (filters.silhouette) {
    and.push({
      OR: [
        { silhouette: { contains: normalizeText(filters.silhouette) } },
        { modelKey: { contains: normalizeText(filters.silhouette) } },
      ],
    });
  }
  if (filters.minPrice != null) {
    and.push({ minPrice: { gte: filters.minPrice } });
  }
  if (filters.maxPrice != null) {
    and.push({ minPrice: { lte: filters.maxPrice } });
  }
  if (filters.inStock) {
    and.push({ variants: { some: { availableForSale: true } } });
  }
  if (filters.size) {
    try {
      const resolved = resolveUserSize(filters.size);
      const eu = sizeToEU(resolved.value, resolved.system);
      // Cast needed until `prisma generate` picks up the new sizeEU column
      const sizeEUFilter = { sizeEU: { equals: new Prisma.Decimal(eu) } } as Prisma.SyncProductVariantWhereInput;
      and.push({
        variants: {
          some: {
            ...sizeEUFilter,
            ...(filters.inStock ? { availableForSale: true } : {}),
          },
        },
      });
    } catch {
      // Unparseable size — fall back to raw text match
      and.push({
        variants: {
          some: {
            sizeValue: { equals: filters.size, mode: "insensitive" },
            ...(filters.inStock ? { availableForSale: true } : {}),
          },
        },
      });
    }
  }
  if (filters.tags) {
    // tags is stored as JSON string e.g. '["men","lifestyle","nike"]'
    // Searching for `"tag"` ensures we match whole tag values, not substrings
    and.push({ tags: { contains: `"${filters.tags.toLowerCase()}"` } });
  }

  if (and.length > 0) {
    where.AND = and;
  }

  return where;
}

async function fetchProductsByIds(ids: string[]): Promise<Map<string, Product>> {
  if (ids.length === 0) return new Map();

  const rows = await prisma.syncProduct.findMany({
    where: { id: { in: ids } },
    include: productInclude,
  });

  return new Map(rows.map((row) => [row.id, dbRowToProduct(row)]));
}

async function lexicalSearch(
  query: string,
  filters: SearchFilters,
  limit: number
): Promise<Array<{ productId: string; score: number }>> {
  const normalizedQuery = normalizeText(query);
  const expanded = await expandQueryWithSynonyms(normalizedQuery);
  const lexicalQuery = expanded.join(" ").trim() || normalizedQuery;
  const likeQuery = `%${normalizedQuery}%`;
  const clauses: Prisma.Sql[] = [];

  if (filters.brand) {
    clauses.push(Prisma.sql`p."normalizedVendor" = ${normalizeText(filters.brand)}`);
  }
  if (filters.productType) {
    clauses.push(Prisma.sql`p."normalizedType" LIKE ${`%${normalizeText(filters.productType)}%`}`);
  }
  if (filters.category) {
    clauses.push(
      Prisma.sql`(
        COALESCE(p."category", '') ILIKE ${`%${normalizeText(filters.category)}%`}
        OR p."normalizedType" LIKE ${`%${normalizeText(filters.category)}%`}
      )`
    );
  }
  if (filters.color) {
    clauses.push(
      Prisma.sql`(
        p."colorText" LIKE ${`%${normalizeText(filters.color)}%`}
        OR EXISTS (
          SELECT 1
          FROM "SyncProductVariant" v
          WHERE v."productId" = p."id"
            AND COALESCE(v."colorValue", '') ILIKE ${`%${filters.color}%`}
        )
      )`
    );
  }
  if (filters.model) {
    const model = normalizeText(filters.model);
    clauses.push(
      Prisma.sql`(
        p."normalizedTitle" LIKE ${`%${model}%`}
        OR COALESCE(p."modelKey", '') LIKE ${`%${model}%`}
        OR COALESCE(p."silhouette", '') LIKE ${`%${model}%`}
      )`
    );
  }
  if (filters.silhouette) {
    const silhouette = normalizeText(filters.silhouette);
    clauses.push(
      Prisma.sql`(
        COALESCE(p."silhouette", '') LIKE ${`%${silhouette}%`}
        OR COALESCE(p."modelKey", '') LIKE ${`%${silhouette}%`}
      )`
    );
  }
  if (filters.minPrice != null) {
    clauses.push(Prisma.sql`p."minPrice" >= ${filters.minPrice}`);
  }
  if (filters.maxPrice != null) {
    clauses.push(Prisma.sql`p."minPrice" <= ${filters.maxPrice}`);
  }
  if (filters.inStock) {
    clauses.push(
      Prisma.sql`EXISTS (
        SELECT 1
        FROM "SyncProductVariant" v
        WHERE v."productId" = p."id" AND v."availableForSale" = true
      )`
    );
  }
  if (filters.size) {
    try {
      const resolved = resolveUserSize(filters.size);
      const eu = sizeToEU(resolved.value, resolved.system);
      clauses.push(
        Prisma.sql`EXISTS (
          SELECT 1
          FROM "SyncProductVariant" v
          WHERE v."productId" = p."id"
            AND v."sizeEU" = ${eu}::decimal
            ${filters.inStock ? Prisma.sql`AND v."availableForSale" = true` : Prisma.empty}
        )`
      );
    } catch {
      clauses.push(
        Prisma.sql`EXISTS (
          SELECT 1
          FROM "SyncProductVariant" v
          WHERE v."productId" = p."id"
            AND COALESCE(v."sizeValue", '') ILIKE ${filters.size}
            ${filters.inStock ? Prisma.sql`AND v."availableForSale" = true` : Prisma.empty}
        )`
      );
    }
  }
  if (filters.tags) {
    clauses.push(Prisma.sql`p."tags" ILIKE ${`%"${filters.tags.toLowerCase()}"%`}`);
  }

  const hasWhereClauses = clauses.length > 0;
  const whereClause = hasWhereClauses
    ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ productId: string; score: number }>>(Prisma.sql`
    SELECT
      p."id" AS "productId",
      (
        COALESCE(ts_rank_cd(
          to_tsvector(
            'simple',
            concat_ws(
              ' ',
              COALESCE(p."searchText", ''),
              COALESCE(p."styleText", ''),
              COALESCE(p."colorText", ''),
              COALESCE(p."sizeText", ''),
              COALESCE(p."modelKey", ''),
              COALESCE(p."silhouette", '')
            )
          ),
          websearch_to_tsquery('simple', ${lexicalQuery})
        ), 0.0)
        + CASE WHEN p."normalizedTitle" = ${normalizedQuery} THEN 2.0 ELSE 0.0 END
        + CASE WHEN p."normalizedTitle" ILIKE ${likeQuery} THEN 1.0 ELSE 0.0 END
        + CASE WHEN COALESCE(p."searchText", '') ILIKE ${likeQuery} THEN 0.8 ELSE 0.0 END
        + CASE WHEN COALESCE(p."modelKey", '') ILIKE ${likeQuery} THEN 0.75 ELSE 0.0 END
        + CASE WHEN COALESCE(p."silhouette", '') ILIKE ${likeQuery} THEN 0.5 ELSE 0.0 END
      ) AS score
    FROM "SyncProduct" p
    ${whereClause}
    ${hasWhereClauses ? Prisma.sql`AND` : Prisma.sql`WHERE`}
    (
      to_tsvector(
        'simple',
        concat_ws(
          ' ',
          COALESCE(p."searchText", ''),
          COALESCE(p."styleText", ''),
          COALESCE(p."colorText", ''),
          COALESCE(p."sizeText", ''),
          COALESCE(p."modelKey", ''),
          COALESCE(p."silhouette", '')
        )
      ) @@ websearch_to_tsquery('simple', ${lexicalQuery})
      OR p."normalizedTitle" ILIKE ${likeQuery}
      OR COALESCE(p."searchText", '') ILIKE ${likeQuery}
      OR COALESCE(p."modelKey", '') ILIKE ${likeQuery}
      OR COALESCE(p."silhouette", '') ILIKE ${likeQuery}
    )
    ORDER BY score DESC, p."availableVariantCount" DESC, p."updatedAt" DESC
    LIMIT ${limit}
  `);

  // WHERE clause already guarantees every returned row has at least one match;
  // no secondary score filter needed — it was silently dropping LIKE-only matches.
  return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

async function semanticSearch(
  query: string,
  filters: SearchFilters,
  limit: number
): Promise<Array<{ productId: string; score: number }>> {
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return [];

  const rows = await prisma.syncProduct.findMany({
    where: buildWhere(filters),
    select: {
      id: true,
      embeddings: {
        where: {
          model: env.OPENAI_EMBEDDING_MODEL,
        },
        take: 1,
      },
    },
    take: 250,
  });

  return rows
    .map((row) => {
      const vector = row.embeddings[0]?.vector;
      if (!vector) return null;

      const productEmbedding = JSON.parse(vector) as number[];
      return {
        productId: row.id,
        score: cosineSimilarity(queryEmbedding, productEmbedding),
      };
    })
    .filter((entry): entry is { productId: string; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function rerankProduct(params: {
  product: Product;
  normalizedQuery: string;
  filters: SearchFilters;
  lexicalScore: number;
  maxLexicalScore: number;
  semanticScore: number;
  maxSemanticScore: number;
}): RetrievedProduct {
  const reasoning: string[] = [];
  const normalizedTitle = normalizeText(params.product.title);
  const normalizedBrand = normalizeText(params.product.vendor);
  const normalizedModel = normalizeText(params.filters.model ?? params.filters.silhouette ?? "");
  const lexicalNormalized = params.maxLexicalScore > 0 ? params.lexicalScore / params.maxLexicalScore : 0;
  const semanticNormalized = params.maxSemanticScore > 0 ? params.semanticScore / params.maxSemanticScore : 0;

  let score = lexicalNormalized * 0.6 + semanticNormalized * 0.3;

  if (normalizedTitle === params.normalizedQuery || normalizedTitle.includes(params.normalizedQuery)) {
    score += 0.3;
    reasoning.push("exact title match");
  }

  if (params.filters.brand && normalizedBrand === normalizeText(params.filters.brand)) {
    score += 0.2;
    reasoning.push("brand match");
  }

  if (
    normalizedModel &&
    (normalizedTitle.includes(normalizedModel) || normalizeText(params.product.handle).includes(normalizedModel))
  ) {
    score += 0.2;
    reasoning.push("model match");
  }

  if (params.filters.color && normalizeText(params.product.title).includes(normalizeText(params.filters.color))) {
    score += 0.08;
    reasoning.push("color match");
  }

  if (params.filters.maxPrice != null && Number(params.product.priceRange.minVariantPrice.amount) <= params.filters.maxPrice) {
    score += 0.06;
    reasoning.push("within budget");
  }

  const inStockVariants = params.product.variants.filter((variant) => variant.availableForSale);
  if (params.filters.inStock && inStockVariants.length > 0) {
    score += 0.1;
    reasoning.push("in stock");
  }

  if (params.filters.size) {
    try {
      const resolved = resolveUserSize(params.filters.size);
      const targetEU = sizeToEU(resolved.value, resolved.system);
      const matchingSize = inStockVariants.find((variant) => {
        const raw = findSizeOptionValue(variant.selectedOptions);
        if (!raw) return false;
        const norm = normalizeVariantSize(raw);
        return norm !== null && norm.value === targetEU;
      });
      if (matchingSize) {
        score += 0.25;
        reasoning.push(`size ${params.filters.size} available`);
      }
    } catch {
      // Unparseable size — skip the bonus
    }
  }

  if (reasoning.length === 0) {
    reasoning.push("catalog relevance");
  }

  return {
    product: params.product,
    lexicalScore: params.lexicalScore,
    semanticScore: params.semanticScore,
    rerankScore: score,
    reasoning,
  };
}

export async function hybridSearchProducts(
  query: string,
  filters: SearchFilters = {},
  options: SearchOptions = {}
): Promise<HybridSearchResult> {
  const understanding = await understandCatalogQuery(query);
  const mergedFilters: SearchFilters = {
    ...understanding.filters,
    ...filters,
  };

  let lexicalCandidates = await lexicalSearch(query, mergedFilters, 24);
  const semanticCandidates = await semanticSearch(query, mergedFilters, 24);

  // Hard fallback: if both lexical and semantic returned nothing, run a plain
  // normalizedTitle LIKE search without any filter constraints — ensures queries
  // like "Air Force 1" never silently return zero when the products exist in the DB.
  if (lexicalCandidates.length === 0 && semanticCandidates.length === 0) {
    const normalizedQ = normalizeText(query);
    const fallback = await prisma.syncProduct.findMany({
      where: {
        OR: [
          { normalizedTitle: { contains: normalizedQ } },
          { searchText: { contains: normalizedQ } },
          { silhouette: { contains: normalizedQ } },
          { modelKey: { contains: normalizedQ } },
        ],
      },
      select: { id: true },
      take: 24,
    });
    lexicalCandidates = fallback.map((row) => ({ productId: row.id, score: 0.5 }));
    console.warn("[search] both lexical+semantic returned 0 — title-fallback used", { query, normalizedQ, fallbackCount: fallback.length });
  }

  const candidateIds = Array.from(
    new Set([...lexicalCandidates.map((entry) => entry.productId), ...semanticCandidates.map((entry) => entry.productId)])
  );

  const productMap = await fetchProductsByIds(candidateIds);
  const lexicalScoreMap = new Map(lexicalCandidates.map((entry) => [entry.productId, entry.score]));
  const semanticScoreMap = new Map(semanticCandidates.map((entry) => [entry.productId, entry.score]));
  const maxLexicalScore = Math.max(...lexicalCandidates.map((entry) => entry.score), 0);
  const maxSemanticScore = Math.max(...semanticCandidates.map((entry) => entry.score), 0);

  const results = candidateIds
    .map((productId) => {
      const product = productMap.get(productId);
      if (!product) return null;

      return rerankProduct({
        product,
        normalizedQuery: understanding.normalizedQuery,
        filters: mergedFilters,
        lexicalScore: lexicalScoreMap.get(productId) ?? 0,
        maxLexicalScore,
        semanticScore: semanticScoreMap.get(productId) ?? 0,
        maxSemanticScore,
      });
    })
    .filter((entry): entry is RetrievedProduct => Boolean(entry))
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, options.first ?? 8);

  const result: HybridSearchResult = {
    understanding: {
      ...understanding,
      filters: mergedFilters,
    },
    lexicalCandidates,
    semanticCandidates,
    results,
  };

  if (options.toolName) {
    await logRetrievalEvent({
      sessionId: options.sessionId,
      query,
      result,
      toolName: options.toolName,
    });
  }

  return result;
}

export async function searchProducts(
  query: string,
  filters: SearchFilters = {},
  first = 10,
  sessionId?: string
): Promise<Product[]> {
  const result = await hybridSearchProducts(query, filters, {
    first,
    sessionId,
    toolName: "search_products",
  });

  return result.results.map((entry) => entry.product);
}

export async function getProductByHandle(handle: string): Promise<Product | null> {
  const row = await prisma.syncProduct.findUnique({
    where: { handle },
    include: productInclude,
  });

  return row ? dbRowToProduct(row) : null;
}

export async function getProductById(id: string): Promise<Product | null> {
  const row = await prisma.syncProduct.findUnique({
    where: { id },
    include: productInclude,
  });

  return row ? dbRowToProduct(row) : null;
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const rows = await prisma.syncProduct.findMany({
    where: { id: { in: ids } },
    include: productInclude,
  });

  return rows.map(dbRowToProduct);
}

export async function getProductsByHandles(handles: string[]): Promise<Product[]> {
  if (handles.length === 0) return [];

  const rows = await prisma.syncProduct.findMany({
    where: { handle: { in: handles } },
    include: productInclude,
  });

  const rowsByHandle = new Map(rows.map((row) => [row.handle, row]));
  return handles
    .map((handle) => rowsByHandle.get(handle))
    .filter((row): row is SyncProductRow => Boolean(row))
    .map(dbRowToProduct);
}

export async function getVariantByOptions(
  handleOrId: string,
  selectedOptions: Record<string, string>
): Promise<{ product: Product | null; variant: Product["variants"][0] | null }> {
  const product = handleOrId.startsWith("gid://")
    ? await getProductById(handleOrId)
    : await getProductByHandle(handleOrId);

  if (!product) return { product: null, variant: null };

  // Separate size keys from non-size keys so size is matched via EU normalisation
  const sizeEntry = Object.entries(selectedOptions).find(([k]) =>
    k.toLowerCase().includes("size")
  );
  const nonSizeEntries = Object.entries(selectedOptions).filter(
    ([k]) => !k.toLowerCase().includes("size")
  );

  if (sizeEntry) {
    const [, sizeValue] = sizeEntry;
    const matchResult = findBestVariantMatch(product.variants, sizeValue);

    // Prefer an available variant — if two variants share the same EU size
    // (e.g. different gender/width/colorway), always surface the one in stock first.
    let candidate = matchResult.exactMatchAvailable ?? matchResult.exactMatch;

    // If there are additional option axes (e.g. Color), verify them too
    if (candidate && nonSizeEntries.length > 0) {
      const allMatch = nonSizeEntries.every(([name, val]) =>
        candidate!.selectedOptions.some(
          (o) =>
            o.name.toLowerCase() === name.toLowerCase() &&
            o.value.toLowerCase() === val.toLowerCase()
        )
      );
      if (!allMatch) candidate = null;
    }

    return { product, variant: candidate };
  }

  // No size option — exact match on every option
  const variant =
    product.variants.find((entry) =>
      Object.entries(selectedOptions).every(([name, value]) =>
        entry.selectedOptions.some(
          (option) =>
            option.name.toLowerCase() === name.toLowerCase() &&
            option.value.toLowerCase() === value.toLowerCase()
        )
      )
    ) ?? null;

  return { product, variant };
}

export async function getVariantAvailability(
  variantId: string,
  handleOrId: string
): Promise<{
  available: boolean;
  quantityAvailable: number | null;
  variant: Product["variants"][0] | null;
}> {
  const product = handleOrId.startsWith("gid://")
    ? await getProductById(handleOrId)
    : await getProductByHandle(handleOrId);

  if (!product) {
    return { available: false, quantityAvailable: null, variant: null };
  }

  const variant = product.variants.find((entry) => entry.id === variantId) ?? null;

  return {
    available: variant?.availableForSale ?? false,
    quantityAvailable: variant?.quantityAvailable ?? null,
    variant,
  };
}

export async function getSizeAvailability(
  input: {
    query?: string;
    handleOrId?: string;
    size: string;
  },
  sessionId?: string
): Promise<{
  product: Product | null;
  matchingVariant: Product["variants"][0] | null;
  alternatives: Product[];
}> {
  let product: Product | null = null;

  if (input.handleOrId) {
    product = input.handleOrId.startsWith("gid://")
      ? await getProductById(input.handleOrId)
      : await getProductByHandle(input.handleOrId);
  } else if (input.query) {
    const result = await hybridSearchProducts(
      input.query,
      { size: input.size, inStock: true },
      { first: 4, sessionId, toolName: "get_size_availability" }
    );
    product = result.results[0]?.product ?? null;
  }

  if (!product) {
    const alternatives = input.query
      ? await searchProducts(input.query, { inStock: true }, 4, sessionId)
      : [];
    return { product: null, matchingVariant: null, alternatives };
  }

  const sizeMatch = findBestVariantMatch(product.variants, input.size);
  const matchingVariant = sizeMatch.exactMatchAvailable;

  const alternatives = matchingVariant || !input.query
    ? []
    : await searchProducts(input.query, { inStock: true }, 4, sessionId);

  return {
    product,
    matchingVariant,
    alternatives: alternatives.filter((entry) => entry.id !== product?.id),
  };
}

export async function findSimilarProducts(
  handleOrId: string,
  query?: string,
  sessionId?: string
): Promise<Product[]> {
  if (!handleOrId && query) {
    const result = await hybridSearchProducts(query, { inStock: true }, {
      first: 4,
      sessionId,
      toolName: "find_similar_products",
    });
    return result.results.map((entry) => entry.product);
  }

  const product = handleOrId.startsWith("gid://")
    ? await getProductById(handleOrId)
    : await getProductByHandle(handleOrId);

  if (!product) return [];

  const searchQuery =
    query ??
    [
      product.vendor,
      product.title,
      product.productType,
      product.metafields.styleTags?.join(" "),
      product.metafields.recommendedUse,
    ]
      .filter(Boolean)
      .join(" ");

  const result = await hybridSearchProducts(searchQuery, {
    brand: product.vendor,
    category: product.productType,
    inStock: true,
  }, {
    first: 6,
    sessionId,
    toolName: "find_similar_products",
  });

  return result.results
    .map((entry) => entry.product)
    .filter((entry) => entry.id !== product.id)
    .slice(0, 4);
}
