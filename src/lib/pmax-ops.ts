import "server-only";

import type {
  CampaignOp,
  PerformanceMaxAssetDraft,
  PerformanceMaxAssetGroupDraft,
  PerformanceMaxCampaignDraft,
  PerformanceMaxListingDraft,
  PerformanceMaxSignalDraft,
  PerformanceMaxTargetDraft,
} from "@prisma/client";

import { upsertExternalAccount } from "./accounts";
import { writeAudit } from "./audit";
import { loadActiveConnection } from "./connections";
import { getEnv } from "./env";
import { mutateGoogleAds } from "./google-ads";
import { toJsonText } from "./http";
import { isKnownNotEnabledCustomer } from "./ids";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG } from "./providers";
import { resolveDryRun } from "./safety";
import { mergePmaxDraftPatch } from "./assistant";
import {
  assertApplyConfirm,
  buildPmaxDraftMutate,
  encodeTextList,
  extractPmaxResourceNames,
  parsePmaxDraftTree,
  parsePmaxDraftWrite,
  type PmaxDraftTree,
} from "./pmax-draft";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { PmaxDraftClientView } from "./types";
import type { CampaignOpDetailView } from "./search-ops";
import { getCampaignOpDetail } from "./search-ops";

export type PmaxDraftRecord = PerformanceMaxCampaignDraft & {
  externalAccount: { externalId: string };
  assetGroups: Array<
    PerformanceMaxAssetGroupDraft & {
      assets: PerformanceMaxAssetDraft[];
      listings: PerformanceMaxListingDraft[];
    }
  >;
  targets: PerformanceMaxTargetDraft[];
  signals: PerformanceMaxSignalDraft[];
  campaignOps?: CampaignOp[];
};

export type PmaxDraftView = PmaxDraftClientView;

const draftInclude = {
  assetGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      assets: { orderBy: { sortOrder: "asc" as const } },
      listings: { orderBy: { createdAt: "asc" as const } },
    },
  },
  targets: { orderBy: { createdAt: "asc" as const } },
  signals: { orderBy: { createdAt: "asc" as const } },
};

function microsToString(value: bigint | null | undefined): string | null {
  if (value == null) return null;
  return value.toString();
}

function decodeList(text: string): string[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return text
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export function toPmaxDraftView(row: PmaxDraftRecord): PmaxDraftView {
  return {
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccountId,
    name: row.name,
    dailyBudgetMicros: row.dailyBudgetMicros.toString(),
    biddingStrategy: row.biddingStrategy,
    targetCpaMicros: microsToString(row.targetCpaMicros),
    targetRoasText: row.targetRoasText,
    urlExpansionOptOut: row.urlExpansionOptOut,
    brandGuidelinesEnabled: row.brandGuidelinesEnabled,
    merchantCenterId: row.merchantCenterId,
    startDate: row.startDate,
    endDate: row.endDate,
    statusDraft: row.statusDraft,
    googleCampaignResourceName: row.googleCampaignResourceName,
    campaignOpId: row.campaignOpId,
    notesText: row.notesText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assetGroups: row.assetGroups.map((group) => ({
      id: group.id,
      name: group.name,
      finalUrl: group.finalUrl,
      headlines: decodeList(group.headlinesText),
      longHeadlines: decodeList(group.longHeadlinesText),
      descriptions: decodeList(group.descriptionsText),
      businessName: group.businessName,
      sortOrder: group.sortOrder,
      googleAssetGroupResourceName: group.googleAssetGroupResourceName,
      assets: group.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        urlText: asset.urlText,
        assetResourceName: asset.assetResourceName,
        sortOrder: asset.sortOrder,
      })),
      listings: group.listings.map((listing) => ({
        id: listing.id,
        kind: listing.kind,
        valueText: listing.valueText,
        dimensionText: listing.dimensionText,
        included: listing.included,
      })),
    })),
    targets: row.targets.map((target) => ({
      id: target.id,
      type: target.type,
      valueText: target.valueText,
      criterionText: target.criterionText,
      included: target.included,
    })),
    signals: row.signals.map((signal) => ({
      id: signal.id,
      kind: signal.kind,
      valueText: signal.valueText,
      criterionText: signal.criterionText,
      included: signal.included,
    })),
  };
}

