import type { ProductVariant, SelectedOption } from "../../shared/types.js";

export type SizeSystem = "EU" | "US" | "UK";

export interface ResolvedSize {
  system: SizeSystem;
  value: number;
}

export interface VariantMatchResult {
  /** Exact EU match regardless of stock */
  exactMatch: ProductVariant | null;
  /** Exact EU match AND currently available */
  exactMatchAvailable: ProductVariant | null;
  /** Nearest in-stock variants within ±1 EU, sorted by distance */
  closestMatches: ProductVariant[];
  /** All in-stock EU sizes for this product, sorted ascending */
  availableSizes: number[];
  /** The resolved EU target value (null if input unparseable) */
  requestedEU: number | null;
}

// ── Conversion table: men's sneaker standard (Adidas/Nike) ───────────────────
const SIZE_TABLE: ReadonlyArray<{ eu: number; us: number; uk: number }> = [
  { eu: 35,   us: 3,    uk: 2.5 },
  { eu: 35.5, us: 3.5,  uk: 3   },
  { eu: 36,   us: 4,    uk: 3.5 },
  { eu: 36.5, us: 4.5,  uk: 4   },
  { eu: 37,   us: 5,    uk: 4.5 },
  { eu: 37.5, us: 5.5,  uk: 5   },
  { eu: 38,   us: 6,    uk: 5.5 },
  { eu: 38.5, us: 6.5,  uk: 6   },
  { eu: 39,   us: 7,    uk: 6.5 },
  { eu: 40,   us: 7.5,  uk: 7   },
  { eu: 40.5, us: 8,    uk: 7.5 },
  { eu: 41,   us: 8.5,  uk: 8   },
  { eu: 42,   us: 9,    uk: 8.5 },
  { eu: 42.5, us: 9.5,  uk: 9   },
  { eu: 43,   us: 10,   uk: 9.5 },
  { eu: 44,   us: 10.5, uk: 10  },
  { eu: 44.5, us: 11,   uk: 10.5 },
  { eu: 45,   us: 11.5, uk: 11  },
  { eu: 45.5, us: 12,   uk: 11.5 },
  { eu: 46,   us: 12.5, uk: 12  },
  { eu: 47,   us: 13,   uk: 12.5 },
  { eu: 47.5, us: 13.5, uk: 13  },
  { eu: 48,   us: 14,   uk: 13.5 },
  { eu: 49,   us: 15,   uk: 14  },
];

// Keywords whose presence in an option name marks it as a size option
const SIZE_KEYWORDS = ["size", "taille", "größe"];

/**
 * Given a variant's selectedOptions array, return the raw size value string
 * regardless of what the option is named ("Size", "EU Size", "Men's Size", etc.).
 */
export function findSizeOptionValue(selectedOptions: SelectedOption[]): string | null {
  const opt = selectedOptions.find((o) =>
    SIZE_KEYWORDS.some((kw) => o.name.toLowerCase().includes(kw))
  );
  return opt?.value ?? null;
}

/**
 * Parse a user-typed size string into a system + numeric value.
 * Explicit system markers ("EU", "US", "UK") always win.
 * Without a marker: values ≥ 36 → EU (ORJN is a Lebanon/EU-market store);
 * values < 36 → US (no one says "size 10" meaning EU 10 in this context).
 */
export function resolveUserSize(input: string): ResolvedSize {
  const s = input.toLowerCase().trim().replace(",", ".");

  // Explicit US
  const usMatch = s.match(/^us\s*(\d+(?:\.\d+)?)|^(\d+(?:\.\d+)?)\s*us$/);
  if (usMatch) {
    return { system: "US", value: parseFloat(usMatch[1] ?? usMatch[2]) };
  }

  // Explicit UK
  const ukMatch = s.match(/^uk\s*(\d+(?:\.\d+)?)|^(\d+(?:\.\d+)?)\s*uk$/);
  if (ukMatch) {
    return { system: "UK", value: parseFloat(ukMatch[1] ?? ukMatch[2]) };
  }

  // Explicit EU prefix/suffix (e.g. "EU 44", "44 eu") or plain number
  const euMatch = s.match(/^(?:eu\s+)?(\d+(?:\.\d+)?)(?:\s*eu)?$/);
  if (euMatch) {
    const val = parseFloat(euMatch[1]);
    // Even without "eu" keyword: ≥ 36 → EU, < 36 → treat as US
    const system: SizeSystem = val >= 36 ? "EU" : "US";
    return { system, value: val };
  }

  // Last resort: extract the first number from a messy string
  const anyNum = s.match(/(\d+(?:\.\d+)?)/);
  if (anyNum) {
    const val = parseFloat(anyNum[1]);
    const system: SizeSystem = val >= 36 ? "EU" : "US";
    return { system, value: val };
  }

  throw new Error(`Cannot parse size: "${input}"`);
}

