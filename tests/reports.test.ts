import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { mockMetrics } from "@/lib/mock-data";
import {
  buildCampaignReport,
  CAMPAIGN_REPORT_JOB_TYPE,
  ENABLED_SNAPSHOT_NOTE,
  parseCampaignReportInput,
  rollupReportRows,
  snapshotStatusNote,
} from "@/lib/reports";
import { CAMPAIGN_REPORTS_NOTE, refuseEnableOnReport } from "@/lib/safety";

describe("campaign report input", () => {
  it("defaults dry-run to true and last-7-days window", () => {
    const now = new Date("2026-09-06T15:00:00.000Z");
    expect(parseCampaignReportInput({ customerId: "123-456-7890" }, now)).toEqual({
      customerId: "1234567890",
      dryRun: true,
      dateFrom: "2026-08-31",
      dateTo: "2026-09-06",
    });
    expect(parseCampaignReportInput({ customerId: "1234567890", dryRun: false }, now)).toEqual({
      customerId: "1234567890",
      dryRun: false,
      dateFrom: "2026-08-31",
      dateTo: "2026-09-06",
    });
    expect(
      parseCampaignReportInput({
        customerId: "1234567890",
        dateFrom: "2026-09-01",
        dateTo: "2026-09-03",
      }),
    ).toEqual({
      customerId: "1234567890",
      dryRun: true,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-03",
    });
    expect(() => parseCampaignReportInput({})).toThrow(/customerId/);
    expect(() => parseCampaignReportInput({ customerId: "1234567890", dateFrom: "2026-09-01" })).toThrow(
      /together/,
    );
    expect(() =>
      parseCampaignReportInput({
        customerId: "1234567890",
        dateFrom: "2026-09-03",
        dateTo: "2026-09-01",
      }),
    ).toThrow(/on or before/);
  });

  it("refuses enable, unpause, spend, and mutate payloads", () => {
    expect(() => parseCampaignReportInput({ customerId: "1234567890", enable: true })).toThrow(
      CAMPAIGN_REPORTS_NOTE,
    );
    expect(() => refuseEnableOnReport({ customerId: "1234567890", unpause: true })).toThrow(/read-only/i);
    expect(() => refuseEnableOnReport({ customerId: "1234567890", spend: true })).toThrow(/read-only/i);
    expect(() =>
      refuseEnableOnReport({
        customerId: "1234567890",
        mutateOperations: [{ campaignOperation: { update: { status: "ENABLED" } } }],
      }),
    ).toThrow(/read-only/i);
    expect(() => refuseEnableOnReport({ status: "ENABLED", apply: true })).toThrow(/read-only/i);
  });
});

describe("report rollup from mock metrics", () => {
  it("rolls spend / clicks / impressions / conversions and labels ENABLED as snapshot-only", () => {
    const snapshots = mockMetrics("1234567890", "2026-08-31", "2026-09-06");
    const built = buildCampaignReport(snapshots, "USD");
    expect(CAMPAIGN_REPORT_JOB_TYPE).toBe("report_performance");
    expect(built.summary).toMatchObject({
      campaignCount: 2,
      enabledSnapshotCount: 1,
      spendMicros: "123450000",
      clicks: "312",
      impressions: "18420",
      conversionsText: "9.5",
      currencyCode: "USD",
    });
    expect(built.rows[0]?.campaignStatus).toBe("PAUSED");
    expect(built.rows[0]?.statusSnapshotNote).toBeNull();
    expect(built.rows[1]?.campaignStatus).toBe("ENABLED");
    expect(built.rows[1]?.statusSnapshotNote).toBe(ENABLED_SNAPSHOT_NOTE);
    expect(snapshotStatusNote("ENABLED")).toMatch(/snapshot-only/i);
    expect(JSON.parse(built.previewText)).toMatchObject({
      readOnly: true,
      neverEnable: true,
      mutateAds: false,
    });
    expect(rollupReportRows(built.rows, "USD").enabledSnapshotCount).toBe(1);
  });
});

describe("report source locks", () => {
  it("does not ship a mutate, enable, or spend path", () => {
    const reports = readFileSync(resolve(process.cwd(), "src/lib/reports.ts"), "utf8");
    const reportsOps = readFileSync(resolve(process.cwd(), "src/lib/reports-ops.ts"), "utf8");
    const route = readFileSync(resolve(process.cwd(), "src/app/api/ads/reports/route.ts"), "utf8");
    const syncRoute = readFileSync(resolve(process.cwd(), "src/app/api/ads/reports/sync/route.ts"), "utf8");
    for (const source of [reports, reportsOps, route, syncRoute]) {
      expect(source).not.toContain("googleAds:mutate");
      expect(source).not.toContain("mutateGoogleAds");
    }
    expect(reportsOps).toContain("searchGoogleAds");
    expect(reportsOps).toContain("readOnly: true");
    expect(reportsOps).toContain("neverEnable: true");
    expect(reportsOps).toContain("if (input.dryRun)");
    expect(reports).toContain("refuseEnableOnReport");
    expect(route).toContain("neverEnable: true");
    expect(syncRoute).toContain("neverEnable: true");
  });
});
