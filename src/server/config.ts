import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SHOPIFY_STORE_DOMAIN: z.string().default("demo.myshopify.com"),
  SHOPIFY_PUBLIC_STORE_URL: z.string().default(""),
  SHOPIFY_STOREFRONT_ACCESS_TOKEN: z.string().default(""),
  SHOPIFY_API_KEY: z.string().default(""),
  SHOPIFY_API_SECRET: z.string().default(""),
  SHOPIFY_CLIENT_ID: z.string().default(""),
  SHOPIFY_CLIENT_SECRET: z.string().default(""),
  SHOPIFY_APP_URL: z.string().default(""),
  SHOPIFY_AUTH_SCOPES: z
    .string()
    .default(
      [
        "read_products",
        "read_inventory",
        "unauthenticated_read_product_listings",
        "unauthenticated_read_product_inventory",
        "unauthenticated_read_checkouts",
        "unauthenticated_write_checkouts",
      ].join(",")
    ),
  SHOPIFY_STOREFRONT_TOKEN_TITLE: z.string().default("ORJN Concierge Storefront"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5432/orjn_concierge?schema=public"),
  REDIS_URL: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("*"),
  SYNC_SECRET: z.string().optional(),
  RETRIEVAL_DEBUG_SECRET: z.string().optional(),
  SYNC_INTERVAL_MINUTES: z.coerce.number().default(0),
  SYNC_STALE_AFTER_HOURS: z.coerce.number().default(24),
  SHOPIFY_ADMIN_ACCESS_TOKEN: z.string().default(""),
  SHOPIFY_WEBHOOK_SECRET: z.string().default(""),
  WHATSAPP_NUMBER: z.string().default(""),
  ANALYTICS_SECRET: z.string().default(""),
});

export const env = envSchema.parse(process.env);

export const shopifyClientId = env.SHOPIFY_CLIENT_ID || env.SHOPIFY_API_KEY;
export const shopifyClientSecret = env.SHOPIFY_CLIENT_SECRET || env.SHOPIFY_API_SECRET;
export const hasShopifyClientCredentials = Boolean(shopifyClientId && shopifyClientSecret);

export const hasLiveShopifyStore =
  env.SHOPIFY_STORE_DOMAIN.trim().toLowerCase() !== "demo.myshopify.com";

export const hasShopifyOAuthConfig = Boolean(
  shopifyClientId && shopifyClientSecret && env.SHOPIFY_APP_URL
);

export const usesMockShopify = !hasLiveShopifyStore;

const usesDefaultDatabaseUrl = env.DATABASE_URL.includes(
  "postgresql://postgres:postgres@localhost:5432/orjn_concierge"
);

if (env.NODE_ENV === "production") {
  if (!env.OPENAI_API_KEY) {
    console.warn("WARNING: OPENAI_API_KEY is missing. Chat will use the mock orchestrator.");
  }
  if (!hasLiveShopifyStore) {
    console.warn("WARNING: SHOPIFY_STORE_DOMAIN is using the demo default.");
  }
  if (usesDefaultDatabaseUrl) {
    console.warn("WARNING: DATABASE_URL is using the local default.");
  }
  if (env.CORS_ORIGIN === "*") {
    console.warn("WARNING: CORS_ORIGIN is set to * in production.");
  }
  if (!env.SYNC_SECRET) {
    console.warn("WARNING: SYNC_SECRET is missing. Manual sync endpoints are unprotected.");
  }
  if (!env.SHOPIFY_WEBHOOK_SECRET) {
    console.warn("WARNING: SHOPIFY_WEBHOOK_SECRET is missing. Product webhooks are unverified.");
  }
  if (!env.SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
    console.warn(
      "WARNING: SHOPIFY_STOREFRONT_ACCESS_TOKEN is missing. Storefront cart requests can still work tokenless, but token-gated Storefront fields rely on either this env var or an installed Shopify app token."
    );
  } else if (shopifyClientSecret && env.SHOPIFY_STOREFRONT_ACCESS_TOKEN === shopifyClientSecret) {
    console.warn(
      "WARNING: SHOPIFY_STOREFRONT_ACCESS_TOKEN appears to match the Shopify client secret. Storefront API calls may fail and fall back where possible."
    );
  }

  if (!hasShopifyOAuthConfig) {
    console.warn(
      "WARNING: Shopify OAuth config is incomplete. Set SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and SHOPIFY_APP_URL to enable install callback handling and token refresh."
    );
  }
}

export const aiProvider: "openai" | "mock" = env.OPENAI_API_KEY ? "openai" : "mock";
