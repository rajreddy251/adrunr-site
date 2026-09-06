-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'SHOPPING_CAMPAIGN_DRAFT';

-- AlterEnum
ALTER TYPE "CampaignOpKind" ADD VALUE 'SHOPPING_CREATE';

-- CreateEnum
CREATE TYPE "ShoppingDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShoppingBiddingStrategy" AS ENUM ('MANUAL_CPC', 'MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_ROAS');

-- CreateEnum
CREATE TYPE "ShoppingTargetType" AS ENUM ('GEO', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "ShoppingPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ShoppingProductGroupKind" AS ENUM ('ALL_PRODUCTS', 'UNIT', 'SUBDIVISION');

-- CreateEnum
CREATE TYPE "ShoppingListingKind" AS ENUM ('ALL_PRODUCTS', 'UNIT');

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "shoppingCampaignDraftId" TEXT;

-- AlterTable
ALTER TABLE "AssistantThread" ADD COLUMN "shoppingDraftId" TEXT;

-- CreateTable
CREATE TABLE "ShoppingCampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT NOT NULL,
    "biddingStrategy" "ShoppingBiddingStrategy" NOT NULL DEFAULT 'MANUAL_CPC',
    "merchantCenterId" TEXT,
    "salesCountry" TEXT NOT NULL DEFAULT 'US',
    "campaignPriority" "ShoppingPriority" NOT NULL DEFAULT 'LOW',
    "enableLocal" BOOLEAN NOT NULL DEFAULT false,
    "targetRoasText" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "statusDraft" "ShoppingDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "googleCampaignResourceName" TEXT,
    "campaignOpId" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingAdGroupDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBidMicros" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "googleAdGroupResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingAdGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingProductGroupDraft" (
    "id" TEXT NOT NULL,
    "adGroupDraftId" TEXT NOT NULL,
    "kind" "ShoppingProductGroupKind" NOT NULL,
    "valueText" TEXT NOT NULL,
    "dimensionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "googleListingGroupResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingProductGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListingDraft" (
    "id" TEXT NOT NULL,
    "adGroupDraftId" TEXT NOT NULL,
    "kind" "ShoppingListingKind" NOT NULL,
    "valueText" TEXT NOT NULL,
    "dimensionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingListingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "ShoppingTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShoppingCampaignDraft_organizationId_statusDraft_idx" ON "ShoppingCampaignDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "ShoppingCampaignDraft_clientId_idx" ON "ShoppingCampaignDraft"("clientId");

-- CreateIndex
CREATE INDEX "ShoppingCampaignDraft_externalAccountId_idx" ON "ShoppingCampaignDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "ShoppingCampaignDraft_createdById_idx" ON "ShoppingCampaignDraft"("createdById");

-- CreateIndex
CREATE INDEX "ShoppingAdGroupDraft_draftId_sortOrder_idx" ON "ShoppingAdGroupDraft"("draftId", "sortOrder");

-- CreateIndex
CREATE INDEX "ShoppingProductGroupDraft_adGroupDraftId_kind_idx" ON "ShoppingProductGroupDraft"("adGroupDraftId", "kind");

-- CreateIndex
CREATE INDEX "ShoppingListingDraft_adGroupDraftId_kind_idx" ON "ShoppingListingDraft"("adGroupDraftId", "kind");

-- CreateIndex
CREATE INDEX "ShoppingTargetDraft_draftId_type_idx" ON "ShoppingTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "CampaignOp_shoppingCampaignDraftId_idx" ON "CampaignOp"("shoppingCampaignDraftId");

-- CreateIndex
CREATE INDEX "AssistantThread_clientId_shoppingDraftId_idx" ON "AssistantThread"("clientId", "shoppingDraftId");

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_shoppingCampaignDraftId_fkey" FOREIGN KEY ("shoppingCampaignDraftId") REFERENCES "ShoppingCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCampaignDraft" ADD CONSTRAINT "ShoppingCampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCampaignDraft" ADD CONSTRAINT "ShoppingCampaignDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCampaignDraft" ADD CONSTRAINT "ShoppingCampaignDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCampaignDraft" ADD CONSTRAINT "ShoppingCampaignDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingAdGroupDraft" ADD CONSTRAINT "ShoppingAdGroupDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ShoppingCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingProductGroupDraft" ADD CONSTRAINT "ShoppingProductGroupDraft_adGroupDraftId_fkey" FOREIGN KEY ("adGroupDraftId") REFERENCES "ShoppingAdGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListingDraft" ADD CONSTRAINT "ShoppingListingDraft_adGroupDraftId_fkey" FOREIGN KEY ("adGroupDraftId") REFERENCES "ShoppingAdGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingTargetDraft" ADD CONSTRAINT "ShoppingTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ShoppingCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_shoppingDraftId_fkey" FOREIGN KEY ("shoppingDraftId") REFERENCES "ShoppingCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
