import { prisma } from "../../db/client.js";
import type { Product, SearchFilters } from "../../../shared/types.js";
import type { Prisma } from "@prisma/client";

// Prisma includes for fetching a product with all relations
const productInclude = {
  variants: { orderBy: { sortOrder: "asc" as const } },
  images: { orderBy: { sortOrder: "asc" as const } },
};

type SyncProductRow = Prisma.SyncProductGetPayload<{
  include: typeof productInclude;
}>;

/** Map a Prisma SyncProduct row (with variants + images) to the shared Product type. */
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
    variants: row.variants.map((v) => ({
      id: v.id,
      title: v.title,
      availableForSale: v.availableForSale,
      quantityAvailable: v.quantityAvailable,
      price: {
        amount: v.priceAmount.toString(),
        currencyCode: v.priceCurrency,
      },
      compareAtPrice: v.compareAtPrice
        ? {
            amount: v.compareAtPrice.toString(),
            currencyCode: v.compareAtCurrency ?? "USD",
          }
        : null,
      selectedOptions: JSON.parse(v.selectedOptions),
      image: v.imageUrl
        ? {
            url: v.imageUrl,
            altText: v.imageAltText,
            width: v.imageWidth ?? undefined,
            height: v.imageHeight ?? undefined,
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

/** Search products using ILIKE on the pre-computed searchText column + filter columns. */
export async function searchProducts(
  query: string,
  filters: SearchFilters = {},
  first = 10
): Promise<Product[]> {
  const where: Prisma.SyncProductWhereInput = {};
  const andConditions: Prisma.SyncProductWhereInput[] = [];

  // Full-text search: each term must appear in searchText
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  for (const term of terms) {
    andConditions.push({
      searchText: { contains: term, mode: "insensitive" },
    });
  }

  // Filters
  if (filters.brand) {
    andConditions.push({ vendor: { contains: filters.brand, mode: "insensitive" } });
  }
  if (filters.productType) {
    andConditions.push({
      OR: [
        { productType: { equals: filters.productType, mode: "insensitive" } },
        { searchText: { contains: filters.productType, mode: "insensitive" } },
      ],
    });
  }
  if (filters.category) {
    andConditions.push({
      searchText: { contains: filters.category, mode: "insensitive" },
    });
  }
  if (filters.color) {
    andConditions.push({
      searchText: { contains: filters.color, mode: "insensitive" },
    });
  }
  if (filters.minPrice != null) {
    andConditions.push({ minPrice: { gte: filters.minPrice } });
  }
  if (filters.maxPrice != null) {
    andConditions.push({ minPrice: { lte: filters.maxPrice } });
  }
  if (filters.inStock) {
    andConditions.push({
      variants: { some: { availableForSale: true } },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const rows = await prisma.syncProduct.findMany({
    where,
    include: productInclude,
    take: first,
  });

  return rows.map(dbRowToProduct);
}

/** Get a single product by its URL handle. */
export async function getProductByHandle(
  handle: string
): Promise<Product | null> {
  const row = await prisma.syncProduct.findUnique({
    where: { handle },
    include: productInclude,
  });
  return row ? dbRowToProduct(row) : null;
}

/** Get a single product by Shopify GID. */
export async function getProductById(id: string): Promise<Product | null> {
  const row = await prisma.syncProduct.findUnique({
    where: { id },
    include: productInclude,
  });
  return row ? dbRowToProduct(row) : null;
}

/** Get multiple products by their IDs. */
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const rows = await prisma.syncProduct.findMany({
    where: { id: { in: ids } },
    include: productInclude,
  });
  return rows.map(dbRowToProduct);
}

/** Resolve a variant by selected options (e.g. { Size: "42", Color: "Black" }). */
export async function getVariantByOptions(
  handleOrId: string,
  selectedOptions: Record<string, string>
): Promise<{ product: Product; variant: Product["variants"][0] | null }> {
  const product = handleOrId.startsWith("gid://")
    ? await getProductById(handleOrId)
    : await getProductByHandle(handleOrId);

  if (!product) throw new Error(`Product not found: ${handleOrId}`);

  const variant =
    product.variants.find((v) =>
      Object.entries(selectedOptions).every(([name, value]) =>
        v.selectedOptions.some(
          (o) =>
            o.name.toLowerCase() === name.toLowerCase() &&
            o.value.toLowerCase() === value.toLowerCase()
        )
      )
    ) ?? null;

  return { product, variant };
}

/** Check variant availability by variant ID. */
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

  if (!product) throw new Error(`Product not found: ${handleOrId}`);

  const variant = product.variants.find((v) => v.id === variantId) ?? null;

  return {
    available: variant?.availableForSale ?? false,
    quantityAvailable: variant?.quantityAvailable ?? null,
    variant,
  };
}
