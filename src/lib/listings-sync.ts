import "server-only";

import type { ExternalEntityType } from "@prisma/client";

import { upsertExternalAccount } from "./accounts";
import { writeAudit } from "./audit";
import { loadActiveConnection } from "./connections";
import { getEnv } from "./env";
import { searchGoogleAds } from "./google-ads";
import { toJsonText } from "./http";
import { digitsOnly, isKnownNotEnabledCustomer } from "./ids";
import {
  AD_GROUP_SEARCH_QUERY,
  AD_SEARCH_QUERY,
  CAMPAIGN_SEARCH_QUERY,
  countListings,
  KEYWORD_SEARCH_QUERY,
  LISTINGS_SYNC_JOB_TYPE,
  mapLiveSearchRowsToCampaigns,
  parseListingsSyncInput,
} from "./listings";
import { mockListings } from "./mock-data";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG } from "./providers";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { ListingSyncCounts, SyncedCampaignView, SyncJobView } from "./types";

export {
  AD_GROUP_SEARCH_QUERY,
  AD_SEARCH_QUERY,
  CAMPAIGN_SEARCH_QUERY,
  KEYWORD_SEARCH_QUERY,
  LISTINGS_SYNC_JOB_TYPE,
  parseListingsSyncInput,
} from "./listings";

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
  counts?: ListingSyncCounts,
): SyncJobView {
  let parsedCounts = counts;
  if (!parsedCounts && row.responseBody) {
    try {
      const parsed = JSON.parse(row.responseBody) as { counts?: ListingSyncCounts };
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

function toCampaignView(row: {
  id: string;
  externalId: string;
  resourceName: string | null;
  name: string;
  advertisingChannelType: string | null;
  status: string | null;
  servingStatus: string | null;
  biddingStrategyType: string | null;
  lastSyncedAt: Date | null;
  adGroups: Array<{
    id: string;
    externalId: string;
    resourceName: string | null;
    name: string;
    status: string | null;
    type: string | null;
    ads: Array<{
      id: string;
      externalId: string;
      resourceName: string | null;
      name: string | null;
      type: string | null;
      status: string | null;
      headlinesText: string | null;
      descriptionsText: string | null;
      finalUrl: string | null;
    }>;
    keywords: Array<{
      id: string;
      externalId: string;
      resourceName: string | null;
      text: string;
      matchType: string | null;
      status: string | null;
      isNegative: boolean;
    }>;
  }>;
}): SyncedCampaignView {
  return {
    id: row.id,
    externalId: row.externalId,
    resourceName: row.resourceName,
    name: row.name,
    advertisingChannelType: row.advertisingChannelType,
    status: row.status,
    servingStatus: row.servingStatus,
    biddingStrategyType: row.biddingStrategyType,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    adGroups: row.adGroups.map((group) => ({
      id: group.id,
      externalId: group.externalId,
      resourceName: group.resourceName,
      name: group.name,
      status: group.status,
      type: group.type,
      ads: group.ads.map((ad) => ({
        id: ad.id,
        externalId: ad.externalId,
        resourceName: ad.resourceName,
        name: ad.name,
        type: ad.type,
        status: ad.status,
        headlinesText: ad.headlinesText,
        descriptionsText: ad.descriptionsText,
        finalUrl: ad.finalUrl,
      })),
      keywords: group.keywords.map((keyword) => ({
        id: keyword.id,
        externalId: keyword.externalId,
        resourceName: keyword.resourceName,
        text: keyword.text,
        matchType: keyword.matchType,
        status: keyword.status,
        isNegative: keyword.isNegative,
      })),
    })),
  };
}

async function persistListings(input: {
  organizationId: string;
  providerId: string;
  externalAccountId: string;
  syncJobId: string;
  campaigns: SyncedCampaignView[];
}): Promise<void> {
  const db = prisma();
  const syncedAt = new Date();

  await db.$transaction(async (tx) => {
    await tx.syncedCampaign.deleteMany({
      where: { externalAccountId: input.externalAccountId },
    });

    for (const campaign of input.campaigns) {
      await tx.syncedCampaign.create({
        data: {
          organizationId: input.organizationId,
          providerId: input.providerId,
          externalAccountId: input.externalAccountId,
          lastSyncJobId: input.syncJobId,
          externalId: campaign.externalId,
          resourceName: campaign.resourceName,
          name: campaign.name,
          advertisingChannelType: campaign.advertisingChannelType,
          status: campaign.status,
          servingStatus: campaign.servingStatus,
          biddingStrategyType: campaign.biddingStrategyType,
          attributesText: toJsonText({ source: "listings_sync", readOnly: true }),
          lastSyncedAt: syncedAt,
          adGroups: {
            create: campaign.adGroups.map((group) => ({
              organizationId: input.organizationId,
              externalAccountId: input.externalAccountId,
              externalId: group.externalId,
              resourceName: group.resourceName,
              name: group.name,
              status: group.status,
              type: group.type,
              attributesText: null,
              lastSyncedAt: syncedAt,
              ads: {
                create: group.ads.map((ad) => ({
                  organizationId: input.organizationId,
                  externalId: ad.externalId,
                  resourceName: ad.resourceName,
                  name: ad.name,
                  type: ad.type,
                  status: ad.status,
                  headlinesText: ad.headlinesText,
                  descriptionsText: ad.descriptionsText,
                  finalUrl: ad.finalUrl,
                  attributesText: null,
                  lastSyncedAt: syncedAt,
                })),
              },
              keywords: {
                create: group.keywords.map((keyword) => ({
                  organizationId: input.organizationId,
                  externalId: keyword.externalId,
                  resourceName: keyword.resourceName,
                  text: keyword.text,
                  matchType: keyword.matchType,
                  status: keyword.status,
                  isNegative: keyword.isNegative,
                  attributesText: null,
                  lastSyncedAt: syncedAt,
                })),
              },
            })),
          },
        },
      });
    }
  });

  const entityRows: Array<{
    entityType: ExternalEntityType;
    externalId: string;
    displayName: string;
    status: string | null;
  }> = [];
  for (const campaign of input.campaigns) {
    entityRows.push({
      entityType: "CAMPAIGN",
      externalId: campaign.externalId,
      displayName: campaign.name,
      status: campaign.status,
    });
    for (const group of campaign.adGroups) {
      entityRows.push({
        entityType: "AD_GROUP",
        externalId: group.externalId,
        displayName: group.name,
        status: group.status,
      });
      for (const ad of group.ads) {
        entityRows.push({
          entityType: "AD",
          externalId: ad.externalId,
          displayName: ad.name ?? ad.type ?? ad.externalId,
          status: ad.status,
        });
      }
      for (const keyword of group.keywords) {
        entityRows.push({
          entityType: "KEYWORD",
          externalId: keyword.externalId,
          displayName: keyword.text,
          status: keyword.status,
        });
      }
    }
  }

  for (const entity of entityRows) {
    await db.externalEntity.upsert({
      where: {
        providerId_externalAccountId_entityType_externalId: {
          providerId: input.providerId,
          externalAccountId: input.externalAccountId,
          entityType: entity.entityType,
          externalId: entity.externalId,
        },
      },
      create: {
        organizationId: input.organizationId,
        providerId: input.providerId,
        externalAccountId: input.externalAccountId,
        entityType: entity.entityType,
        externalId: entity.externalId,
        displayName: entity.displayName,
        status: entity.status,
        attributesText: toJsonText({ source: "listings_sync", readOnly: true }),
        lastSyncedAt: syncedAt,
      },
      update: {
        displayName: entity.displayName,
        status: entity.status,
        lastSyncedAt: syncedAt,
      },
    });
  }
}

async function fetchLiveListings(customerId: string): Promise<SyncedCampaignView[]> {
  const [campaignRows, adGroupRows, adRows, keywordRows] = await Promise.all([
    searchGoogleAds(customerId, CAMPAIGN_SEARCH_QUERY),
    searchGoogleAds(customerId, AD_GROUP_SEARCH_QUERY),
    searchGoogleAds(customerId, AD_SEARCH_QUERY),
    searchGoogleAds(customerId, KEYWORD_SEARCH_QUERY),
  ]);
  return mapLiveSearchRowsToCampaigns({ campaignRows, adGroupRows, adRows, keywordRows });
}

export async function listCachedListings(customerId?: string): Promise<{
  customerId: string | null;
  campaigns: SyncedCampaignView[];
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
    return { customerId: digits, campaigns: [], lastJob: null, source: "cache" };
  }

  const campaigns = await prisma().syncedCampaign.findMany({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      ...(external ? { externalAccountId: external.id } : {}),
    },
    include: {
      adGroups: {
        include: { ads: true, keywords: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const lastJob = await prisma().syncJob.findFirst({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      jobType: LISTINGS_SYNC_JOB_TYPE,
      ...(external ? { externalAccountId: external.id } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    customerId: digits || null,
    campaigns: campaigns.map(toCampaignView),
    lastJob: lastJob ? toJobView(lastJob) : null,
    source: "cache",
  };
}

export async function syncListings(body: unknown): Promise<{
  dryRun: boolean;
  persisted: boolean;
  source: "live" | "mock";
  customerId: string;
  campaigns: SyncedCampaignView[];
  counts: ListingSyncCounts;
  job: SyncJobView;
  warnings: string[];
}> {
  const input = parseListingsSyncInput(body);
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
      jobType: LISTINGS_SYNC_JOB_TYPE,
      readOnly: true,
      dryRun: input.dryRun,
      requestBody: toJsonText({
        customerId: input.customerId,
        dryRun: input.dryRun,
        readOnly: true,
        mutateAds: false,
      }),
      startedAt,
    },
  });

  try {
    const campaigns = env.mockMode
      ? mockListings(input.customerId)
      : await fetchLiveListings(input.customerId);
    const stamped = campaigns.map((campaign) => ({
      ...campaign,
      lastSyncedAt: input.dryRun ? null : new Date().toISOString(),
    }));
    const counts = countListings(stamped);

    if (!input.dryRun) {
      await persistListings({
        organizationId: ctx.org.id,
        providerId: provider.id,
        externalAccountId: external.id,
        syncJobId: job.id,
        campaigns: stamped,
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
        }),
      },
    });

    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: input.dryRun ? "sync_job.listings_dry_run" : "sync_job.listings_cached",
      resourceType: "SYNC_JOB",
      resourceId: job.id,
      metadata: {
        customerId: input.customerId,
        dryRun: input.dryRun,
        readOnly: true,
        source: env.mockMode ? "mock" : "live",
        counts,
      },
    });

    if (env.mockMode) {
      warnings.push("ADRUNR_MOCK is on. Synced listings are fixtures — no live Ads search ran.");
    }

    return {
      dryRun: input.dryRun,
      persisted: !input.dryRun,
      source: env.mockMode ? "mock" : "live",
      customerId: input.customerId,
      campaigns: stamped,
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
      action: "sync_job.listings_failed",
      resourceType: "SYNC_JOB",
      resourceId: job.id,
      metadata: {
        customerId: input.customerId,
        dryRun: input.dryRun,
        readOnly: true,
      },
    });
    throw error;
  }
}
