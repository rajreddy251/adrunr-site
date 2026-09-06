-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'VIDEO_CAMPAIGN_DRAFT';

-- AlterEnum
ALTER TYPE "CampaignOpKind" ADD VALUE 'VIDEO_CREATE';

-- CreateEnum
CREATE TYPE "VideoDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoBiddingStrategy" AS ENUM ('MANUAL_CPV', 'TARGET_CPM', 'MAXIMIZE_CONVERSIONS', 'TARGET_CPA');

-- CreateEnum
CREATE TYPE "VideoTargetType" AS ENUM ('GEO', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "VideoAudienceKind" AS ENUM ('USER_LIST', 'AFFINITY', 'IN_MARKET', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VideoAssetKind" AS ENUM ('YOUTUBE_VIDEO', 'COMPANION_BANNER', 'MARKETING_IMAGE');

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "videoCampaignDraftId" TEXT;

-- AlterTable
ALTER TABLE "AssistantThread" ADD COLUMN "videoDraftId" TEXT;

-- CreateTable
CREATE TABLE "VideoCampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT NOT NULL,
    "biddingStrategy" "VideoBiddingStrategy" NOT NULL DEFAULT 'MANUAL_CPV',
    "maxCpvMicros" BIGINT,
    "targetCpmMicros" BIGINT,
    "targetCpaMicros" BIGINT,
    "inStream" BOOLEAN NOT NULL DEFAULT true,
    "bumper" BOOLEAN NOT NULL DEFAULT false,
    "inFeed" BOOLEAN NOT NULL DEFAULT true,
    "shorts" BOOLEAN NOT NULL DEFAULT true,
    "outstream" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TEXT,
    "endDate" TEXT,
    "statusDraft" "VideoDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "googleCampaignResourceName" TEXT,
    "campaignOpId" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAdGroupDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBidMicros" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "googleAdGroupResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAdGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAdDraft" (
    "id" TEXT NOT NULL,
    "adGroupDraftId" TEXT NOT NULL,
    "headlinesText" TEXT NOT NULL,
    "descriptionsText" TEXT NOT NULL,
    "longHeadline" TEXT,
    "finalUrl" TEXT NOT NULL,
    "callToActionText" TEXT,
    "googleAdResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAdDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAssetDraft" (
    "id" TEXT NOT NULL,
    "adDraftId" TEXT NOT NULL,
    "kind" "VideoAssetKind" NOT NULL,
    "urlText" TEXT NOT NULL,
    "assetResourceName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAssetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAudienceDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "kind" "VideoAudienceKind" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAudienceDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "VideoTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoCampaignDraft_organizationId_statusDraft_idx" ON "VideoCampaignDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "VideoCampaignDraft_clientId_idx" ON "VideoCampaignDraft"("clientId");

-- CreateIndex
CREATE INDEX "VideoCampaignDraft_externalAccountId_idx" ON "VideoCampaignDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "VideoCampaignDraft_createdById_idx" ON "VideoCampaignDraft"("createdById");

-- CreateIndex
CREATE INDEX "VideoAdGroupDraft_draftId_sortOrder_idx" ON "VideoAdGroupDraft"("draftId", "sortOrder");

-- CreateIndex
CREATE INDEX "VideoAdDraft_adGroupDraftId_idx" ON "VideoAdDraft"("adGroupDraftId");

-- CreateIndex
CREATE INDEX "VideoAssetDraft_adDraftId_kind_idx" ON "VideoAssetDraft"("adDraftId", "kind");

-- CreateIndex
CREATE INDEX "VideoAudienceDraft_draftId_kind_idx" ON "VideoAudienceDraft"("draftId", "kind");

-- CreateIndex
CREATE INDEX "VideoTargetDraft_draftId_type_idx" ON "VideoTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "CampaignOp_videoCampaignDraftId_idx" ON "CampaignOp"("videoCampaignDraftId");

-- CreateIndex
CREATE INDEX "AssistantThread_clientId_videoDraftId_idx" ON "AssistantThread"("clientId", "videoDraftId");

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_videoCampaignDraftId_fkey" FOREIGN KEY ("videoCampaignDraftId") REFERENCES "VideoCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCampaignDraft" ADD CONSTRAINT "VideoCampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCampaignDraft" ADD CONSTRAINT "VideoCampaignDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCampaignDraft" ADD CONSTRAINT "VideoCampaignDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCampaignDraft" ADD CONSTRAINT "VideoCampaignDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAdGroupDraft" ADD CONSTRAINT "VideoAdGroupDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "VideoCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAdDraft" ADD CONSTRAINT "VideoAdDraft_adGroupDraftId_fkey" FOREIGN KEY ("adGroupDraftId") REFERENCES "VideoAdGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAssetDraft" ADD CONSTRAINT "VideoAssetDraft_adDraftId_fkey" FOREIGN KEY ("adDraftId") REFERENCES "VideoAdDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAudienceDraft" ADD CONSTRAINT "VideoAudienceDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "VideoCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTargetDraft" ADD CONSTRAINT "VideoTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "VideoCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_videoDraftId_fkey" FOREIGN KEY ("videoDraftId") REFERENCES "VideoCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
