-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'DISPLAY_CAMPAIGN_DRAFT';

-- CreateEnum
CREATE TYPE "DisplayDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "DisplayBiddingStrategy" AS ENUM ('MANUAL_CPC', 'MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'TARGET_ROAS');

-- CreateEnum
CREATE TYPE "DisplayTargetType" AS ENUM ('GEO', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "DisplayAudienceKind" AS ENUM ('USER_LIST', 'AFFINITY', 'IN_MARKET', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DisplayAssetKind" AS ENUM ('MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE', 'LOGO', 'YOUTUBE_VIDEO');

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "displayCampaignDraftId" TEXT;

-- AlterTable
ALTER TABLE "AssistantThread" ADD COLUMN "displayDraftId" TEXT;

-- CreateTable
CREATE TABLE "DisplayCampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT NOT NULL,
    "biddingStrategy" "DisplayBiddingStrategy" NOT NULL DEFAULT 'MANUAL_CPC',
    "enhancedCpcEnabled" BOOLEAN NOT NULL DEFAULT false,
    "targetCpaMicros" BIGINT,
    "targetRoasText" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "statusDraft" "DisplayDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "googleCampaignResourceName" TEXT,
    "campaignOpId" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayAdGroupDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBidMicros" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "googleAdGroupResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayAdGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayAdDraft" (
    "id" TEXT NOT NULL,
    "adGroupDraftId" TEXT NOT NULL,
    "headlinesText" TEXT NOT NULL,
    "longHeadline" TEXT NOT NULL,
    "descriptionsText" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "finalUrl" TEXT NOT NULL,
    "googleAdResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayAdDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayAssetDraft" (
    "id" TEXT NOT NULL,
    "adDraftId" TEXT NOT NULL,
    "kind" "DisplayAssetKind" NOT NULL,
    "urlText" TEXT NOT NULL,
    "assetResourceName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayAssetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayAudienceDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "kind" "DisplayAudienceKind" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayAudienceDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "DisplayTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisplayCampaignDraft_organizationId_statusDraft_idx" ON "DisplayCampaignDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "DisplayCampaignDraft_clientId_idx" ON "DisplayCampaignDraft"("clientId");

-- CreateIndex
CREATE INDEX "DisplayCampaignDraft_externalAccountId_idx" ON "DisplayCampaignDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "DisplayCampaignDraft_createdById_idx" ON "DisplayCampaignDraft"("createdById");

-- CreateIndex
CREATE INDEX "DisplayAdGroupDraft_draftId_sortOrder_idx" ON "DisplayAdGroupDraft"("draftId", "sortOrder");

-- CreateIndex
CREATE INDEX "DisplayAdDraft_adGroupDraftId_idx" ON "DisplayAdDraft"("adGroupDraftId");

-- CreateIndex
CREATE INDEX "DisplayAssetDraft_adDraftId_kind_idx" ON "DisplayAssetDraft"("adDraftId", "kind");

-- CreateIndex
CREATE INDEX "DisplayAudienceDraft_draftId_kind_idx" ON "DisplayAudienceDraft"("draftId", "kind");

-- CreateIndex
CREATE INDEX "DisplayTargetDraft_draftId_type_idx" ON "DisplayTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "CampaignOp_displayCampaignDraftId_idx" ON "CampaignOp"("displayCampaignDraftId");

-- CreateIndex
CREATE INDEX "AssistantThread_clientId_displayDraftId_idx" ON "AssistantThread"("clientId", "displayDraftId");

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_displayCampaignDraftId_fkey" FOREIGN KEY ("displayCampaignDraftId") REFERENCES "DisplayCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayCampaignDraft" ADD CONSTRAINT "DisplayCampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayCampaignDraft" ADD CONSTRAINT "DisplayCampaignDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayCampaignDraft" ADD CONSTRAINT "DisplayCampaignDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayCampaignDraft" ADD CONSTRAINT "DisplayCampaignDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayAdGroupDraft" ADD CONSTRAINT "DisplayAdGroupDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DisplayCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayAdDraft" ADD CONSTRAINT "DisplayAdDraft_adGroupDraftId_fkey" FOREIGN KEY ("adGroupDraftId") REFERENCES "DisplayAdGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayAssetDraft" ADD CONSTRAINT "DisplayAssetDraft_adDraftId_fkey" FOREIGN KEY ("adDraftId") REFERENCES "DisplayAdDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayAudienceDraft" ADD CONSTRAINT "DisplayAudienceDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DisplayCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayTargetDraft" ADD CONSTRAINT "DisplayTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DisplayCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_displayDraftId_fkey" FOREIGN KEY ("displayDraftId") REFERENCES "DisplayCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
