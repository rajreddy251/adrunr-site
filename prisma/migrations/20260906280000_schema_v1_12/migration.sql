-- AlterEnum
ALTER TYPE "ExternalEntityType" ADD VALUE 'KEYWORD';

-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'SYNCED_CAMPAIGN';

-- AlterTable
ALTER TABLE "SyncJob" ADD COLUMN "readOnly" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SyncJob" ADD COLUMN "dryRun" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SyncedCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "lastSyncJobId" TEXT,
    "externalId" TEXT NOT NULL,
    "resourceName" TEXT,
    "name" TEXT NOT NULL,
    "advertisingChannelType" TEXT,
    "status" TEXT,
    "servingStatus" TEXT,
    "biddingStrategyType" TEXT,
    "attributesText" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedAdGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "syncedCampaignId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "resourceName" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "type" TEXT,
    "attributesText" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedAdGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedAd" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "syncedAdGroupId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "resourceName" TEXT,
    "name" TEXT,
    "type" TEXT,
    "status" TEXT,
    "headlinesText" TEXT,
    "descriptionsText" TEXT,
    "finalUrl" TEXT,
    "attributesText" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedKeyword" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "syncedAdGroupId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "resourceName" TEXT,
    "text" TEXT NOT NULL,
    "matchType" TEXT,
    "status" TEXT,
    "isNegative" BOOLEAN NOT NULL DEFAULT false,
    "attributesText" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncedCampaign_organizationId_providerId_idx" ON "SyncedCampaign"("organizationId", "providerId");

-- CreateIndex
CREATE INDEX "SyncedCampaign_externalAccountId_idx" ON "SyncedCampaign"("externalAccountId");

-- CreateIndex
CREATE INDEX "SyncedCampaign_lastSyncJobId_idx" ON "SyncedCampaign"("lastSyncJobId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedCampaign_providerId_externalAccountId_externalId_key" ON "SyncedCampaign"("providerId", "externalAccountId", "externalId");

-- CreateIndex
CREATE INDEX "SyncedAdGroup_organizationId_idx" ON "SyncedAdGroup"("organizationId");

-- CreateIndex
CREATE INDEX "SyncedAdGroup_externalAccountId_idx" ON "SyncedAdGroup"("externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedAdGroup_syncedCampaignId_externalId_key" ON "SyncedAdGroup"("syncedCampaignId", "externalId");

-- CreateIndex
CREATE INDEX "SyncedAd_organizationId_idx" ON "SyncedAd"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedAd_syncedAdGroupId_externalId_key" ON "SyncedAd"("syncedAdGroupId", "externalId");

-- CreateIndex
CREATE INDEX "SyncedKeyword_organizationId_idx" ON "SyncedKeyword"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedKeyword_syncedAdGroupId_externalId_key" ON "SyncedKeyword"("syncedAdGroupId", "externalId");

-- CreateIndex
CREATE INDEX "SyncJob_jobType_createdAt_idx" ON "SyncJob"("jobType", "createdAt");

-- AddForeignKey
ALTER TABLE "SyncedCampaign" ADD CONSTRAINT "SyncedCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedCampaign" ADD CONSTRAINT "SyncedCampaign_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedCampaign" ADD CONSTRAINT "SyncedCampaign_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedCampaign" ADD CONSTRAINT "SyncedCampaign_lastSyncJobId_fkey" FOREIGN KEY ("lastSyncJobId") REFERENCES "SyncJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedAdGroup" ADD CONSTRAINT "SyncedAdGroup_syncedCampaignId_fkey" FOREIGN KEY ("syncedCampaignId") REFERENCES "SyncedCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedAd" ADD CONSTRAINT "SyncedAd_syncedAdGroupId_fkey" FOREIGN KEY ("syncedAdGroupId") REFERENCES "SyncedAdGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedKeyword" ADD CONSTRAINT "SyncedKeyword_syncedAdGroupId_fkey" FOREIGN KEY ("syncedAdGroupId") REFERENCES "SyncedAdGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
