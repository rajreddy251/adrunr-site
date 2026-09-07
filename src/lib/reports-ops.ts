import "server-only";

import { upsertExternalAccount } from "./accounts";
import { writeAudit } from "./audit";
import { loadActiveConnection } from "./connections";
import { getEnv } from "./env";
import { searchGoogleAds } from "./google-ads";
import { toJsonText } from "./http";
import { digitsOnly, isKnownNotEnabledCustomer } from "./ids";
import {
  buildMetricsSearchQuery,
  mapLiveSearchRowsToSnapshots,
  toMicrosString,
} from "./metrics";
import { mockMetrics } from "./mock-data";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG } from "./providers";
import {
  buildCampaignReport,
  CAMPAIGN_REPORT_JOB_TYPE,
  parseCampaignReportInput,
  toReportJobView,
  type BuiltCampaignReport,
} from "./reports";
import { CAMPAIGN_REPORTS_NOTE, refuseEnableOnReport } from "./safety";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type {
  CampaignMetricSnapshotView,
  CampaignReportJobView,
  CampaignReportRowView,
} from "./types";

export { CAMPAIGN_REPORT_JOB_TYPE, parseCampaignReportInput } from "./reports";

function toBigInt(value: string | null | undefined): bigint | null {
  if (value == null || value === "") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function toSnapshotView(row: {
  id: string;
  externalCampaignId: string;
  resourceName: string | null;
  campaignName: string;
  advertisingChannelType: string | null;
  campaignStatus: string | null;
  currencyCode: string | null;
  budgetResourceName: string | null;
  budgetAmountMicros: bigint | null;
  budgetPeriod: string | null;
  dateFrom: string;
  dateTo: string;
  costMicros: bigint | null;
  impressions: bigint | null;
  clicks: bigint | null;
  conversionsText: string | null;
  conversionsValueText: string | null;
  averageCpcMicros: bigint | null;
  averageCpmMicros: bigint | null;
  lastSyncedAt: Date | null;
}): CampaignMetricSnapshotView {
  return {
    id: row.id,
    externalCampaignId: row.externalCampaignId,
    resourceName: row.resourceName,
    campaignName: row.campaignName,
    advertisingChannelType: row.advertisingChannelType,
    campaignStatus: row.campaignStatus,
    currencyCode: row.currencyCode,
    budgetResourceName: row.budgetResourceName,
    budgetAmountMicros: toMicrosString(row.budgetAmountMicros),
    budgetPeriod: row.budgetPeriod,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    costMicros: toMicrosString(row.costMicros),
    impressions: toMicrosString(row.impressions),
    clicks: toMicrosString(row.clicks),
    conversionsText: row.conversionsText,
    conversionsValueText: row.conversionsValueText,
    averageCpcMicros: toMicrosString(row.averageCpcMicros),
    averageCpmMicros: toMicrosString(row.averageCpmMicros),
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  };
}

function reportFromStored(row: {
  id: string;
  dryRun: boolean;
  status: string;
  dateFrom: string;
  dateTo: string;
  source: string;
  previewText: string | null;
  notesText: string | null;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  externalAccount: { id: string; externalId: string };
  rows: Array<{
    id: string;
    metricSnapshotId: string | null;
    syncedCampaignId: string | null;
    externalCampaignId: string;
    campaignName: string;
    advertisingChannelType: string | null;
    campaignStatus: string | null;
    statusSnapshotNote: string | null;
    spendMicros: bigint | null;
    clicks: bigint | null;
    impressions: bigint | null;
    conversionsText: string | null;
    conversionsValueText: string | null;
    notesText: string | null;
  }>;
  summary: {
    campaignCount: number;
    enabledSnapshotCount: number;
    spendMicros: bigint | null;
    clicks: bigint | null;
    impressions: bigint | null;
    conversionsText: string | null;
    conversionsValueText: string | null;
    currencyCode: string | null;
    notesText: string | null;
  } | null;
}): CampaignReportJobView {
  const rows: CampaignReportRowView[] = row.rows.map((item) => ({
    id: item.id,
    metricSnapshotId: item.metricSnapshotId,
    syncedCampaignId: item.syncedCampaignId,
    externalCampaignId: item.externalCampaignId,
    campaignName: item.campaignName,
    advertisingChannelType: item.advertisingChannelType,
    campaignStatus: item.campaignStatus,
    statusSnapshotNote: item.statusSnapshotNote,
    spendMicros: toMicrosString(item.spendMicros),
    clicks: toMicrosString(item.clicks),
    impressions: toMicrosString(item.impressions),
    conversionsText: item.conversionsText,
    conversionsValueText: item.conversionsValueText,
    notesText: item.notesText,
  }));
  const report: BuiltCampaignReport = {
    rows,
    summary: row.summary
      ? {
          campaignCount: row.summary.campaignCount,
          enabledSnapshotCount: row.summary.enabledSnapshotCount,
          spendMicros: toMicrosString(row.summary.spendMicros),
          clicks: toMicrosString(row.summary.clicks),
          impressions: toMicrosString(row.summary.impressions),
          conversionsText: row.summary.conversionsText,
          conversionsValueText: row.summary.conversionsValueText,
          currencyCode: row.summary.currencyCode,
          notesText: row.summary.notesText,
        }
      : {
          campaignCount: rows.length,
          enabledSnapshotCount: rows.filter((item) => String(item.campaignStatus ?? "").toUpperCase() === "ENABLED").length,
          spendMicros: null,
          clicks: null,
          impressions: null,
          conversionsText: null,
          conversionsValueText: null,
          currencyCode: null,
          notesText: CAMPAIGN_REPORTS_NOTE,
        },
    previewText: row.previewText ?? "",
    notesText: row.notesText ?? CAMPAIGN_REPORTS_NOTE,
  };
  const source = row.source === "search" || row.source === "mock" || row.source === "cache" ? row.source : "cache";
  return toReportJobView({
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccount.id,
    dryRun: row.dryRun,
    persisted: true,
    status: row.status,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    source,
    previewText: row.previewText,
    notesText: row.notesText,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    report,
  });
}

async function loadCachedSnapshots(input: {
  organizationId: string;
  providerId: string;
  externalAccountId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<CampaignMetricSnapshotView[]> {
  const rows = await prisma().campaignMetricSnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      providerId: input.providerId,
      externalAccountId: input.externalAccountId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    },
    orderBy: { campaignName: "asc" },
  });
  return rows.map(toSnapshotView);
}

