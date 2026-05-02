-- CreateTable
CREATE TABLE "DocumentEmbedding" (
    "docId" TEXT NOT NULL,
    "vector" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentEmbedding_pkey" PRIMARY KEY ("docId")
);

-- CreateIndex
CREATE INDEX "DocumentEmbedding_model_idx" ON "DocumentEmbedding"("model");
