import { env } from "../../config.js";
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

interface StorefrontTokenCreateResponse {
  storefront_access_token?: {
    admin_graphql_api_id?: string;
    id?: number | string;
    access_token: string;
    access_scope?: string;
  };
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
  const configuredShop = shopDomain ?? getConfiguredShopDomain();
  if (!configuredShop) return env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || null;

  const installed = await getInstalledShop(configuredShop);
  if (installed?.storefrontAccessToken) {
    return installed.storefrontAccessToken;
  }

  if (!installed) {
    return env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || null;
  }

  const response = await adminRestJson<StorefrontTokenCreateResponse>(configuredShop, "/storefront_access_tokens.json", {
    method: "POST",
    body: JSON.stringify({
      storefront_access_token: {
        title: env.SHOPIFY_STOREFRONT_TOKEN_TITLE,
      },
    }),
  });

  const token = response.storefront_access_token?.access_token;
  if (!token) {
    throw new Error("Shopify did not return a storefront access token.");
  }

  await updateStorefrontToken(configuredShop, {
    accessToken: token,
    tokenId: response.storefront_access_token?.admin_graphql_api_id
      ?? (response.storefront_access_token?.id != null
        ? String(response.storefront_access_token.id)
        : null),
    accessScopes: response.storefront_access_token?.access_scope ?? null,
  });

  return token;
}

export async function getStorefrontAccessToken(shopDomain?: string): Promise<string | null> {
  const configuredShop = shopDomain ?? getConfiguredShopDomain();
  if (!configuredShop) {
    return env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || null;
  }

  const installed = await getInstalledShop(configuredShop);
  return installed?.storefrontAccessToken ?? env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? null;
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
