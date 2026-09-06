-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('PLATFORM', 'AGENCY');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('PLATFORM_OPS', 'AGENCY_OWNER', 'AGENCY_ADMIN', 'AGENCY_MANAGER', 'AGENT', 'VIEWER', 'FINANCE');

-- CreateEnum
CREATE TYPE "ClientMemberRole" AS ENUM ('CLIENT_ADMIN', 'CLIENT_USER', 'CLIENT_VIEWER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProviderCategory" AS ENUM ('ADS', 'ANALYTICS', 'HEATMAP', 'OTHER');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "ExternalAccountStatus" AS ENUM ('UNKNOWN', 'ENABLED', 'CANCELED', 'SUSPENDED', 'NOT_ENABLED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ExternalEntityType" AS ENUM ('CAMPAIGN', 'AD_GROUP', 'AD', 'PROPERTY', 'PROJECT', 'PIXEL', 'OTHER');

-- CreateEnum
CREATE TYPE "CampaignOpKind" AS ENUM ('SEARCH_CREATE');

-- CreateEnum
CREATE TYPE "CampaignOpStatus" AS ENUM ('DRAFT', 'DRY_RUN_VALIDATED', 'APPLIED_PAUSED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PermissionResource" AS ENUM ('ORGANIZATION', 'MEMBERSHIP', 'CLIENT', 'WORKSPACE', 'INTEGRATION_PROVIDER', 'OAUTH_CONNECTION', 'EXTERNAL_ACCOUNT', 'EXTERNAL_ENTITY', 'CAMPAIGN_OP', 'SYNC_JOB', 'AUDIT_EVENT', 'BILLING');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'CONNECT', 'DISCONNECT', 'LIST', 'DRY_RUN', 'APPLY_PAUSED', 'INVITE', 'ASSIGN', 'SYNC');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL DEFAULT 'AGENCY',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "imageUrl" TEXT,
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMembership" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClientMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentClientAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentClientAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationProvider" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProviderCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "oauthAuthUrl" TEXT,
    "oauthTokenUrl" TEXT,
    "defaultScopes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "providerId" TEXT NOT NULL,
    "providerAccountEmail" TEXT,
    "scopes" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "oauthConnectionId" TEXT,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "currencyCode" TEXT,
    "timeZone" TEXT,
    "isManager" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExternalAccountStatus" NOT NULL DEFAULT 'UNKNOWN',
    "parentExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalEntity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "entityType" "ExternalEntityType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT,
    "attributesText" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignOp" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "providerId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "kind" "CampaignOpKind" NOT NULL DEFAULT 'SEARCH_CREATE',
    "status" "CampaignOpStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "dailyBudgetMicros" BIGINT,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "confirmPhrase" TEXT,
    "requestPayload" TEXT NOT NULL,
    "responsePayload" TEXT,
    "googleValidateOnly" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignOp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DryRunJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "campaignOpId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "validateOnly" BOOLEAN NOT NULL DEFAULT true,
    "requestBody" TEXT NOT NULL,
    "responseBody" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DryRunJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "campaignOpId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "approved" BOOLEAN,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "jobType" TEXT NOT NULL,
    "requestBody" TEXT,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorUserId" TEXT,
    "providerId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadataText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "resource" "PermissionResource" NOT NULL,
    "action" "PermissionAction" NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_email_idx" ON "Invitation"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Client_organizationId_idx" ON "Client"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_organizationId_slug_key" ON "Client"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ClientMembership_userId_idx" ON "ClientMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMembership_clientId_userId_key" ON "ClientMembership"("clientId", "userId");

-- CreateIndex
CREATE INDEX "AgentClientAssignment_organizationId_userId_idx" ON "AgentClientAssignment"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentClientAssignment_clientId_userId_key" ON "AgentClientAssignment"("clientId", "userId");

-- CreateIndex
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");

-- CreateIndex
CREATE INDEX "Workspace_clientId_idx" ON "Workspace"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationProvider_slug_key" ON "IntegrationProvider"("slug");

-- CreateIndex
CREATE INDEX "OAuthConnection_organizationId_providerId_idx" ON "OAuthConnection"("organizationId", "providerId");

-- CreateIndex
CREATE INDEX "OAuthConnection_userId_idx" ON "OAuthConnection"("userId");

-- CreateIndex
CREATE INDEX "ExternalAccount_clientId_idx" ON "ExternalAccount"("clientId");

-- CreateIndex
CREATE INDEX "ExternalAccount_providerId_idx" ON "ExternalAccount"("providerId");

-- CreateIndex
CREATE INDEX "ExternalAccount_oauthConnectionId_idx" ON "ExternalAccount"("oauthConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccount_organizationId_providerId_externalId_key" ON "ExternalAccount"("organizationId", "providerId", "externalId");

-- CreateIndex
CREATE INDEX "ExternalEntity_organizationId_providerId_idx" ON "ExternalEntity"("organizationId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEntity_providerId_externalAccountId_entityType_exte_key" ON "ExternalEntity"("providerId", "externalAccountId", "entityType", "externalId");

-- CreateIndex
CREATE INDEX "CampaignOp_organizationId_status_idx" ON "CampaignOp"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CampaignOp_providerId_externalAccountId_idx" ON "CampaignOp"("providerId", "externalAccountId");

-- CreateIndex
CREATE INDEX "CampaignOp_clientId_idx" ON "CampaignOp"("clientId");

-- CreateIndex
CREATE INDEX "DryRunJob_organizationId_createdAt_idx" ON "DryRunJob"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "DryRunJob_campaignOpId_idx" ON "DryRunJob"("campaignOpId");

-- CreateIndex
CREATE INDEX "ChangeRequest_organizationId_createdAt_idx" ON "ChangeRequest"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeRequest_providerId_idx" ON "ChangeRequest"("providerId");

-- CreateIndex
CREATE INDEX "SyncJob_organizationId_providerId_createdAt_idx" ON "SyncJob"("organizationId", "providerId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncJob_status_idx" ON "SyncJob"("status");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_providerId_resourceType_resourceId_idx" ON "AuditEvent"("providerId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_resource_action_key" ON "RolePermission"("role", "resource", "action");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentClientAssignment" ADD CONSTRAINT "AgentClientAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAccount" ADD CONSTRAINT "ExternalAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAccount" ADD CONSTRAINT "ExternalAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAccount" ADD CONSTRAINT "ExternalAccount_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAccount" ADD CONSTRAINT "ExternalAccount_oauthConnectionId_fkey" FOREIGN KEY ("oauthConnectionId") REFERENCES "OAuthConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEntity" ADD CONSTRAINT "ExternalEntity_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOp" ADD CONSTRAINT "CampaignOp_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DryRunJob" ADD CONSTRAINT "DryRunJob_campaignOpId_fkey" FOREIGN KEY ("campaignOpId") REFERENCES "CampaignOp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DryRunJob" ADD CONSTRAINT "DryRunJob_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_campaignOpId_fkey" FOREIGN KEY ("campaignOpId") REFERENCES "CampaignOp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

