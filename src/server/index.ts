import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { env, hasLiveShopifyStore } from "./config.js";
import { prisma } from "./db/client.js";
import chatRoutes from "./routes/chat.js";
import cartRoutes from "./routes/cart.js";
import analyticsRoutes from "./routes/analytics.js";
import retrievalRoutes from "./routes/retrieval.js";
import authRoutes from "./routes/auth.js";
import webhookRoutes from "./routes/webhooks.js";
import { syncShopifyProducts } from "./services/sync/shopify-sync.js";
import { summarizeSyncHealth } from "./services/sync/monitor.js";
import {
  refreshAllInstalledAdminTokens,
  ensureManagedStorefrontAccessToken,
  getStorefrontAccessToken,
} from "./services/shopify/admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.set("trust proxy", 1);
const widgetDistDir = join(__dirname, "../widget");
const widgetBundlePath = join(widgetDistDir, "orjn-concierge.js");
let syncInFlight: Promise<{ total: number; upserted: number; deleted: number }> | null = null;

function isSyncAuthorized(req: Request): boolean {
  return !env.SYNC_SECRET || req.headers["x-sync-secret"] === env.SYNC_SECRET;
}

async function getSyncHealth() {
  const [latestRun, latestSuccess] = await Promise.all([
    prisma.syncLog.findFirst({
      orderBy: { startedAt: "desc" },
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
        error: true,
      },
    }),
    prisma.syncLog.findFirst({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
        error: true,
      },
    }),
  ]);

  return summarizeSyncHealth(latestRun, latestSuccess, env.SYNC_STALE_AFTER_HOURS);
}

async function runCatalogSync(reason: string) {
  if (syncInFlight) {
    console.log(`[sync] Reusing in-flight sync for ${reason}`);
    return syncInFlight;
  }

  syncInFlight = syncShopifyProducts()
    .then((result) => {
      console.log(`[sync] ${reason} sync complete:`, result);
      return result;
    })
    .catch((error) => {
      console.error(`[sync] ${reason} sync failed:`, error);
      throw error;
    })
    .finally(() => {
      syncInFlight = null;
    });

  return syncInFlight;
}

async function ensureCatalogFreshness() {
  const health = await getSyncHealth();
  if (health.isStale) {
    console.warn("[sync] Catalog freshness watchdog triggered", health);
    await runCatalogSync("watchdog");
  }
}

// Middleware
app.use(
  helmet({
    // Shopify storefront pages load the widget from a different origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(compression());
app.use(
  cors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
  })
);
app.use(express.json({
  limit: "100kb",
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

// Serve the widget bundle with headers that allow Shopify storefronts to load it cross-origin.
app.get("/orjn-concierge.js", (_req: Request, res: Response) => {
  res.type("application/javascript; charset=utf-8");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.sendFile(widgetBundlePath);
});

// Serve any additional widget assets from dist/widget/
app.use(
  express.static(widgetDistDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".js")) {
        res.type("application/javascript; charset=utf-8");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      }
    },
  })
);

// Rate limiting - 30 chat messages per minute per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many requests. Please slow down." },
});

// Rate limiting - 60 analytics events per minute per IP
const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many requests. Please slow down." },
});

// Routes
app.use("/api/chat", chatLimiter, chatRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/analytics", analyticsLimiter, analyticsRoutes);
app.use("/api/retrieval", retrievalRoutes);
app.use("/auth", authRoutes);
app.use("/api/webhooks", webhookRoutes);

// Widget config — exposes the Storefront token to the client-side widget.
// Storefront tokens are designed to be public (Shopify explicitly states this).
app.get("/api/widget-config", async (_req: Request, res: Response) => {
  const storefrontToken = await getStorefrontAccessToken(env.SHOPIFY_STORE_DOMAIN);
  res.json({
    shopDomain: env.SHOPIFY_STORE_DOMAIN,
    storefrontToken,
    apiVersion: "2024-01",
  });
});

// Health check - pings DB to catch connection failures
app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", timestamp: new Date().toISOString() });
  }
});

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Manual sync trigger
app.post("/api/sync", async (req: Request, res: Response) => {
  if (!isSyncAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await runCatalogSync("manual");
    res.json({ status: "ok", ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/sync/status", async (_req: Request, res: Response) => {
  try {
    const health = await getSyncHealth();
    res.json({
      status: "ok",
      syncInFlight: Boolean(syncInFlight),
      ...health,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

function scheduleDaily3amSync() {
  const now = new Date();
  const next3am = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + (now.getUTCHours() >= 3 ? 1 : 0),
    3, 0, 0, 0
  ));
  const msUntil3am = next3am.getTime() - now.getTime();

  const fire3amSync = () => {
    console.log("[sync] daily 3AM sync starting");
    runCatalogSync("daily-3am").catch(() => {});
  };

  setTimeout(() => {
    fire3amSync();
    setInterval(fire3amSync, 24 * 60 * 60 * 1000);
  }, msUntil3am);

  console.log(`[sync] Daily 3AM sync scheduled in ${Math.round(msUntil3am / 60000)} minutes`);
}

async function runStartupSyncIfNeeded() {
  if (!hasLiveShopifyStore) return;
  const count = await prisma.syncProduct.count();
  if (count === 0) {
    console.log("[sync] DB empty on startup — running immediate blocking sync...");
    try {
      const result = await runCatalogSync("startup-empty-db");
      console.log("[sync] Startup sync complete:", result);
    } catch (err) {
      console.error("[sync] Startup sync failed:", err);
    }
  } else {
    console.log(`[sync] DB has ${count} products on startup — skipping blocking sync`);
  }
}

// Start
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`ORJN Concierge server running on port ${PORT}`);

  // Non-blocking initial sync + periodic re-sync
  if (hasLiveShopifyStore) {
    if (!hasLiveShopifyStore) {
      console.warn("[sync] WARNING: No Shopify store configured. Sync will not run.");
    }
    // Warm the Storefront token on boot (client_credentials flow if creds present)
    ensureManagedStorefrontAccessToken(env.SHOPIFY_STORE_DOMAIN)
      .then((t) => console.log("[shopify] Storefront token ready:", Boolean(t)))
      .catch((e) => console.error("[shopify] Storefront token warmup failed:", e));

    refreshAllInstalledAdminTokens().catch((error) =>
      console.error("[shopify] startup admin token refresh failed:", error)
    );

    // If DB is empty, block until sync completes; then fire initial sync (in-flight dedup avoids double work).
    runStartupSyncIfNeeded().finally(() => {
      runCatalogSync("initial").catch(() => {});
    });

    scheduleDaily3amSync();

    const intervalMs = env.SYNC_INTERVAL_MINUTES * 60 * 1000;
    setInterval(() => {
      runCatalogSync("periodic").catch(() => {
        // logging handled inside runCatalogSync
      });
    }, intervalMs);

    setInterval(() => {
      ensureCatalogFreshness().catch((error) =>
        console.error("[sync] freshness watchdog failed:", error)
      );
    }, 60 * 60 * 1000);

    // Re-warm Storefront token every 23h (tokens expire at 24h)
    setInterval(() => {
      ensureManagedStorefrontAccessToken(env.SHOPIFY_STORE_DOMAIN).catch((e) =>
        console.error("[shopify] periodic Storefront token refresh failed:", e)
      );
    }, 23 * 60 * 60 * 1000);

    setInterval(() => {
      refreshAllInstalledAdminTokens().catch((error) =>
        console.error("[shopify] periodic admin token refresh failed:", error)
      );
    }, 24 * 60 * 60 * 1000);
  }
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
