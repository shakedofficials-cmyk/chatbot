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
  { phrase: "af1", canonical: "air force 1", kind: "model" },
  { phrase: "air force one", canonical: "air force 1", kind: "model" },
  { phrase: "aj1", canonical: "jordan 1", kind: "model" },
  { phrase: "j1", canonical: "jordan 1", kind: "model" },
  { phrase: "dunks", canonical: "dunk", kind: "model" },
  { phrase: "jordans", canonical: "jordan", kind: "model" },
  { phrase: "gazelles", canonical: "gazelle", kind: "model" },
  { phrase: "sambas", canonical: "samba", kind: "model" },
  { phrase: "campuses", canonical: "campus", kind: "model" },
  { phrase: "retro runner", canonical: "retro runner", kind: "style" },
  { phrase: "everyday", canonical: "daily", kind: "style" },
  { phrase: "daily wear", canonical: "daily", kind: "style" },
  { phrase: "less loud", canonical: "minimal", kind: "style" },
  { phrase: "premium", canonical: "premium", kind: "style" },
  { phrase: "nb", canonical: "new balance", kind: "brand" },
];

let synonymCache:
  | {
      loadedAt: number;
      values: SynonymEntry[];
    }
  | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function ensureDefaultCatalogSynonyms(): Promise<void> {
  const count = await prisma.catalogSynonym.count();
  if (count > 0) return;

  await prisma.catalogSynonym.createMany({
    data: DEFAULT_SYNONYMS.map((entry) => ({
      phrase: normalizeText(entry.phrase),
      canonical: normalizeText(entry.canonical),
      kind: entry.kind,
      weight: entry.weight ?? 1,
    })),
    skipDuplicates: true,
  });
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
