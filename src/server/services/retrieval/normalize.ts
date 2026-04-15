import { createHash } from "crypto";
import type { Product, ProductVariant } from "../../../shared/types.js";
import { normalizeVariantSize } from "../size-resolution.js";

export const DEFAULT_BRANDS = [
  "adidas",
  "nike",
  "jordan",
  "new balance",
  "asics",
  "puma",
  "reebok",
  "converse",
  "vans",
  "salomon",
  "crocs",
  "on",
  "hoka",
];

export const DEFAULT_CATEGORIES = [
  "sneaker",
  "sneakers",
  "shoe",
  "shoes",
  "runner",
  "running",
  "retro",
  "lifestyle",
  "basketball",
  "sportswear",
  "loafer",
  "slide",
  "clog",
  "boot",
];

export const DEFAULT_COLORS = [
  "black",
  "white",
  "grey",
  "gray",
  "silver",
  "cream",
  "beige",
  "brown",
  "green",
  "olive",
  "navy",
  "blue",
  "red",
  "burgundy",
  "pink",
  "purple",
  "yellow",
  "orange",
];

export const STYLE_TERMS = [
  "clean",
  "daily",
  "everyday",
  "premium",
  "retro",
  "runner",
  "running",
  "minimal",
  "versatile",
  "loud",
  "bold",
  "classic",
  "sporty",
  "chunky",
  "slim",
  "court",
  "skate",
  "streetwear",
  "luxury",
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "best",
  "do",
  "for",
  "have",
  "i",
  "in",
  "is",
  "it",
  "like",
  "me",
  "my",
  "need",
  "of",
  "or",
  "show",
  "something",
  "that",
  "the",
  "to",
  "want",
  "with",
  "you",
  "your",
]);

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens.filter(Boolean)));
}

export function buildSearchText(parts: Array<string | null | undefined>): string {
  return uniqueTokens(parts.flatMap((part) => tokenize(part))).join(" ");
}

export function buildEmbeddingText(product: Product): string {
  return [
    product.vendor,
    product.title,
    product.productType,
    product.tags.join(" "),
    product.description,
    product.metafields.fitProfile,
    product.metafields.materialSummary,
    product.metafields.recommendedUse,
    product.metafields.compareHighlights,
    product.metafields.styleTags?.join(" "),
    ...product.variants.map((variant) => variant.selectedOptions.map((option) => `${option.name} ${option.value}`).join(" ")),
  ]
    .filter(Boolean)
    .join(". ");
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function extractSizeValue(variant: ProductVariant): string | null {
  // Match any option whose name contains "size" (e.g. "EU Size", "Men's Size", "Shoe Size")
  const sizeOption = variant.selectedOptions.find((option) =>
    option.name.toLowerCase().includes("size")
  );
  return sizeOption?.value ?? null;
}

/** Returns the normalised EU numeric size for a variant, or null if not parseable. */
export function extractSizeEU(variant: ProductVariant): number | null {
  const raw = extractSizeValue(variant);
  if (!raw) return null;
  return normalizeVariantSize(raw)?.value ?? null;
}

export function extractColorValue(variant: ProductVariant): string | null {
  const colorOption = variant.selectedOptions.find((option) => {
    const name = option.name.toLowerCase();
    return name === "color" || name === "colour";
  });
  return colorOption?.value ?? null;
}

export function extractModelKey(product: Product): string | null {
  const normalizedTitle = normalizeText(product.title);
  const brand = normalizeText(product.vendor);

  const stripped = normalizedTitle.startsWith(`${brand} `)
    ? normalizedTitle.slice(brand.length).trim()
    : normalizedTitle;

  const candidate = stripped
    .replace(/\b(men|women|womens|womans|mens|kids|gs)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return candidate || null;
}

export function inferSilhouette(product: Product): string | null {
  const haystack = buildSearchText([
    product.title,
    product.productType,
    product.tags.join(" "),
    product.metafields.styleTags?.join(" "),
  ]);

  const knownSilhouettes = [
    "dunk",
    "samba",
    "gazelle",
    "jordan 1",
    "air force 1",
    "campus",
    "990",
    "9060",
    "1906",
    "forum",
    "superstar",
    "handball spezial",
  ];

  return knownSilhouettes.find((item) => haystack.includes(item)) ?? null;
}

export function inferCategory(product: Product): string | null {
  const normalizedType = normalizeText(product.productType);
  if (normalizedType) return normalizedType;

  const match = DEFAULT_CATEGORIES.find((term) => normalizeText(product.title).includes(term));
  return match ?? null;
}

export function extractColorTokens(product: Product): string[] {
  const source = buildSearchText([
    product.title,
    product.tags.join(" "),
    ...product.variants.flatMap((variant) => variant.selectedOptions.map((option) => option.value)),
  ]);

  return DEFAULT_COLORS.filter((color) => source.includes(color));
}

export function extractStyleTokens(product: Product): string[] {
  const source = buildSearchText([
    product.title,
    product.description,
    product.tags.join(" "),
    product.metafields.styleTags?.join(" "),
    product.metafields.recommendedUse,
    product.metafields.compareHighlights,
  ]);

  return STYLE_TERMS.filter((term) => source.includes(term));
}

export function buildSizeText(product: Product): string {
  return uniqueTokens(
    product.variants
      .map((variant) => extractSizeValue(variant))
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeText(value))
  ).join(" ");
}

export function buildVariantOptionText(variant: ProductVariant): string {
  return buildSearchText([
    variant.title,
    ...variant.selectedOptions.map((option) => `${option.name} ${option.value}`),
  ]);
}

export function stripStopWords(tokens: string[]): string[] {
  return tokens.filter((token) => !STOP_WORDS.has(token));
}
