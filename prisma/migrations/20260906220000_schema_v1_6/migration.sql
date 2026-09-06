-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'PERFORMANCE_MAX_CAMPAIGN_DRAFT';

-- CreateEnum
CREATE TYPE "PerformanceMaxDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "PerformanceMaxBiddingStrategy" AS ENUM ('MAXIMIZE_CONVERSIONS', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_CPA', 'TARGET_ROAS');

-- CreateEnum
CREATE TYPE "PerformanceMaxTargetType" AS ENUM ('GEO', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "PerformanceMaxSignalKind" AS ENUM ('SEARCH_THEME', 'USER_LIST', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PerformanceMaxAssetKind" AS ENUM ('MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE', 'PORTRAIT_MARKETING_IMAGE', 'LOGO', 'LANDSCAPE_LOGO', 'YOUTUBE_VIDEO');

-- CreateEnum
CREATE TYPE "PerformanceMaxListingKind" AS ENUM ('ALL_PRODUCTS', 'UNIT');

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "pmaxCampaignDraftId" TEXT;

-- AlterTable
ALTER TABLE "AssistantThread" ADD COLUMN "pmaxDraftId" TEXT;

-- CreateTable
CREATE TABLE "PerformanceMaxCampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT NOT NULL,
    "biddingStrategy" "PerformanceMaxBiddingStrategy" NOT NULL DEFAULT 'MAXIMIZE_CONVERSIONS',
    "targetCpaMicros" BIGINT,
    "targetRoasText" TEXT,
    "urlExpansionOptOut" BOOLEAN NOT NULL DEFAULT false,
    "brandGuidelinesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "merchantCenterId" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "statusDraft" "PerformanceMaxDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "googleCampaignResourceName" TEXT,
    "campaignOpId" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceMaxCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMaxAssetGroupDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "finalUrl" TEXT NOT NULL,
    "headlinesText" TEXT NOT NULL,
    "longHeadlinesText" TEXT NOT NULL,
    "descriptionsText" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "googleAssetGroupResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceMaxAssetGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMaxAssetDraft" (
    "id" TEXT NOT NULL,
    "assetGroupDraftId" TEXT NOT NULL,
    "kind" "PerformanceMaxAssetKind" NOT NULL,
    "urlText" TEXT NOT NULL,
    "assetResourceName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceMaxAssetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMaxSignalDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "kind" "PerformanceMaxSignalKind" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceMaxSignalDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMaxListingDraft" (
    "id" TEXT NOT NULL,
    "assetGroupDraftId" TEXT NOT NULL,
    "kind" "PerformanceMaxListingKind" NOT NULL,
    "valueText" TEXT NOT NULL,
    "dimensionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceMaxListingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMaxTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "PerformanceMaxTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceMaxTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformanceMaxCampaignDraft_organizationId_statusDraft_idx" ON "PerformanceMaxCampaignDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "PerformanceMaxCampaignDraft_clientId_idx" ON "PerformanceMaxCampaignDraft"("clientId");

-- CreateIndex
CREATE INDEX "PerformanceMaxCampaignDraft_externalAccountId_idx" ON "PerformanceMaxCampaignDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "PerformanceMaxCampaignDraft_createdById_idx" ON "PerformanceMaxCampaignDraft"("createdById");

-- CreateIndex
CREATE INDEX "PerformanceMaxAssetGroupDraft_draftId_sortOrder_idx" ON "PerformanceMaxAssetGroupDraft"("draftId", "sortOrder");

-- CreateIndex
CREATE INDEX "PerformanceMaxAssetDraft_assetGroupDraftId_kind_idx" ON "PerformanceMaxAssetDraft"("assetGroupDraftId", "kind");

-- CreateIndex
CREATE INDEX "PerformanceMaxSignalDraft_draftId_kind_idx" ON "PerformanceMaxSignalDraft"("draftId", "kind");

-- CreateIndex
CREATE INDEX "PerformanceMaxListingDraft_assetGroupDraftId_kind_idx" ON "PerformanceMaxListingDraft"("assetGroupDraftId", "kind");

-- CreateIndex
CREATE INDEX "PerformanceMaxTargetDraft_draftId_type_idx" ON "PerformanceMaxTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "CampaignOp_pmaxCampaignDraftId_idx" ON "CampaignOp"("pmaxCampaignDraftId");

-- CreateIndex
CREATE INDEX "AssistantThread_clientId_pmaxDraftId_idx" ON "AssistantThread"("clientId", "pmaxDraftId");

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_pmaxCampaignDraftId_fkey" FOREIGN KEY ("pmaxCampaignDraftId") REFERENCES "PerformanceMaxCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMaxCampaignDraft" ADD CONSTRAINT "PerformanceMaxCampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMaxCampaignDraft" ADD CONSTRAINT "PerformanceMaxCampaignDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMaxCampaignDraft" ADD CONSTRAINT "PerformanceMaxCampaignDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMaxCampaignDraft" ADD CONSTRAINT "PerformanceMaxCampaignDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMaxAssetGroupDraft" ADD CONSTRAINT "PerformanceMaxAssetGroupDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "PerformanceMaxCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMaxAssetDraft" ADD CONSTRAINT "PerformanceMaxAssetDraft_assetGroupDraftId_fkey" FOREIGN KEY ("assetGroupDraftId") REFERENCES "PerformanceMaxAssetGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMaxSignalDraft" ADD CONSTRAINT "PerformanceMaxSignalDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "PerformanceMaxCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMaxListingDraft" ADD CONSTRAINT "PerformanceMaxListingDraft_assetGroupDraftId_fkey" FOREIGN KEY ("assetGroupDraftId") REFERENCES "PerformanceMaxAssetGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMaxTargetDraft" ADD CONSTRAINT "PerformanceMaxTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "PerformanceMaxCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_pmaxDraftId_fkey" FOREIGN KEY ("pmaxDraftId") REFERENCES "PerformanceMaxCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