export function pmaxDraftViewToTree(view: PmaxDraftView): PmaxDraftTree {
  return toTree(view);
}

function toTree(view: PmaxDraftView): PmaxDraftTree {
  return {
    customerId: view.customerId,
    externalAccountId: view.externalAccountId,
    name: view.name,
    dailyBudgetMicros: Number(view.dailyBudgetMicros),
    biddingStrategy: view.biddingStrategy as PmaxDraftTree["biddingStrategy"],
    targetCpaMicros: view.targetCpaMicros == null ? null : Number(view.targetCpaMicros),
    targetRoasText: view.targetRoasText,
    urlExpansionOptOut: view.urlExpansionOptOut,
    brandGuidelinesEnabled: view.brandGuidelinesEnabled,
    merchantCenterId: view.merchantCenterId,
    startDate: view.startDate,
    endDate: view.endDate,
    notesText: view.notesText,
    assetGroups: view.assetGroups.map((group) => ({
      name: group.name,
      finalUrl: group.finalUrl,
      headlines: group.headlines,
      longHeadlines: group.longHeadlines,
      descriptions: group.descriptions,
      businessName: group.businessName,
      sortOrder: group.sortOrder,
      assets: group.assets.map((asset) => ({
        kind: asset.kind as PmaxDraftTree["assetGroups"][number]["assets"][number]["kind"],
        urlText: asset.urlText,
        sortOrder: asset.sortOrder,
      })),
      listings: group.listings.map((listing) => ({
        kind: listing.kind as PmaxDraftTree["assetGroups"][number]["listings"][number]["kind"],
        valueText: listing.valueText,
        dimensionText: listing.dimensionText,
        included: listing.included,
      })),
    })),
    targets: view.targets.map((target) => ({
      type: target.type as PmaxDraftTree["targets"][number]["type"],
      valueText: target.valueText,
      criterionText: target.criterionText,
      included: target.included,
    })),
    signals: view.signals.map((signal) => ({
      kind: signal.kind as PmaxDraftTree["signals"][number]["kind"],
      valueText: signal.valueText,
      criterionText: signal.criterionText,
      included: signal.included,
    })),
  };
}

async function resolveExternalAccount(input: {
  customerId?: string;
  externalAccountId?: string;
}) {
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

async function replaceDraftChildren(draftId: string, tree: PmaxDraftTree) {
  const db = prisma();
  await db.performanceMaxTargetDraft.deleteMany({ where: { draftId } });
  await db.performanceMaxSignalDraft.deleteMany({ where: { draftId } });
  await db.performanceMaxAssetGroupDraft.deleteMany({ where: { draftId } });
  for (const [index, group] of tree.assetGroups.entries()) {
    await db.performanceMaxAssetGroupDraft.create({
      data: {
        draftId,
        name: group.name,
        finalUrl: group.finalUrl,
        headlinesText: encodeTextList(group.headlines),
        longHeadlinesText: encodeTextList(group.longHeadlines),
        descriptionsText: encodeTextList(group.descriptions),
        businessName: group.businessName,
        sortOrder: group.sortOrder ?? index,
        assets: {
          create: group.assets.map((asset, assetIndex) => ({
            kind: asset.kind,
            urlText: asset.urlText,
            sortOrder: asset.sortOrder ?? assetIndex,
          })),
        },
        listings: {
          create: group.listings.map((listing) => ({
            kind: listing.kind,
            valueText: listing.valueText,
            dimensionText: listing.dimensionText,
            included: listing.included,
          })),
        },
      },
    });
  }
  if (tree.targets.length) {
    await db.performanceMaxTargetDraft.createMany({
      data: tree.targets.map((target) => ({
        draftId,
        type: target.type,
        valueText: target.valueText,
        criterionText: target.criterionText,
        included: target.included,
      })),
    });
  }
  if (tree.signals.length) {
    await db.performanceMaxSignalDraft.createMany({
      data: tree.signals.map((signal) => ({
        draftId,
        kind: signal.kind,
        valueText: signal.valueText,
        criterionText: signal.criterionText,
        included: signal.included,
      })),
    });
  }
}

async function loadDraftOrThrow(id: string): Promise<PmaxDraftRecord> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().performanceMaxCampaignDraft.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
  });
  if (!row) {
    throw Object.assign(new Error("Performance Max campaign draft not found."), {
      status: 404,
      info: { kind: "validation", hint: "Create a draft from /ops first." },
    });
  }
  return row;
}

