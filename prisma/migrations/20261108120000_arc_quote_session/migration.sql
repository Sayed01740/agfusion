CREATE TABLE "ArcQuoteSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArcQuoteSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArcQuoteSession_tokenHash_key" ON "ArcQuoteSession"("tokenHash");
CREATE INDEX "ArcQuoteSession_expiresAt_idx" ON "ArcQuoteSession"("expiresAt");
CREATE INDEX "ArcQuoteSession_account_expiresAt_idx" ON "ArcQuoteSession"("account", "expiresAt");
