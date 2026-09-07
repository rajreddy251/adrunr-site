import { digitsOnly } from "./ids";
import {
  assertIsoDate,
  defaultMetricWindow,
  toDecimalText,
  toMicrosString,
} from "./metrics";
import {
  CAMPAIGN_REPORTS_NOTE,
  refuseEnableOnReport,
  resolveDryRun,
} from "./safety";
import type {
  CampaignMetricSnapshotView,
  CampaignReportJobView,
  CampaignReportRowView,
  CampaignReportSummaryView,
} from "./types";

export const CAMPAIGN_REPORT_JOB_TYPE = "report_performance";

export const ENABLED_SNAPSHOT_NOTE = "ENABLED is snapshot-only. Reports never enable or unpause live Ads.";

export type CampaignReportInput = {
  customerId: string;
  dryRun: boolean;
  dateFrom: string;
  dateTo: string;
};

export type BuiltCampaignReport = {
  rows: CampaignReportRowView[];
  summary: CampaignReportSummaryView;
  previewText: string;
  notesText: string;
};

export function parseCampaignReportInput(body: unknown, now = new Date()): CampaignReportInput {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  refuseEnableOnReport(record);
  const customerId = digitsOnly(String(record.customerId ?? ""));
  if (!customerId) {
    throw Object.assign(new Error("customerId is required."), {
      status: 400,
      info: { kind: "validation", hint: "Select an Ads customer, then preview or generate a report." },
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

export function snapshotStatusNote(status: string | null | undefined): string | null {
  return String(status ?? "").toUpperCase() === "ENABLED" ? ENABLED_SNAPSHOT_NOTE : null;
}

function addDecimal(left: string | null, right: string | null): string | null {
  if (left == null && right == null) return null;
  const a = Number(left ?? 0);
  const b = Number(right ?? 0);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return left ?? right;
  const sum = a + b;
  return Number.isInteger(sum) ? String(sum) : String(Math.round(sum * 1000) / 1000);
}

function addMicros(left: string | null, right: string | null): string | null {
  if (left == null && right == null) return null;
  try {
    return (BigInt(left ?? "0") + BigInt(right ?? "0")).toString();
  } catch {
    return left ?? right;
  }
}

export function rollupReportRows(rows: CampaignReportRowView[], currencyCode?: string | null): CampaignReportSummaryView {
  let spendMicros: string | null = null;
  let clicks: string | null = null;
  let impressions: string | null = null;
  let conversionsText: string | null = null;
  let conversionsValueText: string | null = null;
  let enabledSnapshotCount = 0;

  for (const row of rows) {
    spendMicros = addMicros(spendMicros, row.spendMicros);
    clicks = addMicros(clicks, row.clicks);
    impressions = addMicros(impressions, row.impressions);
    conversionsText = addDecimal(conversionsText, row.conversionsText);
    conversionsValueText = addDecimal(conversionsValueText, row.conversionsValueText);
    if (String(row.campaignStatus ?? "").toUpperCase() === "ENABLED") {
      enabledSnapshotCount += 1;
    }
  }

  return {
    campaignCount: rows.length,
    enabledSnapshotCount,
    spendMicros,
    clicks,
    impressions,
    conversionsText,
    conversionsValueText,
    currencyCode: currencyCode ?? null,
    notesText: CAMPAIGN_REPORTS_NOTE,
  };
}

export function mapSnapshotsToReportRows(snapshots: CampaignMetricSnapshotView[]): CampaignReportRowView[] {
  return snapshots.map((snapshot) => ({
    metricSnapshotId: snapshot.id ?? null,
    syncedCampaignId: null,
    externalCampaignId: snapshot.externalCampaignId,
    campaignName: snapshot.campaignName,
    advertisingChannelType: snapshot.advertisingChannelType,
    campaignStatus: snapshot.campaignStatus,
    statusSnapshotNote: snapshotStatusNote(snapshot.campaignStatus),
    spendMicros: toMicrosString(snapshot.costMicros),
    clicks: toMicrosString(snapshot.clicks),
    impressions: toMicrosString(snapshot.impressions),
    conversionsText: toDecimalText(snapshot.conversionsText),
    conversionsValueText: toDecimalText(snapshot.conversionsValueText),
    notesText: snapshotStatusNote(snapshot.campaignStatus),
  }));
}

export function buildCampaignReport(
  snapshots: CampaignMetricSnapshotView[],
  currencyCode?: string | null,
): BuiltCampaignReport {
  const rows = mapSnapshotsToReportRows(snapshots);
  const summary = rollupReportRows(rows, currencyCode ?? snapshots[0]?.currencyCode ?? null);
  const preview = {
    readOnly: true,
    neverEnable: true,
    mutateAds: false,
    campaignCount: summary.campaignCount,
    enabledSnapshotCount: summary.enabledSnapshotCount,
    spendMicros: summary.spendMicros,
    clicks: summary.clicks,
    impressions: summary.impressions,
    conversionsText: summary.conversionsText,
  };
  return {
    rows,
    summary,
    previewText: JSON.stringify(preview),
    notesText: CAMPAIGN_REPORTS_NOTE,
  };
}

export function toReportJobView(input: {
  id?: string | null;
  customerId: string;
  externalAccountId?: string | null;
  dryRun: boolean;
  persisted: boolean;
  status?: string;
  dateFrom: string;
  dateTo: string;
  source: "cache" | "search" | "mock";
  previewText?: string | null;
  notesText?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
  finishedAt?: string | null;
  report: BuiltCampaignReport;
}): CampaignReportJobView {
  return {
    id: input.id ?? null,
    customerId: input.customerId,
    externalAccountId: input.externalAccountId ?? "",
    dryRun: input.dryRun,
    readOnly: true,
    neverEnable: true,
    persisted: input.persisted,
    status: input.status ?? (input.persisted ? "SUCCEEDED" : "PREVIEW"),
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    source: input.source,
    previewText: input.previewText ?? input.report.previewText,
    notesText: input.notesText ?? input.report.notesText,
    errorMessage: input.errorMessage ?? null,
    summary: input.report.summary,
    rows: input.report.rows,
    createdAt: input.createdAt ?? null,
    finishedAt: input.finishedAt ?? null,
  };
}