export async function listPmaxDrafts(): Promise<PmaxDraftView[]> {
  const ctx = await ensurePlatformContext();
  const rows = await prisma().performanceMaxCampaignDraft.findMany({
    where: { organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map((row) => toPmaxDraftView(row));
}

export async function getPmaxDraft(id: string): Promise<PmaxDraftView> {
  return toPmaxDraftView(await loadDraftOrThrow(id));
}

export async function createPmaxDraft(body: unknown): Promise<PmaxDraftView> {
  const tree = parsePmaxDraftWrite(body);
  const ctx = await ensurePlatformContext();
  const external = await resolveExternalAccount({
    customerId: tree.customerId,
    externalAccountId: tree.externalAccountId,
  });
  const draft = await prisma().performanceMaxCampaignDraft.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      externalAccountId: external.id,
      createdById: ctx.user.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      targetCpaMicros: tree.targetCpaMicros == null ? null : BigInt(tree.targetCpaMicros),
      targetRoasText: tree.targetRoasText ?? null,
      urlExpansionOptOut: tree.urlExpansionOptOut,
      brandGuidelinesEnabled: tree.brandGuidelinesEnabled,
      merchantCenterId: tree.merchantCenterId ?? null,
      startDate: tree.startDate ?? null,
      endDate: tree.endDate ?? null,
      notesText: tree.notesText ?? null,
      statusDraft: "DRAFT",
    },
  });
  await replaceDraftChildren(draft.id, tree);
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "pmax_draft.created",
    resourceType: "PERFORMANCE_MAX_CAMPAIGN_DRAFT",
    resourceId: draft.id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getPmaxDraft(draft.id);
}

export async function updatePmaxDraft(id: string, body: unknown): Promise<PmaxDraftView> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts are read-only."), {
      status: 400,
      info: { kind: "validation", hint: "Create a new draft to change an applied Performance Max campaign." },
    });
  }
  const tree = parsePmaxDraftWrite(body);
  const external = await resolveExternalAccount({
    customerId: tree.customerId || existing.externalAccount.externalId,
    externalAccountId: tree.externalAccountId ?? existing.externalAccountId,
  });
  await prisma().performanceMaxCampaignDraft.update({
    where: { id },
    data: {
      externalAccountId: external.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      targetCpaMicros: tree.targetCpaMicros == null ? null : BigInt(tree.targetCpaMicros),
      targetRoasText: tree.targetRoasText ?? null,
      urlExpansionOptOut: tree.urlExpansionOptOut,
      brandGuidelinesEnabled: tree.brandGuidelinesEnabled,
      merchantCenterId: tree.merchantCenterId ?? null,
      startDate: tree.startDate ?? null,
      endDate: tree.endDate ?? null,
      notesText: tree.notesText ?? null,
      statusDraft: "DRAFT",
      googleCampaignResourceName: null,
    },
  });
  await replaceDraftChildren(id, tree);
  const ctx = await ensurePlatformContext();
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "pmax_draft.updated",
    resourceType: "PERFORMANCE_MAX_CAMPAIGN_DRAFT",
    resourceId: id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getPmaxDraft(id);
}

export async function patchPmaxDraft(id: string, patch: unknown): Promise<PmaxDraftView> {
  const existing = await getPmaxDraft(id);
  const merged = mergePmaxDraftPatch(toTree(existing), patch);
  return updatePmaxDraft(id, merged);
}

