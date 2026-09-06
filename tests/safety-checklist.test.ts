import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { IMPLEMENTED_CAMPAIGN_OP_KINDS } from "@/lib/campaign";
import { CONFIRM_PAUSED_PHRASE, assertPausedOnly } from "@/lib/safety";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
const gitignore = readFileSync(resolve(process.cwd(), ".gitignore"), "utf8");

describe("P2 Performance Max safety checklist", () => {
  it("keeps Search, Display, and Performance Max create implemented and never enables spend", () => {
    expect(IMPLEMENTED_CAMPAIGN_OP_KINDS).toEqual(["SEARCH_CREATE", "DISPLAY_CREATE", "PMAX_CREATE"]);
    expect(CONFIRM_PAUSED_PHRASE).toBe("CREATE PAUSED");
    expect(() => assertPausedOnly("ENABLED")).toThrow(/enable path/);
  });

  it("stores Display drafts as TEXT children, not JSONB, and treats remarketing as an audience", () => {
    expect(schema).toContain("model DisplayAudienceDraft");
    expect(schema).toContain("enum DisplayAudienceKind");
    expect(schema).toContain("USER_LIST");
    expect(schema).not.toMatch(/\bJson\b/);
    expect(schema).not.toMatch(/REMARKETING_CREATE|REMARKETING_CAMPAIGN/);
  });

  it("stores Performance Max drafts as TEXT children with asset groups, signals, and listings", () => {
    expect(schema).toContain("model PerformanceMaxCampaignDraft");
    expect(schema).toContain("model PerformanceMaxAssetGroupDraft");
    expect(schema).toContain("model PerformanceMaxSignalDraft");
    expect(schema).toContain("model PerformanceMaxListingDraft");
    expect(schema).toContain("SEARCH_THEME");
    expect(schema).toContain("ALL_PRODUCTS");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("never commits secrets or a live DATABASE_URL", () => {
    expect(envExample).toContain("DATABASE_URL=postgresql://USER:PASSWORD@HOST/dbname?sslmode=require");
    expect(envExample).not.toMatch(/neondb_owner|ep-[a-z0-9-]+\./i);
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain("!.env.example");
  });
});
