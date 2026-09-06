-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "AssistantThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "draftId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadataText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMemory" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantThread_organizationId_clientId_idx" ON "AssistantThread"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "AssistantThread_clientId_draftId_idx" ON "AssistantThread"("clientId", "draftId");

-- CreateIndex
CREATE INDEX "AssistantThread_createdById_idx" ON "AssistantThread"("createdById");

-- CreateIndex
CREATE INDEX "AssistantMessage_threadId_createdAt_idx" ON "AssistantMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMemory_clientId_key_key" ON "ClientMemory"("clientId", "key");

-- CreateIndex
CREATE INDEX "ClientMemory_clientId_idx" ON "ClientMemory"("clientId");

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "SearchCampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AssistantThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMemory" ADD CONSTRAINT "ClientMemory_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
