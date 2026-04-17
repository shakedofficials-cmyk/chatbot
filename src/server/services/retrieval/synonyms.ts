import { prisma } from "../../db/client.js";
import { DEFAULT_BRANDS, DEFAULT_CATEGORIES, STYLE_TERMS, normalizeText } from "./normalize.js";

type SynonymKind = "brand" | "model" | "category" | "style";

interface SynonymEntry {
  phrase: string;
  canonical: string;
  kind: SynonymKind;
  weight?: number;
}

const DEFAULT_SYNONYMS: SynonymEntry[] = [
  ...DEFAULT_BRANDS.map((brand) => ({ phrase: brand, canonical: brand, kind: "brand" as const })),
  ...DEFAULT_CATEGORIES.map((category) => ({
    phrase: category,
    canonical: category,
    kind: "category" as const,
  })),
  ...STYLE_TERMS.map((style) => ({ phrase: style, canonical: style, kind: "style" as const })),
  // Model aliases — abbreviations
  { phrase: "af1", canonical: "air force 1", kind: "model" },
  { phrase: "air force one", canonical: "air force 1", kind: "model" },
  { phrase: "aj1", canonical: "jordan 1", kind: "model" },
  { phrase: "j1", canonical: "jordan 1", kind: "model" },
  { phrase: "dunks", canonical: "dunk", kind: "model" },
  { phrase: "jordans", canonical: "jordan", kind: "model" },
  { phrase: "gazelles", canonical: "gazelle", kind: "model" },
  { phrase: "sambas", canonical: "samba", kind: "model" },
  { phrase: "campuses", canonical: "campus", kind: "model" },
  // Model names with numbers — must be explicit so query understanding sets silhouette correctly
  { phrase: "air force 1", canonical: "air force 1", kind: "model" },
  { phrase: "jordan 1", canonical: "jordan 1", kind: "model" },
  { phrase: "air jordan 1", canonical: "jordan 1", kind: "model" },
  { phrase: "air max 1", canonical: "air max 1", kind: "model" },
  { phrase: "air max 90", canonical: "air max 90", kind: "model" },
  { phrase: "air max 95", canonical: "air max 95", kind: "model" },
  { phrase: "air max 97", canonical: "air max 97", kind: "model" },
  { phrase: "air max 270", canonical: "air max 270", kind: "model" },
  { phrase: "air max 360", canonical: "air max 360", kind: "model" },
  { phrase: "air max pulse", canonical: "air max pulse", kind: "model" },
  { phrase: "air max tw", canonical: "air max tw", kind: "model" },
  { phrase: "990", canonical: "990", kind: "model" },
  { phrase: "9060", canonical: "9060", kind: "model" },
  { phrase: "1906", canonical: "1906", kind: "model" },
  { phrase: "574", canonical: "574", kind: "model" },
  { phrase: "550", canonical: "550", kind: "model" },
  { phrase: "handball spezial", canonical: "handball spezial", kind: "model" },
  // Style terms
  { phrase: "retro runner", canonical: "retro runner", kind: "style" },
  { phrase: "everyday", canonical: "daily", kind: "style" },
  { phrase: "daily wear", canonical: "daily", kind: "style" },
  { phrase: "less loud", canonical: "minimal", kind: "style" },
  { phrase: "premium", canonical: "premium", kind: "style" },
  // Brand aliases
  { phrase: "nb", canonical: "new balance", kind: "brand" },
  { phrase: "nke", canonical: "nike", kind: "brand" },
  { phrase: "adi", canonical: "adidas", kind: "brand" },
];

let synonymCache:
  | {
      loadedAt: number;
      values: SynonymEntry[];
    }
  | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function ensureDefaultCatalogSynonyms(): Promise<void> {
  // Always upsert — never skip — so new defaults added in code reach production.
  await prisma.catalogSynonym.createMany({
    data: DEFAULT_SYNONYMS.map((entry) => ({
      phrase: normalizeText(entry.phrase),
      canonical: normalizeText(entry.canonical),
      kind: entry.kind,
      weight: entry.weight ?? 1,
    })),
    skipDuplicates: true,
  });

  // Invalidate in-memory cache so next search picks up the fresh values.
  synonymCache = null;
}

export async function getCatalogSynonyms(): Promise<SynonymEntry[]> {
  if (synonymCache && Date.now() - synonymCache.loadedAt < CACHE_TTL_MS) {
    return synonymCache.values;
  }

  const stored = await prisma.catalogSynonym.findMany();
  const values = stored.length > 0
    ? stored.map((entry) => ({
        phrase: normalizeText(entry.phrase),
        canonical: normalizeText(entry.canonical),
        kind: entry.kind as SynonymKind,
        weight: entry.weight,
      }))
    : DEFAULT_SYNONYMS;

  synonymCache = {
    loadedAt: Date.now(),
    values,
  };

  return values;
}

export async function findCanonicalSynonym(
  query: string,
  kind: SynonymKind
): Promise<string | null> {
  const normalized = normalizeText(query);
  const synonyms = await getCatalogSynonyms();
  const match = synonyms.find((entry) => entry.kind === kind && normalized.includes(entry.phrase));
  return match?.canonical ?? null;
}

export async function expandQueryWithSynonyms(query: string): Promise<string[]> {
  const normalized = normalizeText(query);
  const synonyms = await getCatalogSynonyms();
  const expansions = new Set<string>([normalized]);

  for (const entry of synonyms) {
    if (normalized.includes(entry.phrase)) {
      expansions.add(normalized.replace(entry.phrase, entry.canonical));
      expansions.add(entry.canonical);
    }
  }

  return Array.from(expansions);
}
