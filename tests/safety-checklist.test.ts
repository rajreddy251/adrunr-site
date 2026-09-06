import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { IMPLEMENTED_CAMPAIGN_OP_KINDS } from "@/lib/campaign";
import { CONFIRM_PAUSED_PHRASE, assertPausedOnly } from "@/lib/safety";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
const gitignore = readFileSync(resolve(process.cwd(), ".gitignore"), "utf8");

describe("P7 Hotel / Local / Local Services safety checklist", () => {
  it("keeps Search, Display, Performance Max, Demand Gen, Video, Shopping, App, Hotel, Local, and Local Services create implemented and never enables spend", () => {
    expect(IMPLEMENTED_CAMPAIGN_OP_KINDS).toEqual([
      "SEARCH_CREATE",
      "DISPLAY_CREATE",
      "PMAX_CREATE",
      "DEMAND_GEN_CREATE",
      "VIDEO_CREATE",
      "SHOPPING_CREATE",
      "APP_CREATE",
      "HOTEL_CREATE",
      "LOCAL_CREATE",
      "LOCAL_SERVICES_CREATE",
    ]);
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

  it("stores Demand Gen drafts as TEXT children with ad groups, ads, assets, and audiences", () => {
    expect(schema).toContain("model DemandGenCampaignDraft");
    expect(schema).toContain("model DemandGenAdGroupDraft");
    expect(schema).toContain("model DemandGenAdDraft");
    expect(schema).toContain("model DemandGenAudienceDraft");
    expect(schema).toContain("youtubeInStream");
    expect(schema).toContain("callToActionText");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("stores Video drafts as TEXT children with ad groups, ads, YouTube assets, and audiences", () => {
    expect(schema).toContain("model VideoCampaignDraft");
    expect(schema).toContain("model VideoAdGroupDraft");
    expect(schema).toContain("model VideoAdDraft");
    expect(schema).toContain("model VideoAudienceDraft");
    expect(schema).toContain("inStream");
    expect(schema).toContain("MANUAL_CPV");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("stores Shopping drafts as TEXT children with product groups and listings", () => {
    expect(schema).toContain("model ShoppingCampaignDraft");
    expect(schema).toContain("model ShoppingAdGroupDraft");
    expect(schema).toContain("model ShoppingProductGroupDraft");
    expect(schema).toContain("model ShoppingListingDraft");
    expect(schema).toContain("merchantCenterId");
    expect(schema).toContain("ALL_PRODUCTS");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("stores App drafts as TEXT children with platforms, app ids, and install/download goal", () => {
    expect(schema).toContain("model AppCampaignDraft");
    expect(schema).toContain("model AppPlatformDraft");
    expect(schema).toContain("model AppAdGroupDraft");
    expect(schema).toContain("model AppAdDraft");
    expect(schema).toContain("enum AppPlatform");
    expect(schema).toContain("INSTALLS");
    expect(schema).toContain("ANDROID");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("stores Hotel drafts as TEXT children with Hotel Center and ALL_HOTELS listings", () => {
    expect(schema).toContain("model HotelCampaignDraft");
    expect(schema).toContain("model HotelAdGroupDraft");
    expect(schema).toContain("model HotelListingDraft");
    expect(schema).toContain("hotelCenterId");
    expect(schema).toContain("ALL_HOTELS");
    expect(schema).toContain("PERCENT_CPC");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("stores Local drafts as TEXT children with locations, ads, and store-visit goal", () => {
    expect(schema).toContain("model LocalCampaignDraft");
    expect(schema).toContain("model LocalLocationDraft");
    expect(schema).toContain("model LocalAdGroupDraft");
    expect(schema).toContain("model LocalAdDraft");
    expect(schema).toContain("STORE_VISITS");
    expect(schema).toContain("PLACE_ID");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("stores Local Services drafts as TEXT children with PRIMARY categories and max lead bid", () => {
    expect(schema).toContain("model LocalServicesCampaignDraft");
    expect(schema).toContain("model LocalServicesCategoryDraft");
    expect(schema).toContain("model LocalServicesTargetDraft");
    expect(schema).toContain("maxLeadBidMicros");
    expect(schema).toContain("PRIMARY");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("never commits secrets or a live DATABASE_URL", () => {
    expect(envExample).toContain("DATABASE_URL=postgresql://USER:PASSWORD@HOST/dbname?sslmode=require");
    expect(envExample).not.toMatch(/neondb_owner|ep-[a-z0-9-]+\./i);
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain("!.env.example");
  });
});
