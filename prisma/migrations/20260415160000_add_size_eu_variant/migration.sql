-- AlterTable: add normalised EU size column for reliable size filtering
ALTER TABLE "SyncProductVariant" ADD COLUMN "sizeEU" DECIMAL(5,1);

-- CreateIndex
CREATE INDEX "SyncProductVariant_sizeEU_idx" ON "SyncProductVariant"("sizeEU");
