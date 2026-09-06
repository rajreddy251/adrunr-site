-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'SEARCH_CAMPAIGN_DRAFT';

-- CreateEnum
CREATE TYPE "SearchDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "SearchKeywordMatchType" AS ENUM ('BROAD', 'PHRASE', 'EXACT');

-- CreateEnum
CREATE TYPE "SearchTargetType" AS ENUM ('GEO', 'LANGUAGE', 'AUDIENCE', 'SCHEDULE', 'DEVICE');

-- CreateEnum
CREATE TYPE "SearchBiddingStrategy" AS ENUM ('MANUAL_CPC', 'MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'TARGET_ROAS');

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "googleCampaignResourceName" TEXT;
ALTER TABLE "CampaignOp" ADD COLUMN "searchCampaignDraftId" TEXT;

-- CreateTable
CREATE TABLE "SearchCampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT NOT NULL,
    "biddingStrategy" "SearchBiddingStrategy" NOT NULL DEFAULT 'MANUAL_CPC',
    "enhancedCpcEnabled" BOOLEAN NOT NULL DEFAULT false,
    "targetCpaMicros" BIGINT,
    "targetRoasText" TEXT,
    "targetGoogleSearch" BOOLEAN NOT NULL DEFAULT true,
    "targetSearchNetwork" BOOLEAN NOT NULL DEFAULT true,
    "targetContentNetwork" BOOLEAN NOT NULL DEFAULT false,
    "targetPartnerSearchNetwork" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TEXT,
    "endDate" TEXT,
    "statusDraft" "SearchDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "googleCampaignResourceName" TEXT,
    "campaignOpId" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchAdGroupDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBidMicros" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "googleAdGroupResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchAdGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchKeywordDraft" (
    "id" TEXT NOT NULL,
    "adGroupDraftId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "matchType" "SearchKeywordMatchType" NOT NULL DEFAULT 'PHRASE',
    "bidMicros" BIGINT,
    "isNegative" BOOLEAN NOT NULL DEFAULT false,
    "googleCriterionResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchKeywordDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchAdDraft" (
    "id" TEXT NOT NULL,
    "adGroupDraftId" TEXT NOT NULL,
    "headlinesText" TEXT NOT NULL,
    "descriptionsText" TEXT NOT NULL,
    "finalUrl" TEXT NOT NULL,
    "path1" TEXT,
    "path2" TEXT,
    "googleAdResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchAdDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "SearchTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchCampaignDraft_organizationId_statusDraft_idx" ON "SearchCampaignDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "SearchCampaignDraft_clientId_idx" ON "SearchCampaignDraft"("clientId");

-- CreateIndex
CREATE INDEX "SearchCampaignDraft_externalAccountId_idx" ON "SearchCampaignDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "SearchCampaignDraft_createdById_idx" ON "SearchCampaignDraft"("createdById");

-- CreateIndex
CREATE INDEX "SearchAdGroupDraft_draftId_sortOrder_idx" ON "SearchAdGroupDraft"("draftId", "sortOrder");

-- CreateIndex
CREATE INDEX "SearchKeywordDraft_adGroupDraftId_idx" ON "SearchKeywordDraft"("adGroupDraftId");

-- CreateIndex
CREATE INDEX "SearchAdDraft_adGroupDraftId_idx" ON "SearchAdDraft"("adGroupDraftId");

-- CreateIndex
CREATE INDEX "SearchTargetDraft_draftId_type_idx" ON "SearchTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "CampaignOp_searchCampaignDraftId_idx" ON "CampaignOp"("searchCampaignDraftId");

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_searchCampaignDraftId_fkey" FOREIGN KEY ("searchCampaignDraftId") REFERENCES "SearchCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchCampaignDraft" ADD CONSTRAINT "SearchCampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchCampaignDraft" ADD CONSTRAINT "SearchCampaignDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchCampaignDraft" ADD CONSTRAINT "SearchCampaignDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchCampaignDraft" ADD CONSTRAINT "SearchCampaignDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchAdGroupDraft" ADD CONSTRAINT "SearchAdGroupDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "SearchCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchKeywordDraft" ADD CONSTRAINT "SearchKeywordDraft_adGroupDraftId_fkey" FOREIGN KEY ("adGroupDraftId") REFERENCES "SearchAdGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchAdDraft" ADD CONSTRAINT "SearchAdDraft_adGroupDraftId_fkey" FOREIGN KEY ("adGroupDraftId") REFERENCES "SearchAdGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchTargetDraft" ADD CONSTRAINT "SearchTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "SearchCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
