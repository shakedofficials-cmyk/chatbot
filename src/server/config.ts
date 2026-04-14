import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SHOPIFY_STORE_DOMAIN: z.string().default("demo.myshopify.com"),
  SHOPIFY_STOREFRONT_ACCESS_TOKEN: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  DATABASE_URL: z.string().default("file:./prisma/dev.db"),
  REDIS_URL: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("*"),
});

export const env = envSchema.parse(process.env);

export const isDevMode =
  env.NODE_ENV === "development" &&
  (!env.ANTHROPIC_API_KEY || !env.SHOPIFY_STOREFRONT_ACCESS_TOKEN);
