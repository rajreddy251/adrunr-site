import { digitsOnly } from "./ids";
import { METRICS_SYNC_READ_ONLY_NOTE, resolveDryRun } from "./safety";
import type { CampaignMetricSnapshotView, MetricSyncCounts } from "./types";

export const METRICS_SYNC_JOB_TYPE = "sync_metrics";
export const METRICS_WINDOW_DAYS = 7;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type MetricsSyncInput = {
  customerId: string;
  dryRun: boolean;
  dateFrom: string;
  dateTo: string;
};

export function utcDateString(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultMetricWindow(now = new Date()): { dateFrom: string; dateTo: string } {
  const dateTo = utcDateString(now);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (METRICS_WINDOW_DAYS - 1));
  return { dateFrom: utcDateString(start), dateTo };
}

export function assertIsoDate(value: string, field: string): string {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw Object.assign(new Error(`${field} must be YYYY-MM-DD.`), {
      status: 400,
      info: { kind: "validation", hint: "Use an ISO date such as 2026-09-01." },
    });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw Object.assign(new Error(`${field} is not a real calendar date.`), {
      status: 400,
      info: { kind: "validation", hint: "Check the month and day." },
    });
  }
  return value;
}

export function buildMetricsSearchQuery(dateFrom: string, dateTo: string): string {
  const from = assertIsoDate(dateFrom, "dateFrom");
  const to = assertIsoDate(dateTo, "dateTo");
  return `
  SELECT
    campaign.id,
    campaign.resource_name,
    campaign.name,
    campaign.status,
    campaign.advertising_channel_type,
    campaign_budget.resource_name,
    campaign_budget.amount_micros,
    campaign_budget.period,
    metrics.cost_micros,
    metrics.impressions,
    metrics.clicks,
    metrics.conversions,
    metrics.conversions_value,
    metrics.average_cpc,
    metrics.average_cpm
  FROM campaign
  WHERE segments.date BETWEEN '${from}' AND '${to}'
`.trim();
}

export function assertMetricsSyncReadOnly(body: Record<string, unknown>): void {
  const mutateKeys = ["mutateOperations", "mutate", "enable", "goLive", "unpause", "spend"];
  for (const key of mutateKeys) {
    const value = body[key];
    if (value === true || (Array.isArray(value) && value.length > 0) || (value && typeof value === "object")) {
      throw Object.assign(new Error(METRICS_SYNC_READ_ONLY_NOTE), {
        status: 400,
        info: { kind: "sync_read_only", hint: "Remove mutate/enable/spend fields. Metrics sync only searches Google Ads." },
      });
    }
  }
  const status = String(body.status ?? "").toUpperCase();
  if (status === "ENABLED" && (body.apply === true || body.persistStatus === true)) {
    throw Object.assign(new Error(METRICS_SYNC_READ_ONLY_NOTE), {
      status: 400,
      info: { kind: "sync_read_only", hint: "Metrics sync cannot apply ENABLED. Cached status is a snapshot only." },
    });
  }
}

export function parseMetricsSyncInput(body: unknown, now = new Date()): MetricsSyncInput {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  assertMetricsSyncReadOnly(record);
  const customerId = digitsOnly(String(record.customerId ?? ""));
  if (!customerId) {
    throw Object.assign(new Error("customerId is required."), {
      status: 400,
      info: { kind: "validation", hint: "Select an Ads customer, then sync metrics." },
    });
  }

  const hasFrom = record.dateFrom !== undefined && record.dateFrom !== null && String(record.dateFrom) !== "";
  const hasTo = record.dateTo !== undefined && record.dateTo !== null && String(record.dateTo) !== "";
  if (hasFrom !== hasTo) {
    throw Object.assign(new Error("dateFrom and dateTo must be provided together."), {
      status: 400,
      info: { kind: "validation", hint: "Pass both dates as YYYY-MM-DD, or omit both for the last 7 days." },
    });
  }

  const window = hasFrom
    ? { dateFrom: assertIsoDate(String(record.dateFrom), "dateFrom"), dateTo: assertIsoDate(String(record.dateTo), "dateTo") }
    : defaultMetricWindow(now);
  if (window.dateFrom > window.dateTo) {
    throw Object.assign(new Error("dateFrom must be on or before dateTo."), {
      status: 400,
      info: { kind: "validation", hint: "Reverse the date range." },
    });
  }

  return {
    customerId,
    dryRun: resolveDryRun(record.dryRun),
    dateFrom: window.dateFrom,
    dateTo: window.dateTo,
  };
}

export function countMetrics(snapshots: CampaignMetricSnapshotView[]): MetricSyncCounts {
  return {
    campaigns: snapshots.length,
    withSpend: snapshots.filter((row) => Number(row.costMicros ?? 0) > 0).length,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function lastResourceId(resourceName: unknown): string {
  const text = String(resourceName ?? "");
  const parts = text.split("/");
  const tail = parts[parts.length - 1] ?? "";
  return tail.includes("~") ? (tail.split("~").pop() ?? tail) : tail;
}

export function toMicrosString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value));
  const text = String(value).trim();
  if (/^-?\d+$/.test(text)) return text;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return String(Math.round(numeric));
  return null;
}

export function toDecimalText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = String(value).trim();
  return text || null;
}

export function formatMoneyMicros(micros: string | null | undefined, currencyCode = "USD"): string {
  if (micros == null || micros === "") return "—";
  const dollars = Number(micros) / 1_000_000;
  if (!Number.isFinite(dollars)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(dollars);
  } catch {
    return `$${(dollars).toFixed(2)}`;
  }
}

export function mapLiveSearchRowsToSnapshots(input: {
  rows: Array<Record<string, unknown>>;
  dateFrom: string;
  dateTo: string;
  currencyCode?: string | null;
}): CampaignMetricSnapshotView[] {
  return input.rows
    .map((row) => {
      const campaign = asRecord(row.campaign);
      const budget = asRecord(row.campaignBudget);
      const metrics = asRecord(row.metrics);
      const externalCampaignId = String(campaign.id ?? lastResourceId(campaign.resourceName));
      if (!externalCampaignId) return null;
      const view: CampaignMetricSnapshotView = {
        externalCampaignId,
        resourceName: campaign.resourceName ? String(campaign.resourceName) : null,
        campaignName: String(campaign.name ?? "Untitled campaign"),
        advertisingChannelType: campaign.advertisingChannelType
          ? String(campaign.advertisingChannelType)
          : null,
        campaignStatus: campaign.status ? String(campaign.status) : null,
        currencyCode: input.currencyCode ?? null,
        budgetResourceName: budget.resourceName ? String(budget.resourceName) : null,
        budgetAmountMicros: toMicrosString(budget.amountMicros),
        budgetPeriod: budget.period ? String(budget.period) : null,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        costMicros: toMicrosString(metrics.costMicros),
        impressions: toMicrosString(metrics.impressions),
        clicks: toMicrosString(metrics.clicks),
        conversionsText: toDecimalText(metrics.conversions),
        conversionsValueText: toDecimalText(metrics.conversionsValue),
        averageCpcMicros: toMicrosString(metrics.averageCpc),
        averageCpmMicros: toMicrosString(metrics.averageCpm),
        lastSyncedAt: null,
      };
      return view;
    })
    .filter((row): row is CampaignMetricSnapshotView => Boolean(row));
}
