import { prisma } from "../../db/client.js";
import { env, hasLiveShopifyStore } from "../../config.js";

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export interface ShopifyInstallationInput {
  shopDomain: string;
  adminAccessToken: string;
  adminAccessTokenExpiresAt?: Date | null;
  adminRefreshToken?: string | null;
  adminRefreshTokenExpiresAt?: Date | null;
  adminScopes?: string;
  storefrontAccessToken?: string | null;
  storefrontAccessTokenId?: string | null;
  storefrontAccessScopes?: string | null;
  storefrontTokenCreatedAt?: Date | null;
  lastAdminRefreshAt?: Date | null;
}

export function normalizeShopDomain(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidShopDomain(value: string): boolean {
  return SHOP_DOMAIN_PATTERN.test(normalizeShopDomain(value));
}

export function assertValidShopDomain(value: string): string {
  const normalized = normalizeShopDomain(value);
  if (!isValidShopDomain(normalized)) {
    throw new Error(`Invalid Shopify shop domain: ${value}`);
  }
  return normalized;
}

export function getConfiguredShopDomain(): string | null {
  return hasLiveShopifyStore ? normalizeShopDomain(env.SHOPIFY_STORE_DOMAIN) : null;
}

export async function getInstalledShop(shopDomain: string) {
  return prisma.shopifyStore.findUnique({
    where: { shopDomain: assertValidShopDomain(shopDomain) },
  });
}

export async function listInstalledShops() {
  return prisma.shopifyStore.findMany({
    orderBy: { updatedAt: "desc" },
  });
}

export async function getPrimaryInstalledShop() {
  const configured = getConfiguredShopDomain();
  if (configured) {
    return getInstalledShop(configured);
  }

  return prisma.shopifyStore.findFirst({
    orderBy: { updatedAt: "desc" },
  });
}

export async function upsertInstalledShop(input: ShopifyInstallationInput) {
  const shopDomain = assertValidShopDomain(input.shopDomain);

  return prisma.shopifyStore.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      adminAccessToken: input.adminAccessToken,
      adminAccessTokenExpiresAt: input.adminAccessTokenExpiresAt ?? null,
      adminRefreshToken: input.adminRefreshToken ?? null,
      adminRefreshTokenExpiresAt: input.adminRefreshTokenExpiresAt ?? null,
      adminScopes: input.adminScopes ?? "",
      storefrontAccessToken: input.storefrontAccessToken ?? null,
      storefrontAccessTokenId: input.storefrontAccessTokenId ?? null,
      storefrontAccessScopes: input.storefrontAccessScopes ?? null,
      storefrontTokenCreatedAt: input.storefrontTokenCreatedAt ?? null,
      lastAdminRefreshAt: input.lastAdminRefreshAt ?? null,
    },
    update: {
      adminAccessToken: input.adminAccessToken,
      adminAccessTokenExpiresAt: input.adminAccessTokenExpiresAt ?? null,
      ...(input.adminRefreshToken !== undefined
        ? { adminRefreshToken: input.adminRefreshToken }
        : {}),
      adminRefreshTokenExpiresAt: input.adminRefreshTokenExpiresAt ?? null,
      adminScopes: input.adminScopes ?? "",
      ...(input.storefrontAccessToken !== undefined
        ? { storefrontAccessToken: input.storefrontAccessToken }
        : {}),
      ...(input.storefrontAccessTokenId !== undefined
        ? { storefrontAccessTokenId: input.storefrontAccessTokenId }
        : {}),
      ...(input.storefrontAccessScopes !== undefined
        ? { storefrontAccessScopes: input.storefrontAccessScopes }
        : {}),
      ...(input.storefrontTokenCreatedAt !== undefined
        ? { storefrontTokenCreatedAt: input.storefrontTokenCreatedAt }
        : {}),
      ...(input.lastAdminRefreshAt !== undefined
        ? { lastAdminRefreshAt: input.lastAdminRefreshAt }
        : {}),
    },
  });
}

export async function updateStorefrontToken(
  shopDomain: string,
  token: {
    accessToken: string;
    tokenId?: string | null;
    accessScopes?: string | null;
  }
) {
  return prisma.shopifyStore.update({
    where: { shopDomain: assertValidShopDomain(shopDomain) },
    data: {
      storefrontAccessToken: token.accessToken,
      storefrontAccessTokenId: token.tokenId ?? null,
      storefrontAccessScopes: token.accessScopes ?? null,
      storefrontTokenCreatedAt: new Date(),
    },
  });
}

export async function clearStorefrontToken(shopDomain: string) {
  return prisma.shopifyStore.update({
    where: { shopDomain: assertValidShopDomain(shopDomain) },
    data: {
      storefrontAccessToken: null,
      storefrontAccessTokenId: null,
      storefrontAccessScopes: null,
      storefrontTokenCreatedAt: null,
    },
  });
}
