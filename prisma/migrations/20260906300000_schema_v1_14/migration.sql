-- AlterEnum
ALTER TYPE "CampaignOpKind" ADD VALUE 'CAMPAIGN_EDIT';

-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'CAMPAIGN_EDIT_DRAFT';

-- CreateEnum
CREATE TYPE "CampaignEditDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignEditFieldKind" AS ENUM ('NAME', 'BUDGET', 'BID', 'TARGETING');

-- CreateEnum
CREATE TYPE "CampaignEditTargetType" AS ENUM ('GEO', 'LANGUAGE');

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "campaignEditDraftId" TEXT;

-- CreateTable
CREATE TABLE "CampaignEditDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "syncedCampaignId" TEXT,
    "campaignExternalId" TEXT NOT NULL,
    "googleCampaignResourceName" TEXT,
    "budgetResourceName" TEXT,
    "advertisingChannelType" TEXT,
    "currentName" TEXT NOT NULL,
    "proposedName" TEXT,
    "currentDailyBudgetMicros" BIGINT,
    "proposedDailyBudgetMicros" BIGINT,
    "notesText" TEXT,
    "statusDraft" "CampaignEditDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "campaignOpId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignEditDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEditFieldDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "kind" "CampaignEditFieldKind" NOT NULL,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEditFieldDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEditBidDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "adGroupExternalId" TEXT NOT NULL,
    "googleAdGroupResourceName" TEXT,
    "adGroupName" TEXT,
    "currentBidMicros" BIGINT,
    "proposedBidMicros" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignEditBidDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEditTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "CampaignEditTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignEditTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignEditDraft_organizationId_statusDraft_idx" ON "CampaignEditDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "CampaignEditDraft_clientId_idx" ON "CampaignEditDraft"("clientId");

-- CreateIndex
CREATE INDEX "CampaignEditDraft_externalAccountId_idx" ON "CampaignEditDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "CampaignEditDraft_syncedCampaignId_idx" ON "CampaignEditDraft"("syncedCampaignId");

-- CreateIndex
CREATE INDEX "CampaignEditDraft_createdById_idx" ON "CampaignEditDraft"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignEditFieldDraft_draftId_kind_key" ON "CampaignEditFieldDraft"("draftId", "kind");

-- CreateIndex
CREATE INDEX "CampaignEditFieldDraft_draftId_idx" ON "CampaignEditFieldDraft"("draftId");

-- CreateIndex
CREATE INDEX "CampaignEditBidDraft_draftId_idx" ON "CampaignEditBidDraft"("draftId");

-- CreateIndex
CREATE INDEX "CampaignEditTargetDraft_draftId_type_idx" ON "CampaignEditTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "CampaignOp_campaignEditDraftId_idx" ON "CampaignOp"("campaignEditDraftId");

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_campaignEditDraftId_fkey" FOREIGN KEY ("campaignEditDraftId") REFERENCES "CampaignEditDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEditDraft" ADD CONSTRAINT "CampaignEditDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEditDraft" ADD CONSTRAINT "CampaignEditDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEditDraft" ADD CONSTRAINT "CampaignEditDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEditDraft" ADD CONSTRAINT "CampaignEditDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEditDraft" ADD CONSTRAINT "CampaignEditDraft_syncedCampaignId_fkey" FOREIGN KEY ("syncedCampaignId") REFERENCES "SyncedCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEditFieldDraft" ADD CONSTRAINT "CampaignEditFieldDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CampaignEditDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEditBidDraft" ADD CONSTRAINT "CampaignEditBidDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CampaignEditDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEditTargetDraft" ADD CONSTRAINT "CampaignEditTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CampaignEditDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
