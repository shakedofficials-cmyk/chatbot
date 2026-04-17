import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SHOPIFY_STORE_DOMAIN: z.string().default("demo.myshopify.com"),
  SHOPIFY_STOREFRONT_ACCESS_TOKEN: z.string().default(""),
  SHOPIFY_API_KEY: z.string().default(""),
  SHOPIFY_API_SECRET: z.string().default(""),
  // Aliases used by new Dev Dashboard apps (same values, different names)
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
  SYNC_INTERVAL_MINUTES: z.coerce.number().default(15),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production" && env.CORS_ORIGIN === "*") {
  console.warn(
    "WARNING: CORS_ORIGIN is set to * in production. Set it to your Shopify store domain (e.g. https://your-store.myshopify.com)."
  );
}

export const hasLiveShopifyStore =
  env.SHOPIFY_STORE_DOMAIN.trim().toLowerCase() !== "demo.myshopify.com";

export const hasShopifyOAuthConfig = Boolean(
  env.SHOPIFY_API_KEY && env.SHOPIFY_API_SECRET && env.SHOPIFY_APP_URL
);

// Effective client credentials — prefer the explicit CLIENT_ID/SECRET vars,
// fall back to the legacy API_KEY/API_SECRET names.
export const shopifyClientId = env.SHOPIFY_CLIENT_ID || env.SHOPIFY_API_KEY;
export const shopifyClientSecret = env.SHOPIFY_CLIENT_SECRET || env.SHOPIFY_API_SECRET;
export const hasShopifyClientCredentials = Boolean(shopifyClientId && shopifyClientSecret);

// Dev mode = no real Shopify store configured.
export const usesMockShopify = !hasLiveShopifyStore;

if (env.NODE_ENV === "production") {
  if (!env.SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
    console.warn(
      "WARNING: SHOPIFY_STOREFRONT_ACCESS_TOKEN is missing. Storefront cart requests can still work tokenless, but token-gated Storefront fields rely on either this env var or an installed Shopify app token."
    );
  }

  if (env.SHOPIFY_STORE_DOMAIN === "demo.myshopify.com") {
    console.warn(
      "WARNING: SHOPIFY_STORE_DOMAIN is using the demo default. Live Shopify product requests will not target your merchant store."
    );
  }

  if (!hasShopifyOAuthConfig) {
    console.warn(
      "WARNING: Shopify OAuth config is incomplete. Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET, and SHOPIFY_APP_URL to enable install callback handling and token refresh."
    );
  }
}

// Which AI backend to use
export const aiProvider: "openai" | "mock" = env.OPENAI_API_KEY ? "openai" : "mock";
