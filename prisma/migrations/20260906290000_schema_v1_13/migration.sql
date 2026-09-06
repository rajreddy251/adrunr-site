-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'CAMPAIGN_METRIC_SNAPSHOT';

-- CreateTable
CREATE TABLE "CampaignMetricSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "lastSyncJobId" TEXT,
    "syncedCampaignId" TEXT,
    "externalCampaignId" TEXT NOT NULL,
    "resourceName" TEXT,
    "campaignName" TEXT NOT NULL,
    "advertisingChannelType" TEXT,
    "campaignStatus" TEXT,
    "currencyCode" TEXT,
    "budgetResourceName" TEXT,
    "budgetAmountMicros" BIGINT,
    "budgetPeriod" TEXT,
    "dateFrom" TEXT NOT NULL,
    "dateTo" TEXT NOT NULL,
    "costMicros" BIGINT,
    "impressions" BIGINT,
    "clicks" BIGINT,
    "conversionsText" TEXT,
    "conversionsValueText" TEXT,
    "averageCpcMicros" BIGINT,
    "averageCpmMicros" BIGINT,
    "attributesText" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignMetricSnapshot_organizationId_providerId_idx" ON "CampaignMetricSnapshot"("organizationId", "providerId");

-- CreateIndex
CREATE INDEX "CampaignMetricSnapshot_externalAccountId_dateFrom_dateTo_idx" ON "CampaignMetricSnapshot"("externalAccountId", "dateFrom", "dateTo");

-- CreateIndex
CREATE INDEX "CampaignMetricSnapshot_lastSyncJobId_idx" ON "CampaignMetricSnapshot"("lastSyncJobId");

-- CreateIndex
CREATE INDEX "CampaignMetricSnapshot_syncedCampaignId_idx" ON "CampaignMetricSnapshot"("syncedCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMetricSnapshot_account_campaign_window_key" ON "CampaignMetricSnapshot"("providerId", "externalAccountId", "externalCampaignId", "dateFrom", "dateTo");

-- AddForeignKey
ALTER TABLE "CampaignMetricSnapshot" ADD CONSTRAINT "CampaignMetricSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetricSnapshot" ADD CONSTRAINT "CampaignMetricSnapshot_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetricSnapshot" ADD CONSTRAINT "CampaignMetricSnapshot_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetricSnapshot" ADD CONSTRAINT "CampaignMetricSnapshot_lastSyncJobId_fkey" FOREIGN KEY ("lastSyncJobId") REFERENCES "SyncJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetricSnapshot" ADD CONSTRAINT "CampaignMetricSnapshot_syncedCampaignId_fkey" FOREIGN KEY ("syncedCampaignId") REFERENCES "SyncedCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
