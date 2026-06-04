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
  topSearches: CounterEntry[];
  noResultSearches: CounterEntry[];
  requestedSizes: CounterEntry[];
  requestedColors: CounterEntry[];
  requestedTypes: CounterEntry[];
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
  const searches = new Map<string, number>();
  const noResults = new Map<string, number>();
  const sizes = new Map<string, number>();
  const colors = new Map<string, number>();
  const types = new Map<string, number>();

  for (const event of events) {
    counts[event.name] = (counts[event.name] ?? 0) + 1;
    const payload = parsePayload(event.payload);

    if (event.name === "product_search") {
      bump(searches, payload.query);
    }
    if (event.name === "no_result") {
      bump(noResults, payload.query);
    }

    bump(sizes, filterValue(payload, "size"));
    bump(colors, filterValue(payload, "color"));
    bump(types, filterValue(payload, "category") ?? filterValue(payload, "productType") ?? filterValue(payload, "type"));
  }

  return {
    totalEvents: events.length,
    counts,
    topSearches: top(searches),
    noResultSearches: top(noResults),
    requestedSizes: top(sizes),
    requestedColors: top(colors),
    requestedTypes: top(types),
  };
}
