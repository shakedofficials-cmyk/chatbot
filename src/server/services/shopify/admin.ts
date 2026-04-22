import { env, hasShopifyClientCredentials, shopifyClientId, shopifyClientSecret } from "../../config.js";
import { refreshOfflineAccessToken } from "./auth.js";
import {
  assertValidShopDomain,
  getConfiguredShopDomain,
  getInstalledShop,
  listInstalledShops,
  updateStorefrontToken,
  upsertInstalledShop,
} from "./installations.js";

const ADMIN_API_VERSION = "2026-04";
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface StorefrontTokenCreateResponse {
  storefront_access_token?: {
    admin_graphql_api_id?: string;
    id?: number | string;
    access_token: string;
    access_scope?: string;
  };
}

let clientCredentialsCache: TokenCache | null = null;

async function fetchClientCredentialsAdminToken(shopDomain: string): Promise<string> {
  const url = `https://${shopDomain}/admin/oauth/access_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: shopifyClientId,
      client_secret: shopifyClientSecret,
      grant_type: "client_credentials",
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Shopify client_credentials token request failed: ${res.status} ${res.statusText} ${body}`.trim()
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Shopify client_credentials response missing access_token");
  }

  const expiresIn = data.expires_in ?? 86400;
  clientCredentialsCache = {
    token: data.access_token,
    expiresAt: Date.now() + (expiresIn - 300) * 1000,
  };

  console.log("[shopify] client_credentials admin token refreshed", {
    shopDomain,
    expiresInSeconds: expiresIn,
  });

  return data.access_token;
}

export async function getOrRefreshClientCredentialsToken(shopDomain: string): Promise<string | null> {
  if (!hasShopifyClientCredentials) return null;

  if (clientCredentialsCache && Date.now() < clientCredentialsCache.expiresAt) {
    return clientCredentialsCache.token;
  }

  try {
    return await fetchClientCredentialsAdminToken(shopDomain);
  } catch (error) {
    console.error("[shopify] client_credentials token refresh failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function isTokenExpiringSoon(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() <= TOKEN_REFRESH_SKEW_MS;
}

export async function getValidAdminAccessToken(shopDomain: string): Promise<string | null> {
  const shop = await getInstalledShop(shopDomain);
  if (!shop) return null;

  if (!isTokenExpiringSoon(shop.adminAccessTokenExpiresAt)) {
    return shop.adminAccessToken;
  }

  if (!shop.adminRefreshToken) {
    return shop.adminAccessToken;
  }

  const refreshed = await refreshOfflineAccessToken(shop.shopDomain, shop.adminRefreshToken);
  const updated = await upsertInstalledShop({
    shopDomain: shop.shopDomain,
    adminAccessToken: refreshed.accessToken,
    adminAccessTokenExpiresAt: refreshed.accessTokenExpiresAt,
    adminRefreshToken: refreshed.refreshToken,
    adminRefreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
    adminScopes: refreshed.scopes || shop.adminScopes,
    storefrontAccessToken: shop.storefrontAccessToken,
    storefrontAccessTokenId: shop.storefrontAccessTokenId,
    storefrontAccessScopes: shop.storefrontAccessScopes,
    storefrontTokenCreatedAt: shop.storefrontTokenCreatedAt,
    lastAdminRefreshAt: new Date(),
  });

  return updated.adminAccessToken;
}

export async function adminRestJson<T>(
  shopDomain: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const shop = assertValidShopDomain(shopDomain);
  const accessToken = await getValidAdminAccessToken(shop);
  if (!accessToken) {
    throw new Error(`No installed Shopify Admin token for ${shop}`);
  }

  const url = `https://${shop}/admin/api/${ADMIN_API_VERSION}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Shopify Admin API error: ${response.status} ${response.statusText} ${text}`.trim()
    );
  }

  return (await response.json()) as T;
}

export async function ensureManagedStorefrontAccessToken(shopDomain?: string): Promise<string | null> {
  if (env.SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
    return env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  }

  const configuredShop = shopDomain ?? getConfiguredShopDomain();
  if (!configuredShop) return null;

  const installed = await getInstalledShop(configuredShop);
  if (installed?.storefrontAccessToken) {
    return installed.storefrontAccessToken;
  }

  const adminToken = installed
    ? await getValidAdminAccessToken(configuredShop)
    : await getOrRefreshClientCredentialsToken(configuredShop);

  if (!adminToken) {
    return null;
  }

  const url = `https://${configuredShop}/admin/api/${ADMIN_API_VERSION}/storefront_access_tokens.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": adminToken,
    },
    body: JSON.stringify({
      storefront_access_token: { title: env.SHOPIFY_STOREFRONT_TOKEN_TITLE },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[shopify] storefront token creation failed", {
      status: response.status,
      body: body.slice(0, 500),
    });
    return null;
  }

  const data = (await response.json()) as StorefrontTokenCreateResponse;
  const token = data.storefront_access_token?.access_token;
  if (!token) {
    throw new Error("Shopify did not return a storefront access token.");
  }

  await updateStorefrontToken(configuredShop, {
    accessToken: token,
    tokenId:
      data.storefront_access_token?.admin_graphql_api_id ??
      (data.storefront_access_token?.id != null
        ? String(data.storefront_access_token.id)
        : null),
    accessScopes: data.storefront_access_token?.access_scope ?? null,
  });

  return token;
}

export async function getStorefrontAccessToken(shopDomain?: string): Promise<string | null> {
  if (env.SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
    return env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  }

  const configuredShop = shopDomain ?? getConfiguredShopDomain();
  if (!configuredShop) {
    return null;
  }

  const installed = await getInstalledShop(configuredShop);
  return installed?.storefrontAccessToken ?? null;
}

export async function getInstalledStorefrontAccessToken(shopDomain?: string): Promise<string | null> {
  const configuredShop = shopDomain ?? getConfiguredShopDomain();
  if (!configuredShop) {
    return null;
  }

  const installed = await getInstalledShop(configuredShop);
  return installed?.storefrontAccessToken ?? null;
}

export async function refreshAllInstalledAdminTokens(): Promise<void> {
  const shops = await listInstalledShops();
  await Promise.all(
    shops.map(async (shop) => {
      if (!shop.adminRefreshToken) return;
      if (!isTokenExpiringSoon(shop.adminAccessTokenExpiresAt)) return;

      try {
        await getValidAdminAccessToken(shop.shopDomain);
      } catch (error) {
        console.error("[shopify] admin token refresh failed", {
          shopDomain: shop.shopDomain,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );
}
