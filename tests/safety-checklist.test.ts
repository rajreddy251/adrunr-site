import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { IMPLEMENTED_CAMPAIGN_OP_KINDS } from "@/lib/campaign";
import {
  CAMPAIGN_EDIT_NOTE,
  CAMPAIGN_IMPORT_NOTE,
  CAMPAIGN_REPORTS_NOTE,
  CONFIRM_EDIT_PHRASE,
  CONFIRM_PAUSED_PHRASE,
  LISTINGS_SYNC_READ_ONLY_NOTE,
  METRICS_SYNC_READ_ONLY_NOTE,
  assertEditDoesNotEnable,
  assertPausedOnly,
  refuseEnableOnReport,
} from "@/lib/safety";
import {
  CAMPAIGN_IMPORT_JOB_TYPE,
  parseCampaignImportInput,
  refuseEnableOnImport,
} from "@/lib/campaign-import";
import {
  AD_SEARCH_QUERY,
  CAMPAIGN_SEARCH_QUERY,
  KEYWORD_SEARCH_QUERY,
  LISTINGS_SYNC_JOB_TYPE,
} from "@/lib/listings";
import { METRICS_SYNC_JOB_TYPE, buildMetricsSearchQuery } from "@/lib/metrics";
import { CAMPAIGN_REPORT_JOB_TYPE, parseCampaignReportInput } from "@/lib/reports";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
const gitignore = readFileSync(resolve(process.cwd(), ".gitignore"), "utf8");

describe("P12 Ops Reports safety checklist", () => {
  it("keeps create wizards, listings, metrics, safe edit, and import working, with reports refusing ENABLE", () => {
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
      "CAMPAIGN_EDIT",
    ]);
    expect(CONFIRM_PAUSED_PHRASE).toBe("CREATE PAUSED");
    expect(CONFIRM_EDIT_PHRASE).toBe("EDIT SAFE");
    expect(CAMPAIGN_IMPORT_JOB_TYPE).toBe("import_campaign");
    expect(CAMPAIGN_REPORT_JOB_TYPE).toBe("report_performance");
    expect(CAMPAIGN_REPORTS_NOTE).toMatch(/read-only/i);
    expect(CAMPAIGN_IMPORT_NOTE).toMatch(/never enable/i);
    expect(CAMPAIGN_EDIT_NOTE).toMatch(/never enables/i);
    expect(LISTINGS_SYNC_READ_ONLY_NOTE).toMatch(/read-only/i);
    expect(METRICS_SYNC_READ_ONLY_NOTE).toMatch(/read-only/i);
    expect(() => assertPausedOnly("ENABLED")).toThrow(/enable path/);
    expect(() => refuseEnableOnReport({ customerId: "1234567890", enable: true })).toThrow(
      CAMPAIGN_REPORTS_NOTE,
    );
    expect(() => refuseEnableOnImport({ customerId: "1234567890", enable: true })).toThrow(
      CAMPAIGN_IMPORT_NOTE,
    );
  });

  it("stores CampaignReportJob / rows / summary as TEXT, not JSONB", () => {
    expect(schema).toContain("model CampaignReportJob");
    expect(schema).toContain("model CampaignReportRow");
    expect(schema).toContain("model CampaignReportSummary");
    expect(schema).toContain("requestBody");
    expect(schema).toContain("responseBody");
    expect(schema).toContain("previewText");
    expect(schema).toContain("notesText");
    expect(schema).toContain("neverEnable");
    expect(schema).toContain("statusSnapshotNote");
    expect(schema).toContain("CAMPAIGN_REPORT_JOB");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("report APIs default dry-run and never ship an enable path", () => {
    expect(parseCampaignReportInput({ customerId: "123-456-7890" }, new Date("2026-09-06T15:00:00.000Z"))).toEqual({
      customerId: "1234567890",
      dryRun: true,
      dateFrom: "2026-08-31",
      dateTo: "2026-09-06",
    });
    const reports = readFileSync(resolve(process.cwd(), "src/lib/reports.ts"), "utf8");
    const reportsOps = readFileSync(resolve(process.cwd(), "src/lib/reports-ops.ts"), "utf8");
    const reportRoute = readFileSync(resolve(process.cwd(), "src/app/api/ads/reports/route.ts"), "utf8");
    const syncRoute = readFileSync(resolve(process.cwd(), "src/app/api/ads/reports/sync/route.ts"), "utf8");
    expect(reports).toContain("refuseEnableOnReport");
    expect(reportsOps).toContain("neverEnable: true");
    expect(reportsOps).toContain("readOnly: true");
    expect(reportsOps).toContain("searchGoogleAds");
    expect(reportsOps).not.toContain("mutateGoogleAds");
    expect(reportsOps).not.toContain("googleAds:mutate");
    expect(reportRoute).toContain("neverEnable: true");
    expect(reportRoute).toContain("enablePath: false");
    expect(syncRoute).toContain("neverEnable: true");
    expect(reports).not.toMatch(/status:\s*"ENABLED"/);
    expect(reportsOps).not.toMatch(/status:\s*"ENABLED"/);
  });
});

