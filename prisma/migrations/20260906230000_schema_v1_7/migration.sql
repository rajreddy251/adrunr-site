-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'DEMAND_GEN_CAMPAIGN_DRAFT';

-- AlterEnum
ALTER TYPE "CampaignOpKind" ADD VALUE 'DEMAND_GEN_CREATE';

-- CreateEnum
CREATE TYPE "DemandGenDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "DemandGenBiddingStrategy" AS ENUM ('MAXIMIZE_CONVERSIONS', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_CPA', 'TARGET_ROAS');

-- CreateEnum
CREATE TYPE "DemandGenTargetType" AS ENUM ('GEO', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "DemandGenAudienceKind" AS ENUM ('USER_LIST', 'AFFINITY', 'IN_MARKET', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DemandGenAssetKind" AS ENUM ('MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE', 'PORTRAIT_MARKETING_IMAGE', 'LOGO', 'YOUTUBE_VIDEO');

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "demandGenCampaignDraftId" TEXT;

-- AlterTable
ALTER TABLE "AssistantThread" ADD COLUMN "demandGenDraftId" TEXT;

-- CreateTable
CREATE TABLE "DemandGenCampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT NOT NULL,
    "biddingStrategy" "DemandGenBiddingStrategy" NOT NULL DEFAULT 'MAXIMIZE_CONVERSIONS',
    "targetCpaMicros" BIGINT,
    "targetRoasText" TEXT,
    "youtubeInStream" BOOLEAN NOT NULL DEFAULT true,
    "youtubeInFeed" BOOLEAN NOT NULL DEFAULT true,
    "youtubeShorts" BOOLEAN NOT NULL DEFAULT true,
    "discover" BOOLEAN NOT NULL DEFAULT true,
    "gmail" BOOLEAN NOT NULL DEFAULT true,
    "display" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TEXT,
    "endDate" TEXT,
    "statusDraft" "DemandGenDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "googleCampaignResourceName" TEXT,
    "campaignOpId" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandGenCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandGenAdGroupDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBidMicros" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "googleAdGroupResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandGenAdGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandGenAdDraft" (
    "id" TEXT NOT NULL,
    "adGroupDraftId" TEXT NOT NULL,
    "headlinesText" TEXT NOT NULL,
    "descriptionsText" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "finalUrl" TEXT NOT NULL,
    "callToActionText" TEXT,
    "googleAdResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandGenAdDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandGenAssetDraft" (
    "id" TEXT NOT NULL,
    "adDraftId" TEXT NOT NULL,
    "kind" "DemandGenAssetKind" NOT NULL,
    "urlText" TEXT NOT NULL,
    "assetResourceName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandGenAssetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandGenAudienceDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "kind" "DemandGenAudienceKind" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandGenAudienceDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandGenTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "DemandGenTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandGenTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandGenCampaignDraft_organizationId_statusDraft_idx" ON "DemandGenCampaignDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "DemandGenCampaignDraft_clientId_idx" ON "DemandGenCampaignDraft"("clientId");

-- CreateIndex
CREATE INDEX "DemandGenCampaignDraft_externalAccountId_idx" ON "DemandGenCampaignDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "DemandGenCampaignDraft_createdById_idx" ON "DemandGenCampaignDraft"("createdById");

-- CreateIndex
CREATE INDEX "DemandGenAdGroupDraft_draftId_sortOrder_idx" ON "DemandGenAdGroupDraft"("draftId", "sortOrder");

-- CreateIndex
CREATE INDEX "DemandGenAdDraft_adGroupDraftId_idx" ON "DemandGenAdDraft"("adGroupDraftId");

-- CreateIndex
CREATE INDEX "DemandGenAssetDraft_adDraftId_kind_idx" ON "DemandGenAssetDraft"("adDraftId", "kind");

-- CreateIndex
CREATE INDEX "DemandGenAudienceDraft_draftId_kind_idx" ON "DemandGenAudienceDraft"("draftId", "kind");

-- CreateIndex
CREATE INDEX "DemandGenTargetDraft_draftId_type_idx" ON "DemandGenTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "CampaignOp_demandGenCampaignDraftId_idx" ON "CampaignOp"("demandGenCampaignDraftId");

-- CreateIndex
CREATE INDEX "AssistantThread_clientId_demandGenDraftId_idx" ON "AssistantThread"("clientId", "demandGenDraftId");

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_demandGenCampaignDraftId_fkey" FOREIGN KEY ("demandGenCampaignDraftId") REFERENCES "DemandGenCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandGenCampaignDraft" ADD CONSTRAINT "DemandGenCampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandGenCampaignDraft" ADD CONSTRAINT "DemandGenCampaignDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandGenCampaignDraft" ADD CONSTRAINT "DemandGenCampaignDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandGenCampaignDraft" ADD CONSTRAINT "DemandGenCampaignDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandGenAdGroupDraft" ADD CONSTRAINT "DemandGenAdGroupDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DemandGenCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandGenAdDraft" ADD CONSTRAINT "DemandGenAdDraft_adGroupDraftId_fkey" FOREIGN KEY ("adGroupDraftId") REFERENCES "DemandGenAdGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandGenAssetDraft" ADD CONSTRAINT "DemandGenAssetDraft_adDraftId_fkey" FOREIGN KEY ("adDraftId") REFERENCES "DemandGenAdDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandGenAudienceDraft" ADD CONSTRAINT "DemandGenAudienceDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DemandGenCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandGenTargetDraft" ADD CONSTRAINT "DemandGenTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DemandGenCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_demandGenDraftId_fkey" FOREIGN KEY ("demandGenDraftId") REFERENCES "DemandGenCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
