CREATE TABLE "ShopperProfile" (
  "shopperId" TEXT NOT NULL,
  "preferences" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopperProfile_pkey" PRIMARY KEY ("shopperId")
);

CREATE INDEX "ShopperProfile_updatedAt_idx" ON "ShopperProfile"("updatedAt");
