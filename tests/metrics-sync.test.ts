import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertMetricsSyncReadOnly,
  buildMetricsSearchQuery,
  countMetrics,
  defaultMetricWindow,
  formatMoneyMicros,
  mapLiveSearchRowsToSnapshots,
  METRICS_SYNC_JOB_TYPE,
  parseMetricsSyncInput,
} from "@/lib/metrics";
import { mockMetrics } from "@/lib/mock-data";
import { METRICS_SYNC_READ_ONLY_NOTE } from "@/lib/safety";

describe("metrics sync input", () => {
  it("defaults dry-run to true, last-7-days window, and requires a customer", () => {
    const now = new Date("2026-09-06T15:00:00.000Z");
    expect(parseMetricsSyncInput({ customerId: "123-456-7890" }, now)).toEqual({
      customerId: "1234567890",
      dryRun: true,
      dateFrom: "2026-08-31",
      dateTo: "2026-09-06",
    });
    expect(parseMetricsSyncInput({ customerId: "1234567890", dryRun: false }, now)).toEqual({
      customerId: "1234567890",
      dryRun: false,
      dateFrom: "2026-08-31",
      dateTo: "2026-09-06",
    });
    expect(
      parseMetricsSyncInput({
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
    expect(() => parseMetricsSyncInput({})).toThrow(/customerId/);
    expect(() => parseMetricsSyncInput({ customerId: "1234567890", dateFrom: "2026-09-01" })).toThrow(
      /together/,
    );
    expect(() =>
      parseMetricsSyncInput({
        customerId: "1234567890",
        dateFrom: "2026-09-03",
        dateTo: "2026-09-01",
      }),
    ).toThrow(/on or before/);
  });

  it("refuses enable, unpause, spend, and mutate payloads", () => {
    expect(() => parseMetricsSyncInput({ customerId: "1234567890", enable: true })).toThrow(
      METRICS_SYNC_READ_ONLY_NOTE,
    );
    expect(() => parseMetricsSyncInput({ customerId: "1234567890", unpause: true })).toThrow(
      /read-only/i,
    );
    expect(() => parseMetricsSyncInput({ customerId: "1234567890", spend: true })).toThrow(
      /read-only/i,
    );
    expect(() =>
      parseMetricsSyncInput({
        customerId: "1234567890",
        mutateOperations: [{ campaignOperation: { update: { status: "ENABLED" } } }],
      }),
    ).toThrow(/read-only/i);
    expect(() => assertMetricsSyncReadOnly({ status: "ENABLED", apply: true })).toThrow(/read-only/i);
  });
});

describe("mock metric fixtures", () => {
  it("demos PAUSED Search + ENABLED Display budget/spend without live Ads", () => {
    const snapshots = mockMetrics("1234567890", "2026-08-31", "2026-09-06");
    const counts = countMetrics(snapshots);
    expect(METRICS_SYNC_JOB_TYPE).toBe("sync_metrics");
    expect(counts).toEqual({ campaigns: 2, withSpend: 1 });
    expect(snapshots[0]?.campaignStatus).toBe("PAUSED");
    expect(snapshots[0]?.budgetAmountMicros).toBe("25000000");
    expect(snapshots[0]?.costMicros).toBe("0");
    expect(snapshots[1]?.campaignStatus).toBe("ENABLED");
    expect(snapshots[1]?.costMicros).toBe("123450000");
    expect(formatMoneyMicros(snapshots[1]?.budgetAmountMicros)).toBe("$40.00");
    expect(formatMoneyMicros(snapshots[1]?.costMicros)).toBe("$123.45");
  });
});

describe("live GAQL row mapping", () => {
  it("maps campaign budget and cost metrics into typed snapshots", () => {
    const snapshots = mapLiveSearchRowsToSnapshots({
      dateFrom: "2026-08-31",
      dateTo: "2026-09-06",
      currencyCode: "USD",
      rows: [
        {
          campaign: {
            id: "100",
            resourceName: "customers/1/campaigns/100",
            name: "Live Search",
            status: "PAUSED",
            advertisingChannelType: "SEARCH",
          },
          campaignBudget: {
            resourceName: "customers/1/campaignBudgets/9",
            amountMicros: "15000000",
            period: "DAILY",
          },
          metrics: {
            costMicros: "2500000",
            impressions: 80,
            clicks: 4,
            conversions: 1.5,
            conversionsValue: 42,
            averageCpc: "625000",
            averageCpm: "31250000",
          },
        },
      ],
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.budgetAmountMicros).toBe("15000000");
    expect(snapshots[0]?.costMicros).toBe("2500000");
    expect(snapshots[0]?.conversionsText).toBe("1.5");
    expect(snapshots[0]?.clicks).toBe("4");
    expect(countMetrics(snapshots)).toEqual({ campaigns: 1, withSpend: 1 });
  });
});

describe("metrics GAQL window", () => {
  it("builds a search-only query with a sanitized date range", () => {
    const query = buildMetricsSearchQuery("2026-08-31", "2026-09-06");
    expect(query).toMatch(/FROM campaign/i);
    expect(query).toMatch(/campaign_budget.amount_micros/);
    expect(query).toMatch(/metrics.cost_micros/);
    expect(query).toContain("BETWEEN '2026-08-31' AND '2026-09-06'");
    expect(query).not.toMatch(/mutate/i);
    expect(() => buildMetricsSearchQuery("2026-09-31", "2026-09-06")).toThrow(/real calendar date/);
    expect(() => buildMetricsSearchQuery("yesterday; DROP", "2026-09-06")).toThrow(/YYYY-MM-DD/);
    expect(defaultMetricWindow(new Date("2026-09-06T00:00:00.000Z"))).toEqual({
      dateFrom: "2026-08-31",
      dateTo: "2026-09-06",
    });
  });
});

describe("metrics sync source locks", () => {
  it("does not ship a mutate, enable, or spend path", () => {
    const sync = readFileSync(resolve(process.cwd(), "src/lib/metrics-sync.ts"), "utf8");
    expect(sync).toContain("jobType: METRICS_SYNC_JOB_TYPE");
    expect(sync).toContain("readOnly: true");
    expect(sync).toContain("searchGoogleAds");
    expect(sync).not.toContain("googleAds:mutate");
    expect(sync).not.toContain("mutateGoogleAds");
    expect(sync).not.toContain('status: "ENABLED"');
  });
});
