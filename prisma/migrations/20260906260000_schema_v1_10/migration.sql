-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'APP_CAMPAIGN_DRAFT';

-- AlterEnum
ALTER TYPE "CampaignOpKind" ADD VALUE 'APP_CREATE';

-- CreateEnum
CREATE TYPE "AppDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "AppBiddingStrategy" AS ENUM ('TARGET_CPA', 'MAXIMIZE_CONVERSIONS', 'TARGET_ROAS');

-- CreateEnum
CREATE TYPE "AppTargetType" AS ENUM ('GEO', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "AppPlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "AppGoal" AS ENUM ('INSTALLS', 'IN_APP_ACTIONS');

-- CreateEnum
CREATE TYPE "AppAssetKind" AS ENUM ('MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE', 'YOUTUBE_VIDEO', 'HTML5');

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "appCampaignDraftId" TEXT;

-- AlterTable
ALTER TABLE "AssistantThread" ADD COLUMN "appDraftId" TEXT;

-- CreateTable
CREATE TABLE "AppCampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT NOT NULL,
    "biddingStrategy" "AppBiddingStrategy" NOT NULL DEFAULT 'TARGET_CPA',
    "goal" "AppGoal" NOT NULL DEFAULT 'INSTALLS',
    "targetCpaMicros" BIGINT,
    "targetRoasText" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "statusDraft" "AppDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "googleCampaignResourceName" TEXT,
    "campaignOpId" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppPlatformDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "platform" "AppPlatform" NOT NULL,
    "appId" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppPlatformDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppAdGroupDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBidMicros" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "googleAdGroupResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAdGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppAdDraft" (
    "id" TEXT NOT NULL,
    "adGroupDraftId" TEXT NOT NULL,
    "headlinesText" TEXT NOT NULL,
    "descriptionsText" TEXT NOT NULL,
    "googleAdResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAdDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppAssetDraft" (
    "id" TEXT NOT NULL,
    "adDraftId" TEXT NOT NULL,
    "kind" "AppAssetKind" NOT NULL,
    "urlText" TEXT NOT NULL,
    "assetResourceName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAssetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "AppTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppCampaignDraft_organizationId_statusDraft_idx" ON "AppCampaignDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "AppCampaignDraft_clientId_idx" ON "AppCampaignDraft"("clientId");

-- CreateIndex
CREATE INDEX "AppCampaignDraft_externalAccountId_idx" ON "AppCampaignDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "AppCampaignDraft_createdById_idx" ON "AppCampaignDraft"("createdById");

-- CreateIndex
CREATE INDEX "AppPlatformDraft_draftId_platform_idx" ON "AppPlatformDraft"("draftId", "platform");

-- CreateIndex
CREATE INDEX "AppAdGroupDraft_draftId_sortOrder_idx" ON "AppAdGroupDraft"("draftId", "sortOrder");

-- CreateIndex
CREATE INDEX "AppAdDraft_adGroupDraftId_idx" ON "AppAdDraft"("adGroupDraftId");

-- CreateIndex
CREATE INDEX "AppAssetDraft_adDraftId_kind_idx" ON "AppAssetDraft"("adDraftId", "kind");

-- CreateIndex
CREATE INDEX "AppTargetDraft_draftId_type_idx" ON "AppTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "CampaignOp_appCampaignDraftId_idx" ON "CampaignOp"("appCampaignDraftId");

-- CreateIndex
CREATE INDEX "AssistantThread_clientId_appDraftId_idx" ON "AssistantThread"("clientId", "appDraftId");

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_appCampaignDraftId_fkey" FOREIGN KEY ("appCampaignDraftId") REFERENCES "AppCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppCampaignDraft" ADD CONSTRAINT "AppCampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppCampaignDraft" ADD CONSTRAINT "AppCampaignDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppCampaignDraft" ADD CONSTRAINT "AppCampaignDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppCampaignDraft" ADD CONSTRAINT "AppCampaignDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPlatformDraft" ADD CONSTRAINT "AppPlatformDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "AppCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAdGroupDraft" ADD CONSTRAINT "AppAdGroupDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "AppCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAdDraft" ADD CONSTRAINT "AppAdDraft_adGroupDraftId_fkey" FOREIGN KEY ("adGroupDraftId") REFERENCES "AppAdGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAssetDraft" ADD CONSTRAINT "AppAssetDraft_adDraftId_fkey" FOREIGN KEY ("adDraftId") REFERENCES "AppAdDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppTargetDraft" ADD CONSTRAINT "AppTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "AppCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_appDraftId_fkey" FOREIGN KEY ("appDraftId") REFERENCES "AppCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