describe("P11 Ops Import safety checklist", () => {
  it("keeps create wizards, listings, metrics, and safe edit working, with import refusing ENABLE", () => {
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
      "CAMPAIGN_EDIT",
    ]);
    expect(CONFIRM_PAUSED_PHRASE).toBe("CREATE PAUSED");
    expect(CONFIRM_EDIT_PHRASE).toBe("EDIT SAFE");
    expect(CAMPAIGN_IMPORT_JOB_TYPE).toBe("import_campaign");
    expect(CAMPAIGN_IMPORT_NOTE).toMatch(/never enable/i);
    expect(CAMPAIGN_EDIT_NOTE).toMatch(/never enables/i);
    expect(LISTINGS_SYNC_READ_ONLY_NOTE).toMatch(/read-only/i);
    expect(METRICS_SYNC_READ_ONLY_NOTE).toMatch(/read-only/i);
    expect(() => assertPausedOnly("ENABLED")).toThrow(/enable path/);
    expect(() => refuseEnableOnImport({ customerId: "1234567890", enable: true })).toThrow(
      CAMPAIGN_IMPORT_NOTE,
    );
  });

  it("stores CampaignImportJob and draft provenance as TEXT, not JSONB", () => {
    expect(schema).toContain("model CampaignImportJob");
    expect(schema).toContain("importProvenanceText");
    expect(schema).toContain("sourceCampaignExternalId");
    expect(schema).toContain("neverEnable");
    expect(schema).toContain("previewText");
    expect(schema).toContain("CAMPAIGN_IMPORT_JOB");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("import APIs default dry-run and never ship an enable path", () => {
    expect(parseCampaignImportInput({ customerId: "123-456-7890", campaignExternalId: "111" })).toEqual({
      customerId: "1234567890",
      syncedCampaignId: null,
      campaignExternalId: "111",
      dryRun: true,
    });
    const importLib = readFileSync(resolve(process.cwd(), "src/lib/campaign-import.ts"), "utf8");
    const importOps = readFileSync(resolve(process.cwd(), "src/lib/campaign-import-ops.ts"), "utf8");
    const importRoute = readFileSync(resolve(process.cwd(), "src/app/api/ads/imports/route.ts"), "utf8");
    expect(importLib).toContain("refuseEnableOnImport");
    expect(importLib).toContain("applyPath: \"PAUSED\"");
    expect(importOps).toContain("neverEnable: true");
    expect(importOps).not.toContain("mutateGoogleAds");
    expect(importOps).not.toContain("googleAds:mutate");
    expect(importRoute).toContain("enablePath: false");
    expect(importRoute).toContain("neverEnable: true");
    expect(importLib).not.toMatch(/status:\s*"ENABLED"/);
    expect(importOps).not.toMatch(/status:\s*"ENABLED"/);
  });
});

