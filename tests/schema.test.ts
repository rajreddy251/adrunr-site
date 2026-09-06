import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CAMPAIGN_OP_KINDS, IMPLEMENTED_CAMPAIGN_OP_KINDS } from "@/lib/campaign";
import { SEED_PROVIDERS } from "@/lib/providers";
import {
  ALL_ACTIONS,
  ALL_RESOURCES,
  buildClientRolePermissionRows,
  buildRolePermissionRows,
  clientRoleHasPermission,
} from "@/lib/permissions";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const v12Migration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260906140000_schema_v1_2/migration.sql"),
  "utf8",
);
const v13Migration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260906160000_schema_v1_3/migration.sql"),
  "utf8",
);

describe("schema v1.2 locks", () => {
  it("does not use JSONB / Prisma Json types", () => {
    expect(schema).not.toMatch(/\bJson\b/);
    expect(schema).not.toMatch(/jsonb/i);
  });

  it("does not keep Google-only first-class models", () => {
    expect(schema).not.toMatch(/model AdsAccount/);
    expect(schema).not.toMatch(/model Ga4Property/);
    expect(schema).not.toMatch(/enum OAuthProvider/);
  });

  it("defines provider-agnostic models", () => {
    for (const model of [
      "IntegrationProvider",
      "OAuthConnection",
      "ExternalAccount",
      "ExternalEntity",
      "SyncJob",
      "CampaignOp",
      "SearchCampaignDraft",
      "SearchAdGroupDraft",
      "SearchKeywordDraft",
      "SearchAdDraft",
      "SearchTargetDraft",
      "DryRunJob",
      "ChangeRequest",
      "AuditEvent",
      "RolePermission",
      "ClientRolePermission",
      "AgentClientAssignment",
    ]) {
      expect(schema).toContain(`model ${model}`);
    }
  });

  it("stores tokens in encrypted TEXT columns", () => {
    expect(schema).toContain("accessTokenEncrypted");
    expect(schema).toContain("refreshTokenEncrypted");
    expect(schema).toContain("requestPayload");
    expect(schema).toContain("metadataText");
  });

  it("does not mention a file token store", () => {
    expect(schema).not.toContain("tokens.json");
  });

  it("expands CampaignOpKind without comments inside the enum", () => {
    const enumBlock = schema.match(/enum CampaignOpKind \{([^}]+)\}/)?.[1] ?? "";
    expect(enumBlock).not.toMatch(/\/\//);
    expect(CAMPAIGN_OP_KINDS).toEqual([
      "SEARCH_CREATE",
      "PMAX_CREATE",
      "DISPLAY_CREATE",
      "META_CAMPAIGN_CREATE",
      "TIKTOK_CAMPAIGN_CREATE",
      "LINKEDIN_CAMPAIGN_CREATE",
      "GENERIC_MUTATE",
    ]);
    for (const kind of CAMPAIGN_OP_KINDS) {
      expect(enumBlock).toContain(kind);
    }
    expect(IMPLEMENTED_CAMPAIGN_OP_KINDS).toEqual(["SEARCH_CREATE"]);
  });

  it("wires AgentClientAssignment to Organization, Client, and User", () => {
    const assignment = schema.match(/model AgentClientAssignment \{([^}]+)\}/)?.[1] ?? "";
    expect(assignment).toContain(
      "organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)",
    );
    expect(assignment).toContain(
      "client       Client       @relation(fields: [clientId], references: [id], onDelete: Cascade)",
    );
    expect(assignment).toContain(
      "user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)",
    );
    expect(schema).toContain("agentAssignments AgentClientAssignment[]");
    expect(schema).toContain("agentAssignments  AgentClientAssignment[]");
  });

  it("keeps ClientRolePermission separate from agency RolePermission", () => {
    const rolePermission = schema.match(/model RolePermission \{([^}]+)\}/)?.[1] ?? "";
    const clientRolePermission = schema.match(/model ClientRolePermission \{([^}]+)\}/)?.[1] ?? "";
    expect(rolePermission).toContain("MembershipRole");
    expect(rolePermission).not.toContain("ClientMemberRole");
    expect(clientRolePermission).toContain("ClientMemberRole");
    expect(clientRolePermission).not.toContain("MembershipRole");
  });

  it("ships an additive schema_v1_2 migration", () => {
    expect(v12Migration).toContain('ALTER TYPE "CampaignOpKind" ADD VALUE');
    expect(v12Migration).toContain('CREATE TABLE "ClientRolePermission"');
    expect(v12Migration).toContain("AgentClientAssignment_organizationId_fkey");
    expect(v12Migration).toContain("AgentClientAssignment_userId_fkey");
    expect(v12Migration).not.toMatch(/DROP TABLE/i);
    expect(v12Migration).not.toMatch(/jsonb/i);
  });
});

