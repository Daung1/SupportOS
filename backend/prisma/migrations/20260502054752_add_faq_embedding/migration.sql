-- CreateTable
CREATE TABLE "FAQEmbedding" (
    "faqId" TEXT NOT NULL,
    "vector" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FAQEmbedding_pkey" PRIMARY KEY ("faqId")
);

-- CreateIndex
CREATE INDEX "FAQEmbedding_model_idx" ON "FAQEmbedding"("model");
