import "server-only";

import type { CampaignImportJob, Prisma } from "@prisma/client";

import { upsertExternalAccount } from "./accounts";
import { createAppDraft } from "./app-ops";
import { writeAudit } from "./audit";
import {
  buildImportedDraftTree,
  importWizardHint,
  parseCampaignImportInput,
  refuseEnableOnImport,
  resolveImportDraftKind,
  type ImportDraftKind,
} from "./campaign-import";
import { loadActiveConnection } from "./connections";
import { createDemandGenDraft } from "./demand-gen-ops";
import { createDisplayDraft } from "./display-ops";
import { getEnv } from "./env";
import { createHotelDraft } from "./hotel-ops";
import { toJsonText } from "./http";
import { digitsOnly } from "./ids";
import { createLocalServicesDraft } from "./local-services-ops";
import { createLocalDraft } from "./local-ops";
import { createPmaxDraft } from "./pmax-ops";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG } from "./providers";
import { createSearchDraft } from "./search-ops";
import { createShoppingDraft } from "./shopping-ops";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type {
  CampaignImportJobView,
  CampaignImportPreviewView,
  SyncedAdGroupView,
  SyncedCampaignView,
} from "./types";
import { createVideoDraft } from "./video-ops";

const syncedInclude = {
  adGroups: {
    include: { ads: true, keywords: true },
    orderBy: { name: "asc" as const },
  },
  metricSnapshots: { orderBy: { lastSyncedAt: "desc" as const }, take: 1 },
} satisfies Prisma.SyncedCampaignInclude;

type SyncedWithChildren = Prisma.SyncedCampaignGetPayload<{ include: typeof syncedInclude }>;

const DRAFT_FK: Record<ImportDraftKind, keyof Prisma.CampaignImportJobUncheckedUpdateInput> = {
  SEARCH: "searchCampaignDraftId",
  DISPLAY: "displayCampaignDraftId",
  PMAX: "pmaxCampaignDraftId",
  DEMAND_GEN: "demandGenCampaignDraftId",
  VIDEO: "videoCampaignDraftId",
  SHOPPING: "shoppingCampaignDraftId",
  APP: "appCampaignDraftId",
  HOTEL: "hotelCampaignDraftId",
  LOCAL: "localCampaignDraftId",
  LOCAL_SERVICES: "localServicesCampaignDraftId",
};

function toSyncedView(row: SyncedWithChildren): SyncedCampaignView {
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
    adGroups: row.adGroups.map(
      (group): SyncedAdGroupView => ({
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
      }),
    ),
  };
}

function previewToView(
  preview: ReturnType<typeof buildImportedDraftTree>["preview"],
): CampaignImportPreviewView {
  return {
    ...preview,
    dailyBudgetMicros: String(preview.dailyBudgetMicros),
  };
}

function draftIdFromJob(row: CampaignImportJob): string | null {
  return (
    row.searchCampaignDraftId ??
    row.displayCampaignDraftId ??
    row.pmaxCampaignDraftId ??
    row.demandGenCampaignDraftId ??
    row.videoCampaignDraftId ??
    row.shoppingCampaignDraftId ??
    row.appCampaignDraftId ??
    row.hotelCampaignDraftId ??
    row.localCampaignDraftId ??
    row.localServicesCampaignDraftId ??
    null
  );
}

function parsePreview(responseBody: string | null): CampaignImportPreviewView | null {
  if (!responseBody) return null;
  try {
    const parsed = JSON.parse(responseBody) as { preview?: CampaignImportPreviewView };
    return parsed.preview ?? null;
  } catch {
    return null;
  }
}