async function fetchLiveSnapshots(input: {
  customerId: string;
  dateFrom: string;
  dateTo: string;
  currencyCode?: string | null;
}): Promise<CampaignMetricSnapshotView[]> {
  const rows = await searchGoogleAds(
    input.customerId,
    buildMetricsSearchQuery(input.dateFrom, input.dateTo),
  );
  return mapLiveSearchRowsToSnapshots({
    rows,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    currencyCode: input.currencyCode,
  });
}

export async function listCampaignReports(customerId?: string): Promise<CampaignReportJobView[]> {
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  const digits = customerId ? digitsOnly(customerId) : "";
  const external = digits
    ? await prisma().externalAccount.findFirst({
        where: { organizationId: ctx.org.id, providerId: provider.id, externalId: digits },
      })
    : null;
  const rows = await prisma().campaignReportJob.findMany({
    where: {
      organizationId: ctx.org.id,
      ...(external ? { externalAccountId: external.id } : {}),
    },
    include: { externalAccount: true, rows: { orderBy: { campaignName: "asc" } }, summary: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(reportFromStored);
}

export async function getCampaignReport(id: string): Promise<CampaignReportJobView> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().campaignReportJob.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { externalAccount: true, rows: { orderBy: { campaignName: "asc" } }, summary: true },
  });
  if (!row) {
    throw Object.assign(new Error("Report not found."), {
      status: 404,
      info: { kind: "validation", hint: "Preview or generate a report from /ops first." },
    });
  }
  return reportFromStored(row);
}

