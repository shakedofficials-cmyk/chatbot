import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SHOPIFY_STORE_DOMAIN: z.string().default("demo.myshopify.com"),
  SHOPIFY_STOREFRONT_ACCESS_TOKEN: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  DATABASE_URL: z.string().default("file:./prisma/dev.db"),
  REDIS_URL: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("*"),
});

export const env = envSchema.parse(process.env);

// Dev mode = no Shopify credentials (use mock products)
export const usesMockShopify = !env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

// Which AI backend to use
export const aiProvider: "openai" | "mock" = env.OPENAI_API_KEY ? "openai" : "mock";
