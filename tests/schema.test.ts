import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SEED_PROVIDERS } from "@/lib/providers";
import { ALL_ACTIONS, ALL_RESOURCES, buildRolePermissionRows } from "@/lib/permissions";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("schema v1.1 locks", () => {
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
      "DryRunJob",
      "ChangeRequest",
      "AuditEvent",
      "RolePermission",
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
});
