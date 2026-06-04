import { describe, expect, it } from "vitest";
import { summarizeAnalyticsEvents } from "./summary.js";

describe("summarizeAnalyticsEvents", () => {
  it("summarizes demand signals from analytics payloads", () => {
    const summary = summarizeAnalyticsEvents([
      {
        name: "product_search",
        payload: JSON.stringify({
          query: "lifestyle size 44",
          effectiveFilters: { size: "44", category: "lifestyle", color: "black" },
        }),
      },
      {
        name: "product_search",
        payload: { query: "air force 1", effectiveFilters: { size: "44" } },
      },
      {
        name: "no_result",
        payload: JSON.stringify({ query: "blue ultraboost size 39", size: "39", color: "blue" }),
      },
      { name: "whatsapp_clicked", payload: "{}" },
      { name: "add_to_cart", payload: "{}" },
    ]);

    expect(summary.totalEvents).toBe(5);
    expect(summary.counts.product_search).toBe(2);
    expect(summary.counts.whatsapp_clicked).toBe(1);
    expect(summary.topSearches[0]).toEqual({ key: "air force 1", count: 1 });
    expect(summary.noResultSearches).toEqual([{ key: "blue ultraboost size 39", count: 1 }]);
    expect(summary.requestedSizes[0]).toEqual({ key: "44", count: 2 });
    expect(summary.requestedColors).toEqual(expect.arrayContaining([{ key: "black", count: 1 }]));
    expect(summary.requestedTypes).toEqual([{ key: "lifestyle", count: 1 }]);
  });
});
