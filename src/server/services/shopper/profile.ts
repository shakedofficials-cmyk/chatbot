import { prisma } from "../../db/client.js";
import type {
  SearchFilters,
  ShopperProfilePreferences,
  ShopperProfileSummary,
  ShopperPreferences,
} from "../../../shared/types.js";

export interface ShopperProfileSignal {
  filters?: SearchFilters;
  clickedHandles?: string[];
  viewedHandles?: string[];
  cartHasItems?: boolean;
  eventName?: string;
  payload?: Record<string, unknown>;
}

function parsePreferences(value: string | null | undefined): ShopperProfilePreferences {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as ShopperProfilePreferences : {};
  } catch {
    return {};
  }
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanChoice(value: unknown): string | undefined {
  const cleaned = cleanString(value);
  return cleaned && cleaned.toLowerCase() !== "any" ? cleaned : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function normalizeList(values: Array<string | undefined>, limit = 8): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanString(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= limit) break;
  }

  return result;
}

function pushRecent(existing: string[] | undefined, next: string[] | undefined, limit = 12): string[] | undefined {
  const values = normalizeList([...(next ?? []), ...(existing ?? [])], limit);
  return values.length > 0 ? values : undefined;
}

function firstFromPayload(payload: Record<string, unknown> | undefined, keys: string[]): unknown {
  if (!payload) return undefined;
  for (const key of keys) {
    if (key in payload) return payload[key];
  }
  const filters = payload.effectiveFilters;
  if (filters && typeof filters === "object") {
    for (const key of keys) {
      if (key in filters) return (filters as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

export function mergeShopperProfilePreferences(
  existing: ShopperProfilePreferences,
  signal: ShopperProfileSignal
): ShopperProfilePreferences {
  const payload = signal.payload;
  const filters = signal.filters ?? {};
  const guidedAnswers = payload?.answers && typeof payload.answers === "object"
    ? payload.answers as Record<string, unknown>
    : {};
  const size = cleanString(filters.size) ??
    cleanString(firstFromPayload(payload, ["size", "sizeLabel"])) ??
    cleanString(guidedAnswers.size);
  const gender = cleanChoice(filters.gender) ??
    cleanChoice(filters.tags) ??
    cleanChoice(firstFromPayload(payload, ["gender"])) ??
    cleanChoice(guidedAnswers.gender);
  const budget = cleanNumber(filters.maxPrice) ??
    cleanNumber(firstFromPayload(payload, ["maxPrice", "budget"])) ??
    cleanNumber(guidedAnswers.budget);
  const brand = cleanChoice(filters.brand) ??
    cleanChoice(firstFromPayload(payload, ["brand", "productBrand"])) ??
    cleanChoice(guidedAnswers.brand);
  const color = cleanChoice(filters.color) ??
    cleanChoice(firstFromPayload(payload, ["color"])) ??
    cleanChoice(guidedAnswers.style);
  const category = cleanChoice(filters.category ?? filters.productType) ??
    cleanChoice(firstFromPayload(payload, ["category", "productType", "type"])) ??
    cleanChoice(guidedAnswers.category);
  const clickedHandle = cleanString(firstFromPayload(payload, ["productHandle", "handle"]));
  const viewedHandle = cleanString(firstFromPayload(payload, ["viewedHandle"]));
  const recentCartIntent = signal.cartHasItems || signal.eventName === "add_to_cart"
    ? "cart_has_items"
    : signal.eventName === "whatsapp_clicked" || signal.eventName === "cart_recovery_clicked"
      ? "whatsapp_handoff"
      : existing.recentCartIntent;

  return {
    ...existing,
    preferredSize: size ?? existing.preferredSize,
    preferredGender: gender && gender !== "any" ? gender : existing.preferredGender,
    preferredBudget: budget ?? existing.preferredBudget,
    favoriteBrands: normalizeList([brand, ...(existing.favoriteBrands ?? [])]),
    avoidedBrands: existing.avoidedBrands,
    preferredColors: normalizeList([color, ...(existing.preferredColors ?? [])]),
    preferredCategories: normalizeList([category, ...(existing.preferredCategories ?? [])]),
    recentClickedHandles: pushRecent(existing.recentClickedHandles, [
      clickedHandle,
      ...(signal.clickedHandles ?? []),
    ].filter((entry): entry is string => Boolean(entry))),
    recentViewedHandles: pushRecent(existing.recentViewedHandles, [
      viewedHandle,
      ...(signal.viewedHandles ?? []),
    ].filter((entry): entry is string => Boolean(entry))),
    recentCartIntent,
  };
}

export async function getShopperProfile(shopperId: string | undefined): Promise<ShopperProfilePreferences> {
  if (!shopperId) return {};
  const row = await prisma.shopperProfile.findUnique({
    where: { shopperId },
    select: { preferences: true },
  });
  return parsePreferences(row?.preferences);
}

export async function mergeShopperProfile(
  shopperId: string | undefined,
  signal: ShopperProfileSignal
): Promise<ShopperProfilePreferences> {
  if (!shopperId) return {};

  const existing = await getShopperProfile(shopperId);
  const next = mergeShopperProfilePreferences(existing, signal);

  await prisma.shopperProfile.upsert({
    where: { shopperId },
    create: {
      shopperId,
      preferences: JSON.stringify(next),
    },
    update: {
      preferences: JSON.stringify(next),
    },
  });

  return next;
}

export function buildProfileSummary(preferences: ShopperProfilePreferences): ShopperProfileSummary {
  const badges = [
    preferences.preferredSize ? `Size ${preferences.preferredSize}` : null,
    preferences.favoriteBrands?.[0],
    preferences.preferredBudget ? `Under $${preferences.preferredBudget}` : null,
    preferences.preferredCategories?.[0],
    preferences.preferredColors?.[0],
  ].filter((entry): entry is string => Boolean(entry)).slice(0, 4);

  return { badges, preferences };
}

export function toSessionPreferences(preferences: ShopperProfilePreferences): ShopperPreferences {
  return {
    favoriteBrand: preferences.favoriteBrands?.[0],
    preferredSize: preferences.preferredSize,
    preferredCategory: preferences.preferredCategories?.[0],
    preferredColor: preferences.preferredColors?.[0],
  };
}