describe("P10 Ops Edit safety checklist", () => {
  it("keeps create wizards, listings, and metrics working, with edit refusing ENABLE", () => {
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
      "CAMPAIGN_EDIT",
    ]);
    expect(CONFIRM_PAUSED_PHRASE).toBe("CREATE PAUSED");
    expect(CONFIRM_EDIT_PHRASE).toBe("EDIT SAFE");
    expect(CAMPAIGN_EDIT_NOTE).toMatch(/never enables/i);
    expect(LISTINGS_SYNC_READ_ONLY_NOTE).toMatch(/read-only/i);
    expect(METRICS_SYNC_READ_ONLY_NOTE).toMatch(/read-only/i);
    expect(() => assertPausedOnly("ENABLED")).toThrow(/enable path/);
    expect(() => assertEditDoesNotEnable("ENABLED")).toThrow(/enable path/);
    expect(() => assertEditDoesNotEnable("PAUSED")).toThrow(/never set status/);
  });

  it("stores CampaignEditDraft as TEXT children, not JSONB", () => {
    expect(schema).toContain("model CampaignEditDraft");
    expect(schema).toContain("proposedName");
    expect(schema).toContain("proposedDailyBudgetMicros");
    expect(schema).toContain("proposedBidMicros");
    expect(schema).toContain("criterionText");
    expect(schema).toContain("CAMPAIGN_EDIT");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("validate-then-confirm edit APIs never ship an enable path", () => {
    const edit = readFileSync(resolve(process.cwd(), "src/lib/campaign-edit.ts"), "utf8");
    const editOps = readFileSync(resolve(process.cwd(), "src/lib/campaign-edit-ops.ts"), "utf8");
    const applyRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/ads/edits/drafts/[id]/apply/route.ts"),
      "utf8",
    );
    const validateRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/ads/edits/drafts/[id]/validate/route.ts"),
      "utf8",
    );
    expect(edit).toContain("refuseEnableOnEdit");
    expect(edit).toContain("assertNoStatusInMutate");
    expect(edit).toContain("EDIT SAFE");
    expect(editOps).toContain("kind: \"CAMPAIGN_EDIT\"");
    expect(editOps).toContain("enablePath: false");
    expect(applyRoute).toContain("dryRun: false");
    expect(validateRoute).toContain("dryRun: true");
    expect(applyRoute).toContain("enablePath: false");
    expect(validateRoute).toContain("enablePath: false");
    expect(edit).not.toMatch(/status:\s*"ENABLED"/);
    expect(editOps).not.toMatch(/status:\s*"ENABLED"/);
  });
});

describe("P9 Ops Metrics snapshot safety checklist", () => {
  it("keeps create wizards and listings sync working, with metrics read-only", () => {
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
      "CAMPAIGN_EDIT",
    ]);
    expect(LISTINGS_SYNC_JOB_TYPE).toBe("sync_listings");
    expect(METRICS_SYNC_JOB_TYPE).toBe("sync_metrics");
    expect(LISTINGS_SYNC_READ_ONLY_NOTE).toMatch(/read-only/i);
    expect(METRICS_SYNC_READ_ONLY_NOTE).toMatch(/read-only/i);
    expect(METRICS_SYNC_READ_ONLY_NOTE).toMatch(/spend/i);
    expect(() => assertPausedOnly("ENABLED")).toThrow(/enable path/);
  });

  it("stores CampaignMetricSnapshot as typed budget/spend columns, not JSONB", () => {
    expect(schema).toContain("model CampaignMetricSnapshot");
    expect(schema).toContain("budgetAmountMicros");
    expect(schema).toContain("costMicros");
    expect(schema).toContain("averageCpcMicros");
    expect(schema).toContain("conversionsText");
    expect(schema).toContain("model SyncJob");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("uses GAQL search only for metrics pull — no mutate, enable, or spend path", () => {
    const query = buildMetricsSearchQuery("2026-08-31", "2026-09-06");
    expect(query).toMatch(/FROM campaign/i);
    expect(query).toMatch(/metrics.cost_micros/);
    expect(query).not.toMatch(/mutate/i);
    const metrics = readFileSync(resolve(process.cwd(), "src/lib/metrics.ts"), "utf8");
    const metricsSync = readFileSync(resolve(process.cwd(), "src/lib/metrics-sync.ts"), "utf8");
    const syncRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/ads/metrics/sync/route.ts"),
      "utf8",
    );
    const listingsSync = readFileSync(resolve(process.cwd(), "src/lib/listings-sync.ts"), "utf8");
    for (const source of [metrics, metricsSync, syncRoute]) {
      expect(source).not.toContain("googleAds:mutate");
      expect(source).not.toContain("mutateGoogleAds");
    }
    expect(metrics).toContain("mutateOperations");
    expect(metricsSync).not.toContain("mutateOperations");
    expect(syncRoute).not.toContain("mutateOperations");
    expect(metricsSync).toContain("searchGoogleAds");
    expect(metricsSync).toContain("readOnly: true");
    expect(listingsSync).toContain("searchGoogleAds");
    expect(listingsSync).toContain("readOnly: true");
  });
});

