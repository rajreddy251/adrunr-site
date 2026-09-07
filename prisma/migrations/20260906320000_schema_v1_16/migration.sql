-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'CAMPAIGN_REPORT_JOB';

-- CreateTable
CREATE TABLE "CampaignReportJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "neverEnable" BOOLEAN NOT NULL DEFAULT true,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "dateFrom" TEXT NOT NULL,
    "dateTo" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "requestBody" TEXT,
    "responseBody" TEXT,
    "previewText" TEXT,
    "notesText" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignReportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignReportRow" (
    "id" TEXT NOT NULL,
    "reportJobId" TEXT NOT NULL,
    "metricSnapshotId" TEXT,
    "syncedCampaignId" TEXT,
    "externalCampaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "advertisingChannelType" TEXT,
    "campaignStatus" TEXT,
    "statusSnapshotNote" TEXT,
    "spendMicros" BIGINT,
    "clicks" BIGINT,
    "impressions" BIGINT,
    "conversionsText" TEXT,
    "conversionsValueText" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignReportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignReportSummary" (
    "id" TEXT NOT NULL,
    "reportJobId" TEXT NOT NULL,
    "campaignCount" INTEGER NOT NULL DEFAULT 0,
    "enabledSnapshotCount" INTEGER NOT NULL DEFAULT 0,
    "spendMicros" BIGINT,
    "clicks" BIGINT,
    "impressions" BIGINT,
    "conversionsText" TEXT,
    "conversionsValueText" TEXT,
    "currencyCode" TEXT,
    "notesText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignReportSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignReportJob_organizationId_createdAt_idx" ON "CampaignReportJob"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignReportJob_clientId_idx" ON "CampaignReportJob"("clientId");

-- CreateIndex
CREATE INDEX "CampaignReportJob_externalAccountId_dateFrom_dateTo_idx" ON "CampaignReportJob"("externalAccountId", "dateFrom", "dateTo");

-- CreateIndex
CREATE INDEX "CampaignReportJob_status_idx" ON "CampaignReportJob"("status");

-- CreateIndex
CREATE INDEX "CampaignReportJob_providerId_idx" ON "CampaignReportJob"("providerId");

-- CreateIndex
CREATE INDEX "CampaignReportRow_reportJobId_idx" ON "CampaignReportRow"("reportJobId");

-- CreateIndex
CREATE INDEX "CampaignReportRow_metricSnapshotId_idx" ON "CampaignReportRow"("metricSnapshotId");

-- CreateIndex
CREATE INDEX "CampaignReportRow_syncedCampaignId_idx" ON "CampaignReportRow"("syncedCampaignId");

-- CreateIndex
CREATE INDEX "CampaignReportRow_externalCampaignId_idx" ON "CampaignReportRow"("externalCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignReportSummary_reportJobId_key" ON "CampaignReportSummary"("reportJobId");

-- AddForeignKey
ALTER TABLE "CampaignReportJob" ADD CONSTRAINT "CampaignReportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReportJob" ADD CONSTRAINT "CampaignReportJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReportJob" ADD CONSTRAINT "CampaignReportJob_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReportJob" ADD CONSTRAINT "CampaignReportJob_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReportJob" ADD CONSTRAINT "CampaignReportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReportRow" ADD CONSTRAINT "CampaignReportRow_reportJobId_fkey" FOREIGN KEY ("reportJobId") REFERENCES "CampaignReportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReportRow" ADD CONSTRAINT "CampaignReportRow_metricSnapshotId_fkey" FOREIGN KEY ("metricSnapshotId") REFERENCES "CampaignMetricSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReportRow" ADD CONSTRAINT "CampaignReportRow_syncedCampaignId_fkey" FOREIGN KEY ("syncedCampaignId") REFERENCES "SyncedCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReportSummary" ADD CONSTRAINT "CampaignReportSummary_reportJobId_fkey" FOREIGN KEY ("reportJobId") REFERENCES "CampaignReportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
