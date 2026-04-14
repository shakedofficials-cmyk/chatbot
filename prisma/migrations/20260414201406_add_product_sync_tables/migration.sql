-- CreateTable
CREATE TABLE "SyncProduct" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "options" TEXT NOT NULL DEFAULT '[]',
    "minPrice" DECIMAL(10,2) NOT NULL,
    "maxPrice" DECIMAL(10,2) NOT NULL,
    "priceCurrency" TEXT NOT NULL DEFAULT 'USD',
    "fitProfile" TEXT,
    "trueToSizeNote" TEXT,
    "authenticityNote" TEXT,
    "styleTags" TEXT,
    "materialSummary" TEXT,
    "recommendedUse" TEXT,
    "compareHighlights" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "availableForSale" BOOLEAN NOT NULL DEFAULT false,
    "quantityAvailable" INTEGER,
    "priceAmount" DECIMAL(10,2) NOT NULL,
    "priceCurrency" TEXT NOT NULL DEFAULT 'USD',
    "compareAtPrice" DECIMAL(10,2),
    "compareAtCurrency" TEXT,
    "selectedOptions" TEXT NOT NULL DEFAULT '[]',
    "imageUrl" TEXT,
    "imageAltText" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "productsTotal" INTEGER NOT NULL DEFAULT 0,
    "productsUpserted" INTEGER NOT NULL DEFAULT 0,
    "productsDeleted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncProduct_handle_key" ON "SyncProduct"("handle");

-- CreateIndex
CREATE INDEX "SyncProduct_vendor_idx" ON "SyncProduct"("vendor");

-- CreateIndex
CREATE INDEX "SyncProduct_productType_idx" ON "SyncProduct"("productType");

-- CreateIndex
CREATE INDEX "SyncProduct_minPrice_idx" ON "SyncProduct"("minPrice");

-- CreateIndex
CREATE INDEX "SyncProductVariant_productId_idx" ON "SyncProductVariant"("productId");

-- CreateIndex
CREATE INDEX "SyncProductImage_productId_idx" ON "SyncProductImage"("productId");

-- AddForeignKey
ALTER TABLE "SyncProductVariant" ADD CONSTRAINT "SyncProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SyncProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncProductImage" ADD CONSTRAINT "SyncProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SyncProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
