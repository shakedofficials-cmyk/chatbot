-- AlterTable
ALTER TABLE "SyncProduct"
ADD COLUMN     "category" TEXT,
ADD COLUMN     "normalizedTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "normalizedVendor" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "normalizedType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "modelKey" TEXT,
ADD COLUMN     "silhouette" TEXT,
ADD COLUMN     "colorText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "styleText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sizeText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "embeddingText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "availableVariantCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalVariantCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SyncProductVariant"
ADD COLUMN     "normalizedTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "optionText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sizeValue" TEXT,
ADD COLUMN     "colorValue" TEXT;

-- CreateTable
CREATE TABLE "CatalogEmbedding" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "vector" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "embeddingText" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSynonym" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSynonym_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetrievalLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL DEFAULT '',
    "intent" TEXT NOT NULL,
    "entities" TEXT NOT NULL DEFAULT '{}',
    "hardFilters" TEXT NOT NULL DEFAULT '{}',
    "lexicalCandidates" TEXT NOT NULL DEFAULT '[]',
    "semanticCandidates" TEXT NOT NULL DEFAULT '[]',
    "finalCandidates" TEXT NOT NULL DEFAULT '[]',
    "toolName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetrievalLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncProduct_category_idx" ON "SyncProduct"("category");

-- CreateIndex
CREATE INDEX "SyncProduct_normalizedTitle_idx" ON "SyncProduct"("normalizedTitle");

-- CreateIndex
CREATE INDEX "SyncProduct_normalizedVendor_idx" ON "SyncProduct"("normalizedVendor");

-- CreateIndex
CREATE INDEX "SyncProduct_modelKey_idx" ON "SyncProduct"("modelKey");

-- CreateIndex
CREATE INDEX "SyncProductVariant_sizeValue_idx" ON "SyncProductVariant"("sizeValue");

-- CreateIndex
CREATE INDEX "SyncProductVariant_colorValue_idx" ON "SyncProductVariant"("colorValue");

-- CreateIndex
CREATE INDEX "SyncProductVariant_availableForSale_idx" ON "SyncProductVariant"("availableForSale");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEmbedding_productId_model_key" ON "CatalogEmbedding"("productId", "model");

-- CreateIndex
CREATE INDEX "CatalogEmbedding_productId_idx" ON "CatalogEmbedding"("productId");

-- CreateIndex
CREATE INDEX "CatalogEmbedding_contentHash_idx" ON "CatalogEmbedding"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSynonym_phrase_canonical_kind_key" ON "CatalogSynonym"("phrase", "canonical", "kind");

-- CreateIndex
CREATE INDEX "CatalogSynonym_phrase_idx" ON "CatalogSynonym"("phrase");

-- CreateIndex
CREATE INDEX "CatalogSynonym_canonical_idx" ON "CatalogSynonym"("canonical");

-- CreateIndex
CREATE INDEX "CatalogSynonym_kind_idx" ON "CatalogSynonym"("kind");

-- CreateIndex
CREATE INDEX "RetrievalLog_sessionId_idx" ON "RetrievalLog"("sessionId");

-- CreateIndex
CREATE INDEX "RetrievalLog_intent_idx" ON "RetrievalLog"("intent");

-- CreateIndex
CREATE INDEX "RetrievalLog_createdAt_idx" ON "RetrievalLog"("createdAt");

-- AddForeignKey
ALTER TABLE "CatalogEmbedding" ADD CONSTRAINT "CatalogEmbedding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SyncProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
