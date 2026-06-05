interface RawEvent {
  name: string;
  payload: string | Record<string, unknown> | null;
  createdAt?: Date;
}

interface CounterEntry {
  key: string;
  count: number;
}

export interface AnalyticsSummary {
  totalEvents: number;
  counts: Record<string, number>;
  conversionFunnel: Record<string, number>;
  topSearches: CounterEntry[];
  lowConfidenceSearches: CounterEntry[];
  noResultSearches: CounterEntry[];
  topNoResultDemand: CounterEntry[];
  requestedSizes: CounterEntry[];
  topProfileSizes: CounterEntry[];
  requestedColors: CounterEntry[];
  requestedTypes: CounterEntry[];
  addToCartByQuery: CounterEntry[];
  checkoutStartsByQuery: CounterEntry[];
  whatsappRecoveryClicks: number;
}

function parsePayload(payload: RawEvent["payload"]): Record<string, unknown> {
  if (!payload) return {};
  if (typeof payload === "object") return payload;
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function bump(counter: Map<string, number>, key: unknown): void {
  if (typeof key !== "string") return;
  const normalized = key.trim();
  if (!normalized) return;
  counter.set(normalized, (counter.get(normalized) ?? 0) + 1);
}

function top(counter: Map<string, number>, limit = 10): CounterEntry[] {
  return Array.from(counter.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function filterValue(payload: Record<string, unknown>, key: string): unknown {
  const filters = payload.effectiveFilters;
  if (filters && typeof filters === "object" && key in filters) {
    return (filters as Record<string, unknown>)[key];
  }
  return payload[key];
}

export function summarizeAnalyticsEvents(events: RawEvent[]): AnalyticsSummary {
  const counts: Record<string, number> = {};
  const conversionFunnel: Record<string, number> = {};
  const searches = new Map<string, number>();
  const lowConfidence = new Map<string, number>();
  const noResults = new Map<string, number>();
  const sizes = new Map<string, number>();
  const profileSizes = new Map<string, number>();
  const colors = new Map<string, number>();
  const types = new Map<string, number>();
  const addToCartQueries = new Map<string, number>();
  const checkoutQueries = new Map<string, number>();
  let whatsappRecoveryClicks = 0;
  const funnelEvents = new Set([
    "chat_opened",
    "product_search",
    "product_clicked",
    "recommendation_clicked",
    "add_to_cart",
    "checkout_started",
    "whatsapp_clicked",
  ]);

  for (const event of events) {
    counts[event.name] = (counts[event.name] ?? 0) + 1;
    if (funnelEvents.has(event.name)) {
      conversionFunnel[event.name] = (conversionFunnel[event.name] ?? 0) + 1;
    }
    const payload = parsePayload(event.payload);

    if (event.name === "product_search") {
      bump(searches, payload.query);
    }
    if (event.name === "low_confidence_search") {
      bump(lowConfidence, payload.query);
    }
    if (event.name === "no_result") {
      bump(noResults, payload.query);
    }
    if (event.name === "add_to_cart") {
      bump(addToCartQueries, payload.query ?? payload.lastQuery ?? payload.productHandle);
    }
    if (event.name === "checkout_started") {
      bump(checkoutQueries, payload.query ?? payload.lastQuery ?? payload.productHandle);
    }
    if (event.name === "whatsapp_clicked" || event.name === "cart_recovery_clicked") {
      whatsappRecoveryClicks += 1;
    }

    bump(sizes, filterValue(payload, "size"));
    bump(sizes, payload.sizeLabel);
    bump(profileSizes, payload.preferredSize ?? payload.sizeLabel ?? filterValue(payload, "size"));
    bump(colors, filterValue(payload, "color"));
    bump(types, filterValue(payload, "category") ?? filterValue(payload, "productType") ?? filterValue(payload, "type"));
  }

  return {
    totalEvents: events.length,
    counts,
    conversionFunnel,
    topSearches: top(searches),
    lowConfidenceSearches: top(lowConfidence),
    noResultSearches: top(noResults),
    topNoResultDemand: top(noResults),
    requestedSizes: top(sizes),
    topProfileSizes: top(profileSizes),
    requestedColors: top(colors),
    requestedTypes: top(types),
    addToCartByQuery: top(addToCartQueries),
    checkoutStartsByQuery: top(checkoutQueries),
    whatsappRecoveryClicks,
  };
}
