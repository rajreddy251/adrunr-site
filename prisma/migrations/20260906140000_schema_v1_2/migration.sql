-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignOpKind" ADD VALUE 'PMAX_CREATE';
ALTER TYPE "CampaignOpKind" ADD VALUE 'DISPLAY_CREATE';
ALTER TYPE "CampaignOpKind" ADD VALUE 'META_CAMPAIGN_CREATE';
ALTER TYPE "CampaignOpKind" ADD VALUE 'TIKTOK_CAMPAIGN_CREATE';
ALTER TYPE "CampaignOpKind" ADD VALUE 'LINKEDIN_CAMPAIGN_CREATE';
ALTER TYPE "CampaignOpKind" ADD VALUE 'GENERIC_MUTATE';

-- CreateTable
CREATE TABLE "ClientRolePermission" (
    "id" TEXT NOT NULL,
    "role" "ClientMemberRole" NOT NULL,
    "resource" "PermissionResource" NOT NULL,
    "action" "PermissionAction" NOT NULL,

    CONSTRAINT "ClientRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientRolePermission_role_idx" ON "ClientRolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRolePermission_role_resource_action_key" ON "ClientRolePermission"("role", "resource", "action");

-- AddForeignKey
ALTER TABLE "AgentClientAssignment" ADD CONSTRAINT "AgentClientAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentClientAssignment" ADD CONSTRAINT "AgentClientAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
