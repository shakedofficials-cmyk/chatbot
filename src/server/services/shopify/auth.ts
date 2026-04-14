import crypto from "node:crypto";
import { env, hasShopifyOAuthConfig } from "../../config.js";
import { assertValidShopDomain } from "./installations.js";

const STATE_MAX_AGE_MS = 15 * 60 * 1000;

interface OAuthTokenResponse {
  access_token: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

function getAppBaseUrl(): string {
  const base = env.SHOPIFY_APP_URL.trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("SHOPIFY_APP_URL is required for Shopify OAuth routes.");
  }
  return base;
}

function getOAuthSecret(): string {
  if (!env.SHOPIFY_API_SECRET) {
    throw new Error("SHOPIFY_API_SECRET is required for Shopify OAuth.");
  }
  return env.SHOPIFY_API_SECRET;
}

function getOAuthClientId(): string {
  if (!env.SHOPIFY_API_KEY) {
    throw new Error("SHOPIFY_API_KEY is required for Shopify OAuth.");
  }
  return env.SHOPIFY_API_KEY;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", getOAuthSecret()).update(value).digest("hex");
}

function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function ensureShopifyOAuthConfig(): void {
  if (!hasShopifyOAuthConfig) {
    throw new Error(
      "Shopify OAuth config is incomplete. Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET, and SHOPIFY_APP_URL."
    );
  }
}

export function getOAuthRedirectUri(): string {
  return `${getAppBaseUrl()}/auth/callback`;
}

export function buildAuthState(shopDomain: string): string {
  const payload = JSON.stringify({
    nonce: crypto.randomBytes(16).toString("hex"),
    shop: assertValidShopDomain(shopDomain),
    issuedAt: Date.now(),
  });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAuthState(state: string, expectedShopDomain: string): boolean {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return false;
  if (!secureCompare(sign(encoded), signature)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      shop?: string;
      issuedAt?: number;
    };

    if (parsed.shop !== assertValidShopDomain(expectedShopDomain)) {
      return false;
    }

    if (!parsed.issuedAt || Date.now() - parsed.issuedAt > STATE_MAX_AGE_MS) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function verifyOAuthCallbackHmac(params: URLSearchParams): boolean {
  const providedHmac = params.get("hmac");
  if (!providedHmac) return false;

  const message = Array.from(params.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return secureCompare(sign(message), providedHmac);
}

export function buildInstallUrl(shopDomain: string): string {
  ensureShopifyOAuthConfig();
  const shop = assertValidShopDomain(shopDomain);
  const scopes = env.SHOPIFY_AUTH_SCOPES.split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(",");
  const state = buildAuthState(shop);
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", getOAuthClientId());
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", getOAuthRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

function toDateFromSeconds(seconds: number | undefined): Date | null {
  if (!seconds || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000);
}

async function postOAuthToken(
  shopDomain: string,
  formBody: Record<string, string>
): Promise<OAuthTokenResponse> {
  const shop = assertValidShopDomain(shopDomain);
  const body = new URLSearchParams(formBody);
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Shopify OAuth error: ${response.status} ${response.statusText} ${text}`.trim());
  }

  return (await response.json()) as OAuthTokenResponse;
}

export async function exchangeAuthCodeForOfflineToken(shopDomain: string, code: string) {
  ensureShopifyOAuthConfig();
  const token = await postOAuthToken(shopDomain, {
    client_id: getOAuthClientId(),
    client_secret: getOAuthSecret(),
    code,
    expiring: "1",
  });

  return {
    accessToken: token.access_token,
    accessTokenExpiresAt: toDateFromSeconds(token.expires_in),
    refreshToken: token.refresh_token ?? null,
    refreshTokenExpiresAt: toDateFromSeconds(token.refresh_token_expires_in),
    scopes: token.scope ?? "",
  };
}

export async function refreshOfflineAccessToken(shopDomain: string, refreshToken: string) {
  ensureShopifyOAuthConfig();
  const token = await postOAuthToken(shopDomain, {
    client_id: getOAuthClientId(),
    client_secret: getOAuthSecret(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  return {
    accessToken: token.access_token,
    accessTokenExpiresAt: toDateFromSeconds(token.expires_in),
    refreshToken: token.refresh_token ?? refreshToken,
    refreshTokenExpiresAt: toDateFromSeconds(token.refresh_token_expires_in),
    scopes: token.scope ?? "",
  };
}
