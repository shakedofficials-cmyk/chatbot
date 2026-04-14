import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadAuthModule() {
  vi.resetModules();
  process.env.SHOPIFY_API_KEY = "test-key";
  process.env.SHOPIFY_API_SECRET = "test-secret";
  process.env.SHOPIFY_APP_URL = "https://example.com";
  process.env.SHOPIFY_AUTH_SCOPES = "read_products,unauthenticated_read_product_listings";
  return import("./auth.js");
}

describe("shopify auth helpers", () => {
  beforeEach(() => {
    process.env.SHOPIFY_API_KEY = "test-key";
    process.env.SHOPIFY_API_SECRET = "test-secret";
    process.env.SHOPIFY_APP_URL = "https://example.com";
    process.env.SHOPIFY_AUTH_SCOPES = "read_products,unauthenticated_read_product_listings";
  });

  it("builds and validates signed auth state for the expected shop", async () => {
    const auth = await loadAuthModule();
    const state = auth.buildAuthState("orjn-test.myshopify.com");

    expect(auth.verifyAuthState(state, "orjn-test.myshopify.com")).toBe(true);
    expect(auth.verifyAuthState(state, "other-shop.myshopify.com")).toBe(false);
  });

  it("validates the Shopify callback hmac", async () => {
    const auth = await loadAuthModule();
    const params = new URLSearchParams({
      code: "temporary-code",
      host: "Zm9vLm15c2hvcGlmeS5jb20vc3RvcmUvYWRtaW4=",
      shop: "orjn-test.myshopify.com",
      state: "signed-state",
      timestamp: "1712345678",
    });

    const message = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const hmac = crypto.createHmac("sha256", "test-secret").update(message).digest("hex");
    params.set("hmac", hmac);

    expect(auth.verifyOAuthCallbackHmac(params)).toBe(true);

    params.set("hmac", "bad-signature");
    expect(auth.verifyOAuthCallbackHmac(params)).toBe(false);
  });
});
