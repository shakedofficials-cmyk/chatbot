import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { env } from "./config.js";
import { usesMockShopify } from "./config.js";
import { prisma } from "./db/client.js";
import chatRoutes from "./routes/chat.js";
import analyticsRoutes from "./routes/analytics.js";
import { syncShopifyProducts } from "./services/sync/shopify-sync.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.set("trust proxy", 1);
const widgetDistDir = join(__dirname, "../widget");
const widgetBundlePath = join(widgetDistDir, "orjn-concierge.js");

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
app.use(express.json({ limit: "100kb" }));

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
app.use("/api/analytics", analyticsLimiter, analyticsRoutes);

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
  if (env.SYNC_SECRET && req.headers["x-sync-secret"] !== env.SYNC_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await syncShopifyProducts();
    res.json({ status: "ok", ...result });
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

// Start
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`ORJN Concierge server running on port ${PORT}`);

  // Non-blocking initial sync + periodic re-sync
  if (!usesMockShopify) {
    syncShopifyProducts()
      .then((r) => console.log("[sync] Initial sync complete:", r))
      .catch((e) => console.error("[sync] Initial sync failed:", e));

    const intervalMs = env.SYNC_INTERVAL_MINUTES * 60 * 1000;
    setInterval(() => {
      syncShopifyProducts()
        .then((r) => console.log("[sync] Periodic sync complete:", r))
        .catch((e) => console.error("[sync] Periodic sync failed:", e));
    }, intervalMs);
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
