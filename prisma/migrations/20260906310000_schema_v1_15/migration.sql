-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'CAMPAIGN_IMPORT_JOB';

-- AlterTable
ALTER TABLE "SearchCampaignDraft" ADD COLUMN "importJobId" TEXT;
ALTER TABLE "SearchCampaignDraft" ADD COLUMN "syncedCampaignId" TEXT;
ALTER TABLE "SearchCampaignDraft" ADD COLUMN "sourceCampaignExternalId" TEXT;
ALTER TABLE "SearchCampaignDraft" ADD COLUMN "importProvenanceText" TEXT;

-- AlterTable
ALTER TABLE "DisplayCampaignDraft" ADD COLUMN "importJobId" TEXT;
ALTER TABLE "DisplayCampaignDraft" ADD COLUMN "syncedCampaignId" TEXT;
ALTER TABLE "DisplayCampaignDraft" ADD COLUMN "sourceCampaignExternalId" TEXT;
ALTER TABLE "DisplayCampaignDraft" ADD COLUMN "importProvenanceText" TEXT;

-- AlterTable
ALTER TABLE "PerformanceMaxCampaignDraft" ADD COLUMN "importJobId" TEXT;
ALTER TABLE "PerformanceMaxCampaignDraft" ADD COLUMN "syncedCampaignId" TEXT;
ALTER TABLE "PerformanceMaxCampaignDraft" ADD COLUMN "sourceCampaignExternalId" TEXT;
ALTER TABLE "PerformanceMaxCampaignDraft" ADD COLUMN "importProvenanceText" TEXT;

-- AlterTable
ALTER TABLE "DemandGenCampaignDraft" ADD COLUMN "importJobId" TEXT;
ALTER TABLE "DemandGenCampaignDraft" ADD COLUMN "syncedCampaignId" TEXT;
ALTER TABLE "DemandGenCampaignDraft" ADD COLUMN "sourceCampaignExternalId" TEXT;
ALTER TABLE "DemandGenCampaignDraft" ADD COLUMN "importProvenanceText" TEXT;

-- AlterTable
ALTER TABLE "VideoCampaignDraft" ADD COLUMN "importJobId" TEXT;
ALTER TABLE "VideoCampaignDraft" ADD COLUMN "syncedCampaignId" TEXT;
ALTER TABLE "VideoCampaignDraft" ADD COLUMN "sourceCampaignExternalId" TEXT;
ALTER TABLE "VideoCampaignDraft" ADD COLUMN "importProvenanceText" TEXT;

-- AlterTable
ALTER TABLE "ShoppingCampaignDraft" ADD COLUMN "importJobId" TEXT;
ALTER TABLE "ShoppingCampaignDraft" ADD COLUMN "syncedCampaignId" TEXT;
ALTER TABLE "ShoppingCampaignDraft" ADD COLUMN "sourceCampaignExternalId" TEXT;
ALTER TABLE "ShoppingCampaignDraft" ADD COLUMN "importProvenanceText" TEXT;

-- AlterTable
ALTER TABLE "AppCampaignDraft" ADD COLUMN "importJobId" TEXT;
ALTER TABLE "AppCampaignDraft" ADD COLUMN "syncedCampaignId" TEXT;
ALTER TABLE "AppCampaignDraft" ADD COLUMN "sourceCampaignExternalId" TEXT;
ALTER TABLE "AppCampaignDraft" ADD COLUMN "importProvenanceText" TEXT;

-- AlterTable
ALTER TABLE "HotelCampaignDraft" ADD COLUMN "importJobId" TEXT;
ALTER TABLE "HotelCampaignDraft" ADD COLUMN "syncedCampaignId" TEXT;
ALTER TABLE "HotelCampaignDraft" ADD COLUMN "sourceCampaignExternalId" TEXT;
ALTER TABLE "HotelCampaignDraft" ADD COLUMN "importProvenanceText" TEXT;

-- AlterTable
ALTER TABLE "LocalCampaignDraft" ADD COLUMN "importJobId" TEXT;
ALTER TABLE "LocalCampaignDraft" ADD COLUMN "syncedCampaignId" TEXT;
ALTER TABLE "LocalCampaignDraft" ADD COLUMN "sourceCampaignExternalId" TEXT;
ALTER TABLE "LocalCampaignDraft" ADD COLUMN "importProvenanceText" TEXT;

