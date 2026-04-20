import { describe, expect, it } from "vitest";
import { summarizeSyncHealth } from "./monitor.js";

describe("summarizeSyncHealth", () => {
  it("marks catalog stale when there has never been a successful sync", () => {
    const summary = summarizeSyncHealth(null, null, 24, new Date("2026-04-20T12:00:00.000Z"));

    expect(summary.isStale).toBe(true);
    expect(summary.staleReason).toBe("no_sync_record");
  });

  it("treats a recent successful sync as fresh", () => {
    const now = new Date("2026-04-20T12:00:00.000Z");
    const latestSuccess = {
      status: "completed",
      startedAt: new Date("2026-04-20T11:00:00.000Z"),
      completedAt: new Date("2026-04-20T11:02:00.000Z"),
      error: null,
    };

    const summary = summarizeSyncHealth(latestSuccess, latestSuccess, 24, now);

    expect(summary.isStale).toBe(false);
    expect(summary.ageMinutesSinceSuccess).toBe(58);
  });

  it("marks catalog stale when the last successful sync is older than the freshness window", () => {
    const now = new Date("2026-04-20T12:00:00.000Z");
    const latestRun = {
      status: "failed",
      startedAt: new Date("2026-04-20T11:30:00.000Z"),
      completedAt: new Date("2026-04-20T11:31:00.000Z"),
      error: "Shopify timeout",
    };
    const latestSuccess = {
      status: "completed",
      startedAt: new Date("2026-04-18T10:00:00.000Z"),
      completedAt: new Date("2026-04-18T10:10:00.000Z"),
      error: null,
    };

    const summary = summarizeSyncHealth(latestRun, latestSuccess, 24, now);

    expect(summary.isStale).toBe(true);
    expect(summary.staleReason).toBe("last_success_too_old");
    expect(summary.lastError).toBe("Shopify timeout");
  });
});
