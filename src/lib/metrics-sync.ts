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
  countMetrics,
  METRICS_SYNC_JOB_TYPE,
  mapLiveSearchRowsToSnapshots,
  parseMetricsSyncInput,
  toMicrosString,
} from "./metrics";
import { mockMetrics } from "./mock-data";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG } from "./providers";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { CampaignMetricSnapshotView, MetricSyncCounts, SyncJobView } from "./types";

export { METRICS_SYNC_JOB_TYPE, parseMetricsSyncInput } from "./metrics";

function toJobView(
  row: {
    id: string;
    jobType: string;
    status: string;
    readOnly: boolean;
    dryRun: boolean;
    errorMessage: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    responseBody: string | null;
  },
  counts?: MetricSyncCounts,
): SyncJobView {
  let parsedCounts = counts;
  if (!parsedCounts && row.responseBody) {
    try {
      const parsed = JSON.parse(row.responseBody) as { counts?: MetricSyncCounts };
      if (parsed.counts) parsedCounts = parsed.counts;
    } catch {
      parsedCounts = undefined;
    }
  }
  return {
    id: row.id,
    jobType: row.jobType,
    status: row.status,
    readOnly: row.readOnly,
    dryRun: row.dryRun,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    counts: parsedCounts,
  };
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

function toBigInt(value: string | null | undefined): bigint | null {
  if (value == null || value === "") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

async function persistMetrics(input: {
  organizationId: string;
  providerId: string;
  externalAccountId: string;
  syncJobId: string;
  dateFrom: string;
  dateTo: string;
  snapshots: CampaignMetricSnapshotView[];
}): Promise<void> {
  const db = prisma();
  const syncedAt = new Date();

  const syncedCampaigns = await db.syncedCampaign.findMany({
    where: { externalAccountId: input.externalAccountId },
    select: { id: true, externalId: true },
  });
  const syncedByExternalId = new Map(syncedCampaigns.map((row) => [row.externalId, row.id]));

  await db.$transaction(async (tx) => {
    await tx.campaignMetricSnapshot.deleteMany({
      where: {
        externalAccountId: input.externalAccountId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      },
    });

    for (const snapshot of input.snapshots) {
      await tx.campaignMetricSnapshot.create({
        data: {
          organizationId: input.organizationId,
          providerId: input.providerId,
          externalAccountId: input.externalAccountId,
          lastSyncJobId: input.syncJobId,
          syncedCampaignId: syncedByExternalId.get(snapshot.externalCampaignId) ?? null,
          externalCampaignId: snapshot.externalCampaignId,
          resourceName: snapshot.resourceName,
          campaignName: snapshot.campaignName,
          advertisingChannelType: snapshot.advertisingChannelType,
          campaignStatus: snapshot.campaignStatus,
          currencyCode: snapshot.currencyCode,
          budgetResourceName: snapshot.budgetResourceName,
          budgetAmountMicros: toBigInt(snapshot.budgetAmountMicros),
          budgetPeriod: snapshot.budgetPeriod,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          costMicros: toBigInt(snapshot.costMicros),
          impressions: toBigInt(snapshot.impressions),
          clicks: toBigInt(snapshot.clicks),
          conversionsText: snapshot.conversionsText,
          conversionsValueText: snapshot.conversionsValueText,
          averageCpcMicros: toBigInt(snapshot.averageCpcMicros),
          averageCpmMicros: toBigInt(snapshot.averageCpmMicros),
          attributesText: toJsonText({ source: "metrics_sync", readOnly: true }),
          lastSyncedAt: syncedAt,
        },
      });
    }
  });
}

async function fetchLiveMetrics(input: {
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

export async function listCachedMetrics(customerId?: string): Promise<{
  customerId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  snapshots: CampaignMetricSnapshotView[];
  lastJob: SyncJobView | null;
  source: "cache";
}> {
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  const digits = customerId ? digitsOnly(customerId) : "";
  const external = digits
    ? await prisma().externalAccount.findFirst({
        where: {
          organizationId: ctx.org.id,
          providerId: provider.id,
          externalId: digits,
        },
      })
    : null;

  if (digits && !external) {
    return { customerId: digits, dateFrom: null, dateTo: null, snapshots: [], lastJob: null, source: "cache" };
  }

  const lastJob = await prisma().syncJob.findFirst({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      jobType: METRICS_SYNC_JOB_TYPE,
      ...(external ? { externalAccountId: external.id } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  if (lastJob?.requestBody) {
    try {
      const parsed = JSON.parse(lastJob.requestBody) as { dateFrom?: string; dateTo?: string };
      dateFrom = parsed.dateFrom ?? null;
      dateTo = parsed.dateTo ?? null;
    } catch {
      dateFrom = null;
      dateTo = null;
    }
  }

  const snapshots = await prisma().campaignMetricSnapshot.findMany({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      ...(external ? { externalAccountId: external.id } : {}),
      ...(dateFrom && dateTo ? { dateFrom, dateTo } : {}),
    },
    orderBy: { campaignName: "asc" },
  });

  return {
    customerId: digits || null,
    dateFrom,
    dateTo,
    snapshots: snapshots.map(toSnapshotView),
    lastJob: lastJob ? toJobView(lastJob) : null,
    source: "cache",
  };
}

export async function syncMetrics(body: unknown): Promise<{
  dryRun: boolean;
  persisted: boolean;
  source: "live" | "mock";
  customerId: string;
  dateFrom: string;
  dateTo: string;
  snapshots: CampaignMetricSnapshotView[];
  counts: MetricSyncCounts;
  job: SyncJobView;
  warnings: string[];
}> {
  const input = parseMetricsSyncInput(body);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  const loaded = await loadActiveConnection(GOOGLE_ADS_SLUG);
  const warnings: string[] = [];

  if (isKnownNotEnabledCustomer(input.customerId)) {
    warnings.push(
      "CUSTOMER_NOT_ENABLED — known for 485-651-7690. Sync is read-only so listing is allowed; live search may fail.",
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

  const startedAt = new Date();
  const job = await prisma().syncJob.create({
    data: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      externalAccountId: external.id,
      status: "RUNNING",
      jobType: METRICS_SYNC_JOB_TYPE,
      readOnly: true,
      dryRun: input.dryRun,
      requestBody: toJsonText({
        customerId: input.customerId,
        dryRun: input.dryRun,
        readOnly: true,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        mutateAds: false,
      }),
      startedAt,
    },
  });

  try {
    const snapshots = env.mockMode
      ? mockMetrics(input.customerId, input.dateFrom, input.dateTo)
      : await fetchLiveMetrics({
          customerId: input.customerId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          currencyCode: external.currencyCode,
        });
    const stamped = snapshots.map((snapshot) => ({
      ...snapshot,
      currencyCode: snapshot.currencyCode ?? external.currencyCode ?? null,
      lastSyncedAt: input.dryRun ? null : new Date().toISOString(),
    }));
    const counts = countMetrics(stamped);

    if (!input.dryRun) {
      await persistMetrics({
        organizationId: ctx.org.id,
        providerId: provider.id,
        externalAccountId: external.id,
        syncJobId: job.id,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        snapshots: stamped,
      });
    }

    const finished = await prisma().syncJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        responseBody: toJsonText({
          counts,
          persisted: !input.dryRun,
          source: env.mockMode ? "mock" : "live",
          readOnly: true,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        }),
      },
    });

    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: input.dryRun ? "sync_job.metrics_dry_run" : "sync_job.metrics_cached",
      resourceType: "SYNC_JOB",
      resourceId: job.id,
      metadata: {
        customerId: input.customerId,
        dryRun: input.dryRun,
        readOnly: true,
        source: env.mockMode ? "mock" : "live",
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        counts,
      },
    });

    if (env.mockMode) {
      warnings.push("ADRUNR_MOCK is on. Metric snapshots are fixtures — no live Ads search ran.");
    }

    return {
      dryRun: input.dryRun,
      persisted: !input.dryRun,
      source: env.mockMode ? "mock" : "live",
      customerId: input.customerId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      snapshots: stamped,
      counts,
      job: toJobView(finished, counts),
      warnings,
    };
  } catch (error) {
    await prisma().syncJob.update({
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
      action: "sync_job.metrics_failed",
      resourceType: "SYNC_JOB",
      resourceId: job.id,
      metadata: {
        customerId: input.customerId,
        dryRun: input.dryRun,
        readOnly: true,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      },
    });
    throw error;
  }
}