export async function deletePmaxDraft(id: string): Promise<{ deleted: true }> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts cannot be deleted."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  await prisma().performanceMaxCampaignDraft.delete({ where: { id } });
  const ctx = await ensurePlatformContext();
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "pmax_draft.deleted",
    resourceType: "PERFORMANCE_MAX_CAMPAIGN_DRAFT",
    resourceId: id,
  });
  return { deleted: true };
}

export async function getPmaxDraftResult(id: string): Promise<{
  draft: PmaxDraftView;
  campaignOp: CampaignOpDetailView | null;
}> {
  const draft = await loadDraftOrThrow(id);
  const view = toPmaxDraftView(draft);
  if (!draft.campaignOpId) return { draft: view, campaignOp: null };
  try {
    return { draft: view, campaignOp: await getCampaignOpDetail(draft.campaignOpId) };
  } catch {
    return { draft: view, campaignOp: null };
  }
}

export async function validateOrApplyPmaxDraft(
  id: string,
  body: unknown,
  mode: "validate" | "apply",
): Promise<{
  draft: PmaxDraftView;
  dryRun: boolean;
  applied: boolean;
  status: "PAUSED";
  request: ReturnType<typeof buildPmaxDraftMutate>;
  response: unknown;
  source: "live" | "mock";
  campaignOpId: string;
}> {
  const raw = (body ?? {}) as Record<string, unknown>;
  const dryRun = mode === "validate" ? true : resolveDryRun(raw.dryRun);
  if (mode === "apply") {
    assertApplyConfirm(dryRun, raw.confirmPhrase);
  }
  const draft = await loadDraftOrThrow(id);
  const tree = parsePmaxDraftTree({
    ...toTree(toPmaxDraftView(draft)),
    ...raw,
    customerId: draft.externalAccount.externalId,
    status: raw.status ?? "PAUSED",
  });
  const request = buildPmaxDraftMutate(tree, dryRun);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (isKnownNotEnabledCustomer(tree.customerId)) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "campaign_op.blocked",
      resourceType: "PERFORMANCE_MAX_CAMPAIGN_DRAFT",
      resourceId: id,
      metadata: { reason: "CUSTOMER_NOT_ENABLED", customerId: tree.customerId },
    });
    throw Object.assign(
      new Error("Refusing mutate on known CUSTOMER_NOT_ENABLED account 485-651-7690."),
      {
        status: 400,
        info: {
          kind: "customer_not_enabled",
          hint: "Pick an enabled customer under MCC 857-080-5596.",
        },
      },
    );
  }

  const campaignOp = await prisma().campaignOp.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      workspaceId: ctx.workspace.id,
      providerId: provider.id,
      externalAccountId: draft.externalAccountId,
      requestedById: ctx.user.id,
      pmaxCampaignDraftId: draft.id,
      kind: "PMAX_CREATE",
      status: "DRAFT",
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      dryRun: request.validateOnly,
      confirmPhrase: raw.confirmPhrase == null ? null : String(raw.confirmPhrase),
      requestPayload: toJsonText(request),
      googleValidateOnly: request.validateOnly,
    },
  });

  await prisma().performanceMaxCampaignDraft.update({
    where: { id: draft.id },
    data: { campaignOpId: campaignOp.id },
  });

  async function persistResult(result: {
    response: unknown;
    source: "live" | "mock";
    success: boolean;
    errorMessage?: string;
    resourceName?: string | null;
  }) {
    await prisma().dryRunJob.create({
      data: {
        organizationId: ctx.org.id,
        providerId: provider.id,
        campaignOpId: campaignOp.id,
        externalAccountId: draft.externalAccountId,
        validateOnly: request.validateOnly,
        requestBody: toJsonText(request),
        responseBody: toJsonText(result.response),
        success: result.success,
      },
    });

    await prisma().campaignOp.update({
      where: { id: campaignOp.id },
      data: {
        status: result.success
          ? request.validateOnly
            ? "DRY_RUN_VALIDATED"
            : "APPLIED_PAUSED"
          : "FAILED",
        responsePayload: toJsonText(result.response),
        googleCampaignResourceName: result.resourceName ?? null,
        errorMessage: result.errorMessage ?? null,
        appliedAt: result.success && !request.validateOnly ? new Date() : null,
      },
    });

    await prisma().performanceMaxCampaignDraft.update({
      where: { id: draft.id },
      data: {
        statusDraft: result.success ? (request.validateOnly ? "VALIDATED" : "APPLIED") : "FAILED",
        googleCampaignResourceName: result.resourceName ?? undefined,
        campaignOpId: campaignOp.id,
      },
    });

    if (result.success && !request.validateOnly) {
      await prisma().changeRequest.create({
        data: {
          organizationId: ctx.org.id,
          providerId: provider.id,
          campaignOpId: campaignOp.id,
          requestedById: ctx.user.id,
          summary: `Apply PAUSED Performance Max campaign ${tree.name}`,
          approved: true,
          reviewedAt: new Date(),
        },
      });
      await prisma().externalEntity.upsert({
        where: {
          providerId_externalAccountId_entityType_externalId: {
            providerId: provider.id,
            externalAccountId: draft.externalAccountId,
            entityType: "CAMPAIGN",
            externalId: result.resourceName || campaignOp.id,
          },
        },
        create: {
          organizationId: ctx.org.id,
          providerId: provider.id,
          externalAccountId: draft.externalAccountId,
          entityType: "CAMPAIGN",
          externalId: result.resourceName || campaignOp.id,
          displayName: tree.name,
          status: "PAUSED",
          attributesText: toJsonText({
            dailyBudgetMicros: tree.dailyBudgetMicros,
            pmaxCampaignDraftId: draft.id,
            advertisingChannelType: "PERFORMANCE_MAX",
            dryRun: false,
          }),
          lastSyncedAt: new Date(),
        },
        update: {
          displayName: tree.name,
          status: "PAUSED",
          lastSyncedAt: new Date(),
        },
      });
    }

    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: result.success
        ? request.validateOnly
          ? "pmax_draft.validated"
          : "pmax_draft.applied_paused"
        : "pmax_draft.failed",
      resourceType: "PERFORMANCE_MAX_CAMPAIGN_DRAFT",
      resourceId: draft.id,
      metadata: {
        customerId: tree.customerId,
        dryRun: request.validateOnly,
        source: result.source,
        campaignOpId: campaignOp.id,
      },
    });
  }

  if (env.mockMode) {
    const response = {
      validateOnly: request.validateOnly,
      mock: true,
      note: request.validateOnly
        ? "Dry-run: full Performance Max tree validated locally. Nothing was sent to Google Ads."
        : "Mock apply: would create a PAUSED Performance Max campaign tree. No live mutate executed.",
      mutateOperationResponses: request.validateOnly
        ? []
        : [
            { campaignResult: { resourceName: `customers/${tree.customerId}/campaigns/mock-pmax-${draft.id}` } },
          ],
    };
    const names = extractPmaxResourceNames(response);
    await persistResult({
      response,
      source: "mock",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getPmaxDraft(draft.id),
      dryRun: request.validateOnly,
      applied: !request.validateOnly,
      status: "PAUSED",
      request,
      response,
      source: "mock",
      campaignOpId: campaignOp.id,
    };
  }

  try {
    const response = await mutateGoogleAds({
      customerId: request.customerId,
      mutateOperations: request.mutateOperations,
      validateOnly: request.validateOnly,
      responseContentType: request.responseContentType,
    });
    const names = extractPmaxResourceNames(response);
    await persistResult({
      response,
      source: "live",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getPmaxDraft(draft.id),
      dryRun: request.validateOnly,
      applied: !request.validateOnly,
      status: "PAUSED",
      request,
      response,
      source: "live",
      campaignOpId: campaignOp.id,
    };
  } catch (error) {
    await persistResult({
      response: { error: error instanceof Error ? error.message : String(error) },
      source: "live",
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export type { CampaignOpDetailView };