function toJobView(
  row: CampaignImportJob & { externalAccount: { externalId: string } },
  preview?: CampaignImportPreviewView | null,
): CampaignImportJobView {
  const kind = (row.draftKind || "SEARCH") as ImportDraftKind;
  return {
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccountId,
    syncedCampaignId: row.syncedCampaignId,
    sourceCampaignExternalId: row.sourceCampaignExternalId,
    sourceCampaignName: row.sourceCampaignName,
    sourceAdvertisingChannelType: row.sourceAdvertisingChannelType,
    sourceStatus: row.sourceStatus,
    draftKind: kind,
    dryRun: row.dryRun,
    neverEnable: true,
    status: row.status,
    persisted: Boolean(!row.dryRun && draftIdFromJob(row)),
    draftId: draftIdFromJob(row),
    preview: preview ?? parsePreview(row.responseBody),
    previewText: row.previewText,
    notesText: row.notesText,
    errorMessage: row.errorMessage,
    wizardHint: importWizardHint(kind),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

async function resolveExternalAccount(input: { customerId?: string; externalAccountId?: string }) {
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  if (input.externalAccountId) {
    const existing = await prisma().externalAccount.findFirst({
      where: { id: input.externalAccountId, organizationId: ctx.org.id, providerId: provider.id },
    });
    if (existing) return existing;
  }
  if (!input.customerId) {
    throw Object.assign(new Error("customerId or externalAccountId is required."), {
      status: 400,
      info: { kind: "validation", hint: "Pick a Google Ads customer." },
    });
  }
  const existing = await prisma().externalAccount.findFirst({
    where: { organizationId: ctx.org.id, providerId: provider.id, externalId: input.customerId },
  });
  if (existing) return existing;
  const loaded = await loadActiveConnection(GOOGLE_ADS_SLUG);
  return upsertExternalAccount({
    providerSlug: GOOGLE_ADS_SLUG,
    externalId: input.customerId,
    displayName: input.customerId,
    oauthConnectionId: loaded?.connection.id,
  });
}

async function resolveSyncedCampaign(input: {
  organizationId: string;
  providerId: string;
  externalAccountId: string;
  syncedCampaignId?: string | null;
  campaignExternalId?: string | null;
}): Promise<SyncedWithChildren> {
  let synced = input.syncedCampaignId
    ? await prisma().syncedCampaign.findFirst({
        where: {
          id: input.syncedCampaignId,
          organizationId: input.organizationId,
          providerId: input.providerId,
          externalAccountId: input.externalAccountId,
        },
        include: syncedInclude,
      })
    : null;
  if (!synced && input.campaignExternalId) {
    synced = await prisma().syncedCampaign.findFirst({
      where: {
        organizationId: input.organizationId,
        providerId: input.providerId,
        externalAccountId: input.externalAccountId,
        externalId: input.campaignExternalId,
      },
      include: syncedInclude,
    });
  }
  if (!synced) {
    throw Object.assign(new Error("Cached campaign not found."), {
      status: 404,
      info: {
        kind: "validation",
        hint: "Sync listings to cache first (dry-run off), then import. Stale syncedCampaignId is ignored when campaignExternalId matches.",
      },
    });
  }
  return synced;
}

async function createTypedDraft(kind: ImportDraftKind, tree: Record<string, unknown>): Promise<{ id: string }> {
  switch (kind) {
    case "SEARCH":
      return createSearchDraft(tree);
    case "DISPLAY":
      return createDisplayDraft(tree);
    case "PMAX":
      return createPmaxDraft(tree);
    case "DEMAND_GEN":
      return createDemandGenDraft(tree);
    case "VIDEO":
      return createVideoDraft(tree);
    case "SHOPPING":
      return createShoppingDraft(tree);
    case "APP":
      return createAppDraft(tree);
    case "HOTEL":
      return createHotelDraft(tree);
    case "LOCAL":
      return createLocalDraft(tree);
    case "LOCAL_SERVICES":
      return createLocalServicesDraft(tree);
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled import kind ${String(exhaustive)}.`);
    }
  }
}

async function stampDraftProvenance(input: {
  kind: ImportDraftKind;
  draftId: string;
  importJobId: string;
  syncedCampaignId: string | null;
  sourceCampaignExternalId: string;
  provenanceText: string;
}) {
  const data = {
    importJobId: input.importJobId,
    syncedCampaignId: input.syncedCampaignId,
    sourceCampaignExternalId: input.sourceCampaignExternalId,
    importProvenanceText: input.provenanceText,
  };
  const db = prisma();
  switch (input.kind) {
    case "SEARCH":
      await db.searchCampaignDraft.update({ where: { id: input.draftId }, data });
      return;
    case "DISPLAY":
      await db.displayCampaignDraft.update({ where: { id: input.draftId }, data });
      return;
    case "PMAX":
      await db.performanceMaxCampaignDraft.update({ where: { id: input.draftId }, data });
      return;
    case "DEMAND_GEN":
      await db.demandGenCampaignDraft.update({ where: { id: input.draftId }, data });
      return;
    case "VIDEO":
      await db.videoCampaignDraft.update({ where: { id: input.draftId }, data });
      return;
    case "SHOPPING":
      await db.shoppingCampaignDraft.update({ where: { id: input.draftId }, data });
      return;
    case "APP":
      await db.appCampaignDraft.update({ where: { id: input.draftId }, data });
      return;
    case "HOTEL":
      await db.hotelCampaignDraft.update({ where: { id: input.draftId }, data });
      return;
    case "LOCAL":
      await db.localCampaignDraft.update({ where: { id: input.draftId }, data });
      return;
    case "LOCAL_SERVICES":
      await db.localServicesCampaignDraft.update({ where: { id: input.draftId }, data });
      return;
    default: {
      const exhaustive: never = input.kind;
      throw new Error(`Unhandled import kind ${String(exhaustive)}.`);
    }
  }
}

export async function listCampaignImportJobs(customerId?: string): Promise<CampaignImportJobView[]> {
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  const digits = customerId ? digitsOnly(customerId) : "";
  const external = digits
    ? await prisma().externalAccount.findFirst({
        where: { organizationId: ctx.org.id, providerId: provider.id, externalId: digits },
      })
    : null;
  const rows = await prisma().campaignImportJob.findMany({
    where: {
      organizationId: ctx.org.id,
      ...(external ? { externalAccountId: external.id } : {}),
    },
    include: { externalAccount: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((row) => toJobView(row));
}

export async function getCampaignImportJob(id: string): Promise<CampaignImportJobView> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().campaignImportJob.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { externalAccount: true },
  });
  if (!row) {
    throw Object.assign(new Error("Import job not found."), {
      status: 404,
      info: { kind: "validation", hint: "Preview or import a cached campaign from /ops first." },
    });
  }
  return toJobView(row);
}

export async function importCachedCampaign(body: unknown): Promise<{
  dryRun: boolean;
  persisted: boolean;
  source: "cache";
  job: CampaignImportJobView;
  preview: CampaignImportPreviewView;
  draftId: string | null;
  warnings: string[];
}> {
  refuseEnableOnImport(body ?? {});
  const input = parseCampaignImportInput(body);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  const external = await resolveExternalAccount({
    customerId: input.customerId,
    externalAccountId:
      body && typeof body === "object" && "externalAccountId" in body
        ? String((body as { externalAccountId?: string }).externalAccountId ?? "")
        : undefined,
  });
  const synced = await resolveSyncedCampaign({
    organizationId: ctx.org.id,
    providerId: provider.id,
    externalAccountId: external.id,
    syncedCampaignId: input.syncedCampaignId,
    campaignExternalId: input.campaignExternalId,
  });
  const campaign = toSyncedView(synced);
  resolveImportDraftKind(campaign.advertisingChannelType);
  const snapshotBudget =
    synced.metricSnapshots[0]?.budgetAmountMicros != null
      ? Number(synced.metricSnapshots[0].budgetAmountMicros)
      : null;
  const mapped = buildImportedDraftTree({
    customerId: external.externalId,
    campaign,
    dailyBudgetMicros: Number.isFinite(snapshotBudget) ? snapshotBudget : null,
  });
  const preview = previewToView(mapped.preview);
  const warnings = [...mapped.preview.warnings];
  if (env.mockMode) {
    warnings.push("ADRUNR_MOCK is on. Import uses the listings cache / fixtures — no live Ads mutate.");
  }

  const startedAt = new Date();
  const job = await prisma().campaignImportJob.create({
    data: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      externalAccountId: external.id,
      createdById: ctx.user.id,
      syncedCampaignId: synced.id,
      sourceCampaignExternalId: campaign.externalId,
      sourceCampaignName: campaign.name,
      sourceAdvertisingChannelType: campaign.advertisingChannelType,
      sourceStatus: campaign.status,
      sourceServingStatus: campaign.servingStatus,
      sourceBiddingStrategyType: campaign.biddingStrategyType,
      draftKind: mapped.kind,
      dryRun: input.dryRun,
      neverEnable: true,
      status: "RUNNING",
      requestBody: toJsonText({
        customerId: input.customerId,
        syncedCampaignId: synced.id,
        campaignExternalId: campaign.externalId,
        dryRun: input.dryRun,
        neverEnable: true,
        mutateAds: false,
      }),
      previewText: `${mapped.kind} draft "${mapped.preview.name}" from ${campaign.externalId}. PAUSED-path only.`,
      notesText: String(mapped.tree.notesText ?? ""),
      startedAt,
    },
    include: { externalAccount: true },
  });

  try {
    let draftId: string | null = null;
    if (!input.dryRun) {
      const created = await createTypedDraft(mapped.kind, {
        ...mapped.tree,
        customerId: external.externalId,
        externalAccountId: external.id,
      });
      draftId = created.id;
      const provenanceText = toJsonText({
        importJobId: job.id,
        syncedCampaignId: synced.id,
        sourceCampaignExternalId: campaign.externalId,
        sourceAdvertisingChannelType: campaign.advertisingChannelType,
        sourceStatus: campaign.status,
        draftKind: mapped.kind,
        neverEnable: true,
        applyPath: "PAUSED",
        usedSafeDefaults: mapped.preview.usedSafeDefaults,
      });
      await stampDraftProvenance({
        kind: mapped.kind,
        draftId,
        importJobId: job.id,
        syncedCampaignId: synced.id,
        sourceCampaignExternalId: campaign.externalId,
        provenanceText,
      });
    }

    const finished = await prisma().campaignImportJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        responseBody: toJsonText({
          preview,
          persisted: !input.dryRun,
          draftId,
          neverEnable: true,
          applyPath: "PAUSED",
          source: "cache",
        }),
        ...(draftId ? { [DRAFT_FK[mapped.kind]]: draftId } : {}),
      },
      include: { externalAccount: true },
    });

    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: input.dryRun ? "import_job.preview" : "import_job.draft_created",
      resourceType: "CAMPAIGN_IMPORT_JOB",
      resourceId: job.id,
      metadata: {
        customerId: input.customerId,
        dryRun: input.dryRun,
        neverEnable: true,
        draftKind: mapped.kind,
        draftId,
        sourceCampaignExternalId: campaign.externalId,
        sourceStatus: campaign.status,
      },
    });

    return {
      dryRun: input.dryRun,
      persisted: !input.dryRun,
      source: "cache",
      job: toJobView(finished, preview),
      preview,
      draftId,
      warnings,
    };
  } catch (error) {
    await prisma().campaignImportJob.update({
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
      action: "import_job.failed",
      resourceType: "CAMPAIGN_IMPORT_JOB",
      resourceId: job.id,
      metadata: {
        customerId: input.customerId,
        dryRun: input.dryRun,
        neverEnable: true,
      },
    });
    throw error;
  }
}