export async function generateCampaignReport(body: unknown): Promise<{
  dryRun: boolean;
  persisted: boolean;
  source: "cache" | "search" | "mock";
  customerId: string;
  dateFrom: string;
  dateTo: string;
  report: CampaignReportJobView;
  warnings: string[];
}> {
  refuseEnableOnReport(body ?? {});
  const input = parseCampaignReportInput(body);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  const loaded = await loadActiveConnection(GOOGLE_ADS_SLUG);
  const warnings: string[] = [];

  if (isKnownNotEnabledCustomer(input.customerId)) {
    warnings.push(
      "CUSTOMER_NOT_ENABLED — known for 485-651-7690. Reports are read-only so listing is allowed; live search may fail.",
    );
  }

  let external = await prisma().externalAccount.findFirst({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      externalId: input.customerId,
    },
  });
  if (!external) {
    external = await upsertExternalAccount({
      providerSlug: GOOGLE_ADS_SLUG,
      externalId: input.customerId,
      displayName: input.customerId,
      oauthConnectionId: loaded?.connection.id,
    });
  }

  const cached = await loadCachedSnapshots({
    organizationId: ctx.org.id,
    providerId: provider.id,
    externalAccountId: external.id,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });

  let snapshots = cached;
  let source: "cache" | "search" | "mock" = "cache";
  if (snapshots.length === 0) {
    if (env.mockMode) {
      snapshots = mockMetrics(input.customerId, input.dateFrom, input.dateTo);
      source = "mock";
      warnings.push("ADRUNR_MOCK is on. Report rows are fixtures — no live Ads search ran.");
    } else {
      snapshots = await fetchLiveSnapshots({
        customerId: input.customerId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        currencyCode: external.currencyCode,
      });
      source = "search";
    }
  } else if (env.mockMode) {
    warnings.push("Report built from Neon CampaignMetricSnapshot cache. Cached ENABLED is snapshot-only.");
  }

  const stamped = snapshots.map((snapshot) => ({
    ...snapshot,
    currencyCode: snapshot.currencyCode ?? external.currencyCode ?? null,
  }));
  const built = buildCampaignReport(stamped, stamped[0]?.currencyCode ?? external.currencyCode);

  if (input.dryRun) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "report_job.dry_run",
      resourceType: "CAMPAIGN_REPORT_JOB",
      resourceId: null,
      metadata: {
        customerId: input.customerId,
        dryRun: true,
        readOnly: true,
        neverEnable: true,
        source,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        campaignCount: built.summary.campaignCount,
      },
    });
    return {
      dryRun: true,
      persisted: false,
      source,
      customerId: input.customerId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      report: toReportJobView({
        customerId: input.customerId,
        externalAccountId: external.id,
        dryRun: true,
        persisted: false,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        source,
        report: built,
      }),
      warnings,
    };
  }

  const startedAt = new Date();
  const job = await prisma().campaignReportJob.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      providerId: provider.id,
      externalAccountId: external.id,
      createdById: ctx.user.id,
      dryRun: false,
      readOnly: true,
      neverEnable: true,
      status: "RUNNING",
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      source,
      requestBody: toJsonText({
        customerId: input.customerId,
        dryRun: false,
        readOnly: true,
        neverEnable: true,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        jobType: CAMPAIGN_REPORT_JOB_TYPE,
        mutateAds: false,
      }),
      previewText: built.previewText,
      notesText: built.notesText,
      startedAt,
    },
  });

  try {
    const syncedCampaigns = await prisma().syncedCampaign.findMany({
      where: { externalAccountId: external.id },
      select: { id: true, externalId: true },
    });
    const syncedByExternalId = new Map(syncedCampaigns.map((row) => [row.externalId, row.id]));

    await prisma().$transaction(async (tx) => {
      for (const row of built.rows) {
        await tx.campaignReportRow.create({
          data: {
            reportJobId: job.id,
            metricSnapshotId: row.metricSnapshotId ?? null,
            syncedCampaignId: syncedByExternalId.get(row.externalCampaignId) ?? null,
            externalCampaignId: row.externalCampaignId,
            campaignName: row.campaignName,
            advertisingChannelType: row.advertisingChannelType,
            campaignStatus: row.campaignStatus,
            statusSnapshotNote: row.statusSnapshotNote,
            spendMicros: toBigInt(row.spendMicros),
            clicks: toBigInt(row.clicks),
            impressions: toBigInt(row.impressions),
            conversionsText: row.conversionsText,
            conversionsValueText: row.conversionsValueText,
            notesText: row.notesText,
          },
        });
      }
      await tx.campaignReportSummary.create({
        data: {
          reportJobId: job.id,
          campaignCount: built.summary.campaignCount,
          enabledSnapshotCount: built.summary.enabledSnapshotCount,
          spendMicros: toBigInt(built.summary.spendMicros),
          clicks: toBigInt(built.summary.clicks),
          impressions: toBigInt(built.summary.impressions),
          conversionsText: built.summary.conversionsText,
          conversionsValueText: built.summary.conversionsValueText,
          currencyCode: built.summary.currencyCode,
          notesText: built.summary.notesText,
        },
      });
      await tx.campaignReportJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          responseBody: toJsonText({
            persisted: true,
            source,
            readOnly: true,
            neverEnable: true,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            summary: built.summary,
          }),
        },
      });
    });

    const stored = await prisma().campaignReportJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { externalAccount: true, rows: { orderBy: { campaignName: "asc" } }, summary: true },
    });

    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "report_job.cached",
      resourceType: "CAMPAIGN_REPORT_JOB",
      resourceId: job.id,
      metadata: {
        customerId: input.customerId,
        dryRun: false,
        readOnly: true,
        neverEnable: true,
        source,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        campaignCount: built.summary.campaignCount,
      },
    });

    return {
      dryRun: false,
      persisted: true,
      source,
      customerId: input.customerId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      report: reportFromStored(stored),
      warnings,
    };
  } catch (error) {
    await prisma().campaignReportJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "report_job.failed",
      resourceType: "CAMPAIGN_REPORT_JOB",
      resourceId: job.id,
      metadata: {
        customerId: input.customerId,
        dryRun: false,
        readOnly: true,
        neverEnable: true,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      },
    });
    throw error;
  }
}