describe("schema v1.3 locks", () => {
  it("adds Search draft models and SEARCH_CAMPAIGN_DRAFT without JSONB", () => {
    expect(schema).toContain("enum SearchDraftStatus");
    expect(schema).toContain("SEARCH_CAMPAIGN_DRAFT");
    expect(schema).toContain("searchCampaignDraftId");
    expect(schema).toContain("googleCampaignResourceName");
    expect(schema).toContain("headlinesText");
    expect(schema).toContain("criterionText");
    expect(schema).not.toMatch(/\bJson\b/);
    expect(v13Migration).toContain('ALTER TYPE "PermissionResource" ADD VALUE \'SEARCH_CAMPAIGN_DRAFT\'');
    expect(v13Migration).toContain('CREATE TABLE "SearchCampaignDraft"');
    expect(v13Migration).toContain('CREATE TABLE "SearchAdGroupDraft"');
    expect(v13Migration).toContain('CREATE TABLE "SearchKeywordDraft"');
    expect(v13Migration).toContain('CREATE TABLE "SearchAdDraft"');
    expect(v13Migration).toContain('CREATE TABLE "SearchTargetDraft"');
    expect(v13Migration).toContain("CampaignOp_searchCampaignDraftId_fkey");
    expect(v13Migration).not.toMatch(/DROP TABLE/i);
    expect(v13Migration).not.toMatch(/jsonb/i);
  });
});

describe("seeded provider registry", () => {
  it("includes the required slugs", () => {
    expect(SEED_PROVIDERS.map((p) => p.slug)).toEqual([
      "google_ads",
      "google_analytics",
      "microsoft_clarity",
      "meta_ads",
      "tiktok_ads",
      "linkedin_ads",
      "heartza",
      "custom",
    ]);
  });
});

describe("role permissions", () => {
  it("covers every resource and action for PLATFORM_OPS", () => {
    const rows = buildRolePermissionRows().filter((row) => row.role === "PLATFORM_OPS");
    expect(rows.length).toBe(ALL_RESOURCES.length * ALL_ACTIONS.length);
  });

  it("does not put client roles on agency RolePermission", () => {
    const roles = new Set(buildRolePermissionRows().map((row) => row.role));
    expect(roles.has("CLIENT_ADMIN" as never)).toBe(false);
    expect(roles.has("CLIENT_USER" as never)).toBe(false);
    expect(roles.has("CLIENT_VIEWER" as never)).toBe(false);
  });
});

describe("client role permissions", () => {
  it("seeds READ/LIST defaults without mutating agency RolePermission", () => {
    const rows = buildClientRolePermissionRows();
    expect(rows).toHaveLength(20);
    expect(rows.every((row) => row.action === "READ" || row.action === "LIST")).toBe(true);

    expect(clientRoleHasPermission("CLIENT_ADMIN", "AUDIT_EVENT", "READ")).toBe(true);
    expect(clientRoleHasPermission("CLIENT_ADMIN", "AUDIT_EVENT", "LIST")).toBe(true);
    expect(clientRoleHasPermission("CLIENT_USER", "AUDIT_EVENT", "READ")).toBe(false);
    expect(clientRoleHasPermission("CLIENT_VIEWER", "AUDIT_EVENT", "READ")).toBe(false);

    for (const role of ["CLIENT_ADMIN", "CLIENT_USER", "CLIENT_VIEWER"] as const) {
      expect(clientRoleHasPermission(role, "EXTERNAL_ACCOUNT", "READ")).toBe(true);
      expect(clientRoleHasPermission(role, "EXTERNAL_ACCOUNT", "LIST")).toBe(true);
      expect(clientRoleHasPermission(role, "CAMPAIGN_OP", "READ")).toBe(true);
      expect(clientRoleHasPermission(role, "CAMPAIGN_OP", "LIST")).toBe(true);
      expect(clientRoleHasPermission(role, "CAMPAIGN_OP", "APPLY_PAUSED")).toBe(false);
      expect(clientRoleHasPermission(role, "SEARCH_CAMPAIGN_DRAFT", "READ")).toBe(true);
      expect(clientRoleHasPermission(role, "SEARCH_CAMPAIGN_DRAFT", "LIST")).toBe(true);
      expect(clientRoleHasPermission(role, "SEARCH_CAMPAIGN_DRAFT", "APPLY_PAUSED")).toBe(false);
    }
  });
});
