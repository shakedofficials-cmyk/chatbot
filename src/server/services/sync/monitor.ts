export interface SyncSnapshot {
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
}

export interface SyncHealthSummary {
  lastRunStatus: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  isStale: boolean;
  staleReason: string | null;
  staleAfterHours: number;
  ageMinutesSinceSuccess: number | null;
}

export function summarizeSyncHealth(
  latestRun: SyncSnapshot | null,
  latestSuccess: SyncSnapshot | null,
  staleAfterHours: number,
  now = new Date()
): SyncHealthSummary {
  const staleAfterMs = staleAfterHours * 60 * 60 * 1000;

  if (!latestRun && !latestSuccess) {
    return {
      lastRunStatus: null,
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      isStale: true,
      staleReason: "no_sync_record",
      staleAfterHours,
      ageMinutesSinceSuccess: null,
    };
  }

  const latestSuccessAt = latestSuccess?.completedAt ?? latestSuccess?.startedAt ?? null;
  const ageMinutesSinceSuccess = latestSuccessAt
    ? Math.max(0, Math.round((now.getTime() - latestSuccessAt.getTime()) / 60000))
    : null;

  let isStale = false;
  let staleReason: string | null = null;

  if (!latestSuccessAt) {
    isStale = true;
    staleReason = "no_successful_sync";
  } else if (now.getTime() - latestSuccessAt.getTime() > staleAfterMs) {
    isStale = true;
    staleReason = "last_success_too_old";
  }

  if (latestRun?.status === "failed") {
    staleReason = staleReason ?? "latest_sync_failed";
  } else if (
    latestRun?.status === "started" &&
    now.getTime() - latestRun.startedAt.getTime() > staleAfterMs
  ) {
    isStale = true;
    staleReason = staleReason ?? "sync_stuck_in_progress";
  }

  return {
    lastRunStatus: latestRun?.status ?? null,
    lastRunAt: latestRun?.startedAt.toISOString() ?? null,
    lastSuccessAt: latestSuccessAt?.toISOString() ?? null,
    lastError: latestRun?.error ?? null,
    isStale,
    staleReason,
    staleAfterHours,
    ageMinutesSinceSuccess,
  };
}
