import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SHOPIFY_STORE_DOMAIN: z.string().default("demo.myshopify.com"),
  SHOPIFY_STOREFRONT_ACCESS_TOKEN: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5432/orjn_concierge?schema=public"),
  REDIS_URL: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("*"),
  SYNC_SECRET: z.string().optional(),
  SYNC_INTERVAL_MINUTES: z.coerce.number().default(15),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production" && env.CORS_ORIGIN === "*") {
  console.warn(
    "WARNING: CORS_ORIGIN is set to * in production. Set it to your Shopify store domain (e.g. https://your-store.myshopify.com)."
  );
}

// Dev mode = no Shopify credentials (use mock products)
export const usesMockShopify = !env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

if (env.NODE_ENV === "production") {
  if (!env.SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
    console.warn(
      "WARNING: SHOPIFY_STOREFRONT_ACCESS_TOKEN is missing. Product and cart actions will use mock Shopify data."
    );
  }

  if (env.SHOPIFY_STORE_DOMAIN === "demo.myshopify.com") {
    console.warn(
      "WARNING: SHOPIFY_STORE_DOMAIN is using the demo default. Live Shopify product requests will not target your merchant store."
    );
  }
}

// Which AI backend to use
export const aiProvider: "openai" | "mock" = env.OPENAI_API_KEY ? "openai" : "mock";
