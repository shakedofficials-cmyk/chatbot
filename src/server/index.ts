import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { env } from "./config.js";
import chatRoutes from "./routes/chat.js";
import analyticsRoutes from "./routes/analytics.js";

const app = express();

// ── Middleware ──
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "100kb" }));

// Rate limiting — 30 chat messages per minute per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many requests. Please slow down." },
});

// ── Routes ──
app.use("/api/chat", chatLimiter, chatRoutes);
app.use("/api/analytics", analyticsRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start ──
app.listen(env.PORT, () => {
  console.log(`ORJN Concierge server running on port ${env.PORT}`);
});
