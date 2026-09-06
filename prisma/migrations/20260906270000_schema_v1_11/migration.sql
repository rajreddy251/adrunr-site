-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'HOTEL_CAMPAIGN_DRAFT';

-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'LOCAL_CAMPAIGN_DRAFT';

-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'LOCAL_SERVICES_CAMPAIGN_DRAFT';

-- AlterEnum
ALTER TYPE "CampaignOpKind" ADD VALUE 'HOTEL_CREATE';

-- AlterEnum
ALTER TYPE "CampaignOpKind" ADD VALUE 'LOCAL_CREATE';

-- AlterEnum
ALTER TYPE "CampaignOpKind" ADD VALUE 'LOCAL_SERVICES_CREATE';

-- CreateEnum
CREATE TYPE "HotelDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "HotelBiddingStrategy" AS ENUM ('PERCENT_CPC', 'COMMISSION', 'MANUAL_CPC', 'TARGET_ROAS');

-- CreateEnum
CREATE TYPE "HotelTargetType" AS ENUM ('GEO', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "HotelListingKind" AS ENUM ('ALL_HOTELS', 'UNIT');

-- CreateEnum
CREATE TYPE "LocalDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "LocalBiddingStrategy" AS ENUM ('MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'TARGET_ROAS');

-- CreateEnum
CREATE TYPE "LocalTargetType" AS ENUM ('GEO', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "LocalGoal" AS ENUM ('STORE_VISITS', 'STORE_SALES');

-- CreateEnum
CREATE TYPE "LocalLocationKind" AS ENUM ('BUSINESS_PROFILE', 'PLACE_ID', 'ADDRESS');

-- CreateEnum
CREATE TYPE "LocalServicesDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "LocalServicesBiddingStrategy" AS ENUM ('MANUAL_CPC', 'MAXIMIZE_CONVERSIONS');

-- CreateEnum
CREATE TYPE "LocalServicesTargetType" AS ENUM ('GEO', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "LocalServicesCategoryKind" AS ENUM ('PRIMARY', 'ADDITIONAL');

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "hotelCampaignDraftId" TEXT;

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "localCampaignDraftId" TEXT;

-- AlterTable
ALTER TABLE "CampaignOp" ADD COLUMN "localServicesCampaignDraftId" TEXT;

-- AlterTable
ALTER TABLE "AssistantThread" ADD COLUMN "hotelDraftId" TEXT;

-- AlterTable
ALTER TABLE "AssistantThread" ADD COLUMN "localDraftId" TEXT;

-- AlterTable
ALTER TABLE "AssistantThread" ADD COLUMN "localServicesDraftId" TEXT;

-- CreateTable
CREATE TABLE "HotelCampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT NOT NULL,
    "biddingStrategy" "HotelBiddingStrategy" NOT NULL DEFAULT 'PERCENT_CPC',
    "hotelCenterId" TEXT,
    "percentCpcCeilingMicros" BIGINT,
    "commissionRateText" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "statusDraft" "HotelDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "googleCampaignResourceName" TEXT,
    "campaignOpId" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelAdGroupDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBidMicros" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "googleAdGroupResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelAdGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelListingDraft" (
    "id" TEXT NOT NULL,
    "adGroupDraftId" TEXT NOT NULL,
    "kind" "HotelListingKind" NOT NULL,
    "valueText" TEXT NOT NULL,
    "hotelIdText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelListingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "HotelTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalCampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT NOT NULL,
    "biddingStrategy" "LocalBiddingStrategy" NOT NULL DEFAULT 'MAXIMIZE_CONVERSIONS',
    "goal" "LocalGoal" NOT NULL DEFAULT 'STORE_VISITS',
    "targetCpaMicros" BIGINT,
    "targetRoasText" TEXT,
    "businessName" TEXT,
    "finalUrl" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "statusDraft" "LocalDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "googleCampaignResourceName" TEXT,
    "campaignOpId" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalLocationDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "kind" "LocalLocationKind" NOT NULL,
    "valueText" TEXT NOT NULL,
    "placeIdText" TEXT NOT NULL,
    "addressText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalLocationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalAdGroupDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBidMicros" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "googleAdGroupResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalAdGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalAdDraft" (
    "id" TEXT NOT NULL,
    "adGroupDraftId" TEXT NOT NULL,
    "headlinesText" TEXT NOT NULL,
    "descriptionsText" TEXT NOT NULL,
    "finalUrl" TEXT NOT NULL,
    "googleAdResourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalAdDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "LocalTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalServicesCampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT NOT NULL,
    "biddingStrategy" "LocalServicesBiddingStrategy" NOT NULL DEFAULT 'MANUAL_CPC',
    "maxLeadBidMicros" BIGINT,
    "businessName" TEXT,
    "licenseText" TEXT,
    "insuranceText" TEXT,
    "googleGuaranteed" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TEXT,
    "endDate" TEXT,
    "statusDraft" "LocalServicesDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "googleCampaignResourceName" TEXT,
    "campaignOpId" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalServicesCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalServicesCategoryDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "kind" "LocalServicesCategoryKind" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "valueText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalServicesCategoryDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalServicesTargetDraft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "type" "LocalServicesTargetType" NOT NULL,
    "valueText" TEXT NOT NULL,
    "criterionText" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalServicesTargetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelCampaignDraft_organizationId_statusDraft_idx" ON "HotelCampaignDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "HotelCampaignDraft_clientId_idx" ON "HotelCampaignDraft"("clientId");

-- CreateIndex
CREATE INDEX "HotelCampaignDraft_externalAccountId_idx" ON "HotelCampaignDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "HotelCampaignDraft_createdById_idx" ON "HotelCampaignDraft"("createdById");

-- CreateIndex
CREATE INDEX "HotelAdGroupDraft_draftId_sortOrder_idx" ON "HotelAdGroupDraft"("draftId", "sortOrder");

-- CreateIndex
CREATE INDEX "HotelListingDraft_adGroupDraftId_kind_idx" ON "HotelListingDraft"("adGroupDraftId", "kind");

-- CreateIndex
CREATE INDEX "HotelTargetDraft_draftId_type_idx" ON "HotelTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "LocalCampaignDraft_organizationId_statusDraft_idx" ON "LocalCampaignDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "LocalCampaignDraft_clientId_idx" ON "LocalCampaignDraft"("clientId");

-- CreateIndex
CREATE INDEX "LocalCampaignDraft_externalAccountId_idx" ON "LocalCampaignDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "LocalCampaignDraft_createdById_idx" ON "LocalCampaignDraft"("createdById");

-- CreateIndex
CREATE INDEX "LocalLocationDraft_draftId_kind_idx" ON "LocalLocationDraft"("draftId", "kind");

-- CreateIndex
CREATE INDEX "LocalAdGroupDraft_draftId_sortOrder_idx" ON "LocalAdGroupDraft"("draftId", "sortOrder");

-- CreateIndex
CREATE INDEX "LocalAdDraft_adGroupDraftId_idx" ON "LocalAdDraft"("adGroupDraftId");

-- CreateIndex
CREATE INDEX "LocalTargetDraft_draftId_type_idx" ON "LocalTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "LocalServicesCampaignDraft_organizationId_statusDraft_idx" ON "LocalServicesCampaignDraft"("organizationId", "statusDraft");

-- CreateIndex
CREATE INDEX "LocalServicesCampaignDraft_clientId_idx" ON "LocalServicesCampaignDraft"("clientId");

-- CreateIndex
CREATE INDEX "LocalServicesCampaignDraft_externalAccountId_idx" ON "LocalServicesCampaignDraft"("externalAccountId");

-- CreateIndex
CREATE INDEX "LocalServicesCampaignDraft_createdById_idx" ON "LocalServicesCampaignDraft"("createdById");

-- CreateIndex
CREATE INDEX "LocalServicesCategoryDraft_draftId_kind_idx" ON "LocalServicesCategoryDraft"("draftId", "kind");

-- CreateIndex
CREATE INDEX "LocalServicesTargetDraft_draftId_type_idx" ON "LocalServicesTargetDraft"("draftId", "type");

-- CreateIndex
CREATE INDEX "CampaignOp_hotelCampaignDraftId_idx" ON "CampaignOp"("hotelCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignOp_localCampaignDraftId_idx" ON "CampaignOp"("localCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignOp_localServicesCampaignDraftId_idx" ON "CampaignOp"("localServicesCampaignDraftId");

-- CreateIndex
CREATE INDEX "AssistantThread_clientId_hotelDraftId_idx" ON "AssistantThread"("clientId", "hotelDraftId");

-- CreateIndex
CREATE INDEX "AssistantThread_clientId_localDraftId_idx" ON "AssistantThread"("clientId", "localDraftId");

-- CreateIndex
CREATE INDEX "AssistantThread_clientId_localServicesDraftId_idx" ON "AssistantThread"("clientId", "localServicesDraftId");

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_hotelCampaignDraftId_fkey" FOREIGN KEY ("hotelCampaignDraftId") REFERENCES "HotelCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_localCampaignDraftId_fkey" FOREIGN KEY ("localCampaignDraftId") REFERENCES "LocalCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_localServicesCampaignDraftId_fkey" FOREIGN KEY ("localServicesCampaignDraftId") REFERENCES "LocalServicesCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelCampaignDraft" ADD CONSTRAINT "HotelCampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelCampaignDraft" ADD CONSTRAINT "HotelCampaignDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelCampaignDraft" ADD CONSTRAINT "HotelCampaignDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelCampaignDraft" ADD CONSTRAINT "HotelCampaignDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelAdGroupDraft" ADD CONSTRAINT "HotelAdGroupDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "HotelCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelListingDraft" ADD CONSTRAINT "HotelListingDraft_adGroupDraftId_fkey" FOREIGN KEY ("adGroupDraftId") REFERENCES "HotelAdGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelTargetDraft" ADD CONSTRAINT "HotelTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "HotelCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCampaignDraft" ADD CONSTRAINT "LocalCampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCampaignDraft" ADD CONSTRAINT "LocalCampaignDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCampaignDraft" ADD CONSTRAINT "LocalCampaignDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCampaignDraft" ADD CONSTRAINT "LocalCampaignDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalLocationDraft" ADD CONSTRAINT "LocalLocationDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "LocalCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalAdGroupDraft" ADD CONSTRAINT "LocalAdGroupDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "LocalCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalAdDraft" ADD CONSTRAINT "LocalAdDraft_adGroupDraftId_fkey" FOREIGN KEY ("adGroupDraftId") REFERENCES "LocalAdGroupDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalTargetDraft" ADD CONSTRAINT "LocalTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "LocalCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalServicesCampaignDraft" ADD CONSTRAINT "LocalServicesCampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalServicesCampaignDraft" ADD CONSTRAINT "LocalServicesCampaignDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalServicesCampaignDraft" ADD CONSTRAINT "LocalServicesCampaignDraft_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalServicesCampaignDraft" ADD CONSTRAINT "LocalServicesCampaignDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalServicesCategoryDraft" ADD CONSTRAINT "LocalServicesCategoryDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "LocalServicesCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalServicesTargetDraft" ADD CONSTRAINT "LocalServicesTargetDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "LocalServicesCampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_hotelDraftId_fkey" FOREIGN KEY ("hotelDraftId") REFERENCES "HotelCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_localDraftId_fkey" FOREIGN KEY ("localDraftId") REFERENCES "LocalCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_localServicesDraftId_fkey" FOREIGN KEY ("localServicesDraftId") REFERENCES "LocalServicesCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