-- AlterTable
ALTER TABLE "LocalServicesCampaignDraft" ADD COLUMN "importJobId" TEXT;
ALTER TABLE "LocalServicesCampaignDraft" ADD COLUMN "syncedCampaignId" TEXT;
ALTER TABLE "LocalServicesCampaignDraft" ADD COLUMN "sourceCampaignExternalId" TEXT;
ALTER TABLE "LocalServicesCampaignDraft" ADD COLUMN "importProvenanceText" TEXT;

-- CreateTable
CREATE TABLE "CampaignImportJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "syncedCampaignId" TEXT,
    "sourceCampaignExternalId" TEXT NOT NULL,
    "sourceCampaignName" TEXT NOT NULL,
    "sourceAdvertisingChannelType" TEXT,
    "sourceStatus" TEXT,
    "sourceServingStatus" TEXT,
    "sourceBiddingStrategyType" TEXT,
    "draftKind" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "neverEnable" BOOLEAN NOT NULL DEFAULT true,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestBody" TEXT,
    "responseBody" TEXT,
    "previewText" TEXT,
    "notesText" TEXT,
    "errorMessage" TEXT,
    "searchCampaignDraftId" TEXT,
    "displayCampaignDraftId" TEXT,
    "pmaxCampaignDraftId" TEXT,
    "demandGenCampaignDraftId" TEXT,
    "videoCampaignDraftId" TEXT,
    "shoppingCampaignDraftId" TEXT,
    "appCampaignDraftId" TEXT,
    "hotelCampaignDraftId" TEXT,
    "localCampaignDraftId" TEXT,
    "localServicesCampaignDraftId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignImportJob_organizationId_createdAt_idx" ON "CampaignImportJob"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignImportJob_externalAccountId_idx" ON "CampaignImportJob"("externalAccountId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_syncedCampaignId_idx" ON "CampaignImportJob"("syncedCampaignId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_draftKind_createdAt_idx" ON "CampaignImportJob"("draftKind", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignImportJob_status_idx" ON "CampaignImportJob"("status");

-- CreateIndex
CREATE INDEX "CampaignImportJob_searchCampaignDraftId_idx" ON "CampaignImportJob"("searchCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_displayCampaignDraftId_idx" ON "CampaignImportJob"("displayCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_pmaxCampaignDraftId_idx" ON "CampaignImportJob"("pmaxCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_demandGenCampaignDraftId_idx" ON "CampaignImportJob"("demandGenCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_videoCampaignDraftId_idx" ON "CampaignImportJob"("videoCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_shoppingCampaignDraftId_idx" ON "CampaignImportJob"("shoppingCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_appCampaignDraftId_idx" ON "CampaignImportJob"("appCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_hotelCampaignDraftId_idx" ON "CampaignImportJob"("hotelCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_localCampaignDraftId_idx" ON "CampaignImportJob"("localCampaignDraftId");

-- CreateIndex
CREATE INDEX "CampaignImportJob_localServicesCampaignDraftId_idx" ON "CampaignImportJob"("localServicesCampaignDraftId");

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_syncedCampaignId_fkey" FOREIGN KEY ("syncedCampaignId") REFERENCES "SyncedCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_searchCampaignDraftId_fkey" FOREIGN KEY ("searchCampaignDraftId") REFERENCES "SearchCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_displayCampaignDraftId_fkey" FOREIGN KEY ("displayCampaignDraftId") REFERENCES "DisplayCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_pmaxCampaignDraftId_fkey" FOREIGN KEY ("pmaxCampaignDraftId") REFERENCES "PerformanceMaxCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_demandGenCampaignDraftId_fkey" FOREIGN KEY ("demandGenCampaignDraftId") REFERENCES "DemandGenCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_videoCampaignDraftId_fkey" FOREIGN KEY ("videoCampaignDraftId") REFERENCES "VideoCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_shoppingCampaignDraftId_fkey" FOREIGN KEY ("shoppingCampaignDraftId") REFERENCES "ShoppingCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_appCampaignDraftId_fkey" FOREIGN KEY ("appCampaignDraftId") REFERENCES "AppCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_hotelCampaignDraftId_fkey" FOREIGN KEY ("hotelCampaignDraftId") REFERENCES "HotelCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_localCampaignDraftId_fkey" FOREIGN KEY ("localCampaignDraftId") REFERENCES "LocalCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportJob" ADD CONSTRAINT "CampaignImportJob_localServicesCampaignDraftId_fkey" FOREIGN KEY ("localServicesCampaignDraftId") REFERENCES "LocalServicesCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