describe("P8 Ops Sync listings safety checklist", () => {
  it("keeps create wizards implemented and listings sync read-only", () => {
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
      "CAMPAIGN_EDIT",
    ]);
    expect(LISTINGS_SYNC_JOB_TYPE).toBe("sync_listings");
    expect(LISTINGS_SYNC_READ_ONLY_NOTE).toMatch(/read-only/i);
    expect(() => assertPausedOnly("ENABLED")).toThrow(/enable path/);
  });

  it("stores synced listings as TEXT children and extends SyncJob", () => {
    expect(schema).toContain("model SyncedCampaign");
    expect(schema).toContain("model SyncedAdGroup");
    expect(schema).toContain("model SyncedAd");
    expect(schema).toContain("model SyncedKeyword");
    expect(schema).toContain("model SyncJob");
    expect(schema).toContain("readOnly");
    expect(schema).toContain("attributesText");
    expect(schema).not.toMatch(/\bJson\b/);
  });

  it("uses GAQL search only for listings pull — no mutate path", () => {
    expect(CAMPAIGN_SEARCH_QUERY).toMatch(/FROM campaign/i);
    expect(AD_SEARCH_QUERY).toMatch(/FROM ad_group_ad/i);
    expect(KEYWORD_SEARCH_QUERY).toMatch(/FROM ad_group_criterion/i);
    expect(CAMPAIGN_SEARCH_QUERY).not.toMatch(/mutate/i);
    const listings = readFileSync(resolve(process.cwd(), "src/lib/listings.ts"), "utf8");
    const listingsSync = readFileSync(resolve(process.cwd(), "src/lib/listings-sync.ts"), "utf8");
    const syncRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/ads/listings/sync/route.ts"),
      "utf8",
    );
    for (const source of [listings, listingsSync, syncRoute]) {
      expect(source).not.toContain("googleAds:mutate");
      expect(source).not.toContain("mutateGoogleAds");
    }
    expect(listings).toContain("mutateOperations");
    expect(listingsSync).not.toContain("mutateOperations");
    expect(syncRoute).not.toContain("mutateOperations");
    expect(listingsSync).toContain("searchGoogleAds");
    expect(listingsSync).toContain("readOnly: true");
  });
});

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
      "CAMPAIGN_EDIT",
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

describe("GA4 Connect safety checklist", () => {
  it("lists only accessible properties, keeps key events stubbed, and refuses spend CTAs", () => {
    const ga4 = readFileSync(resolve(process.cwd(), "src/lib/ga4.ts"), "utf8");
    const panel = readFileSync(resolve(process.cwd(), "src/components/ga4-panel.tsx"), "utf8");
    const providers = readFileSync(resolve(process.cwd(), "src/lib/providers.ts"), "utf8");
    expect(ga4).toContain("findAccessibleGa4Property");
    expect(ga4).toContain("accountSummaries");
    expect(ga4).toContain("runReport");
    expect(ga4).toContain("GA4_KEY_EVENTS_NOTE");
    expect(ga4).not.toContain("googleAds:mutate");
    expect(providers).toContain("analytics.readonly");
    expect(providers).toContain("analytics.edit");
    expect(panel).toContain("GA4_KEY_EVENTS_NOTE");
    expect(readFileSync(resolve(process.cwd(), "src/lib/ga4-shared.ts"), "utf8")).toContain(
      "Key events — Coming soon",
    );
    expect(panel).not.toMatch(/>\s*Enable\s*</);
    expect(panel).not.toMatch(/go-live/i);
    expect(schema).not.toMatch(/model Ga4Property/);
    expect(envExample).toContain("Property picker + bind");
  });
});