/**
 * Convert a size value in any system to EU.
 * Returns the closest EU entry from the conversion table.
 */
export function sizeToEU(value: number, system: SizeSystem): number {
  if (system === "EU") return value;

  const col: "us" | "uk" = system === "US" ? "us" : "uk";

  // Exact table match first
  const exact = SIZE_TABLE.find((e) => e[col] === value);
  if (exact) return exact.eu;

  // Nearest neighbour
  let best = SIZE_TABLE[0];
  let bestDist = Math.abs(SIZE_TABLE[0][col] - value);
  for (const entry of SIZE_TABLE) {
    const dist = Math.abs(entry[col] - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best.eu;
}

/**
 * Parse a stored variant option value to a normalised EU size.
 * Returns null if the value cannot be parsed.
 */
export function normalizeVariantSize(optionValue: string): { system: "EU"; value: number } | null {
  try {
    const resolved = resolveUserSize(optionValue);
    const eu = sizeToEU(resolved.value, resolved.system);
    return { system: "EU", value: eu };
  } catch {
    return null;
  }
}

/**
 * Core matching function.
 * Given an array of variants and a requested size string, returns:
 *  - exactMatch: the variant whose EU size equals the target (regardless of stock)
 *  - exactMatchAvailable: same, but only if it's in stock
 *  - closestMatches: in-stock variants within ±1 EU, sorted by distance
 *  - availableSizes: all in-stock EU sizes sorted ascending
 *  - requestedEU: the EU value we resolved the input to
 */
export function findBestVariantMatch(
  variants: ProductVariant[],
  requestedSizeInput: string
): VariantMatchResult {
  let requestedEU: number | null = null;

  try {
    const resolved = resolveUserSize(requestedSizeInput);
    requestedEU = sizeToEU(resolved.value, resolved.system);
  } catch {
    return {
      exactMatch: null,
      exactMatchAvailable: null,
      closestMatches: [],
      availableSizes: [],
      requestedEU: null,
    };
  }

  // Pair each variant with its EU size (skip variants with no parseable size)
  const withSizes: Array<{ variant: ProductVariant; euSize: number }> = [];
  for (const v of variants) {
    const raw = findSizeOptionValue(v.selectedOptions);
    if (!raw) continue;
    const norm = normalizeVariantSize(raw);
    if (norm) withSizes.push({ variant: v, euSize: norm.value });
  }

  const target = requestedEU;

  const exactMatch =
    withSizes.find((e) => e.euSize === target)?.variant ?? null;

  const exactMatchAvailable =
    withSizes.find((e) => e.euSize === target && e.variant.availableForSale)?.variant ?? null;

  const closestMatches = withSizes
    .filter(
      (e) =>
        e.variant.availableForSale &&
        e.euSize !== target &&
        Math.abs(e.euSize - target) <= 1
    )
    .sort((a, b) => Math.abs(a.euSize - target) - Math.abs(b.euSize - target))
    .slice(0, 3)
    .map((e) => e.variant);

  // Deduplicated, sorted available EU sizes
  const seenEU = new Set<number>();
  const availableSizes: number[] = [];
  for (const e of [...withSizes].sort((a, b) => a.euSize - b.euSize)) {
    if (e.variant.availableForSale && !seenEU.has(e.euSize)) {
      seenEU.add(e.euSize);
      availableSizes.push(e.euSize);
    }
  }

  return {
    exactMatch,
    exactMatchAvailable,
    closestMatches,
    availableSizes,
    requestedEU,
  };
}
