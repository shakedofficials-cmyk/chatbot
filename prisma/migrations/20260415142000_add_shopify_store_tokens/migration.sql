CREATE TABLE "ShopifyStore" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "adminAccessToken" TEXT NOT NULL,
    "adminAccessTokenExpiresAt" TIMESTAMP(3),
    "adminRefreshToken" TEXT,
    "adminRefreshTokenExpiresAt" TIMESTAMP(3),
    "adminScopes" TEXT NOT NULL DEFAULT '',
    "storefrontAccessToken" TEXT,
    "storefrontAccessTokenId" TEXT,
    "storefrontAccessScopes" TEXT,
    "storefrontTokenCreatedAt" TIMESTAMP(3),
    "lastAdminRefreshAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyStore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopifyStore_shopDomain_key" ON "ShopifyStore"("shopDomain");
CREATE INDEX "ShopifyStore_shopDomain_idx" ON "ShopifyStore"("shopDomain");
CREATE INDEX "ShopifyStore_adminAccessTokenExpiresAt_idx" ON "ShopifyStore"("adminAccessTokenExpiresAt");
CREATE INDEX "ShopifyStore_adminRefreshTokenExpiresAt_idx" ON "ShopifyStore"("adminRefreshTokenExpiresAt");
