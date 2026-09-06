import "server-only";

import type {
  CampaignOp,
  DemandGenAdDraft,
  DemandGenAdGroupDraft,
  DemandGenAssetDraft,
  DemandGenAudienceDraft,
  DemandGenCampaignDraft,
  DemandGenTargetDraft,
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
import { mergeDemandGenDraftPatch } from "./assistant";
import {
  assertApplyConfirm,
  buildDemandGenDraftMutate,
  encodeTextList,
  extractDemandGenResourceNames,
  parseDemandGenDraftTree,
  parseDemandGenDraftWrite,
  type DemandGenDraftTree,
} from "./demand-gen-draft";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { DemandGenDraftClientView } from "./types";
import type { CampaignOpDetailView } from "./search-ops";
import { getCampaignOpDetail } from "./search-ops";

export type DemandGenDraftRecord = DemandGenCampaignDraft & {
  externalAccount: { externalId: string };
  adGroups: Array<
    DemandGenAdGroupDraft & {
      ads: Array<DemandGenAdDraft & { assets: DemandGenAssetDraft[] }>;
    }
  >;
  targets: DemandGenTargetDraft[];
  audiences: DemandGenAudienceDraft[];
  campaignOps?: CampaignOp[];
};

export type DemandGenDraftView = DemandGenDraftClientView;

const draftInclude = {
  adGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      ads: {
        orderBy: { createdAt: "asc" as const },
        include: { assets: { orderBy: { sortOrder: "asc" as const } } },
      },
    },
  },
  targets: { orderBy: { createdAt: "asc" as const } },
  audiences: { orderBy: { createdAt: "asc" as const } },
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

export function toDemandGenDraftView(row: DemandGenDraftRecord): DemandGenDraftView {
  return {
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccountId,
    name: row.name,
    dailyBudgetMicros: row.dailyBudgetMicros.toString(),
    biddingStrategy: row.biddingStrategy,
    targetCpaMicros: microsToString(row.targetCpaMicros),
    targetRoasText: row.targetRoasText,
    youtubeInStream: row.youtubeInStream,
    youtubeInFeed: row.youtubeInFeed,
    youtubeShorts: row.youtubeShorts,
    discover: row.discover,
    gmail: row.gmail,
    display: row.display,
    startDate: row.startDate,
    endDate: row.endDate,
    statusDraft: row.statusDraft,
    googleCampaignResourceName: row.googleCampaignResourceName,
    campaignOpId: row.campaignOpId,
    notesText: row.notesText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    adGroups: row.adGroups.map((group) => ({
      id: group.id,
      name: group.name,
      defaultBidMicros: group.defaultBidMicros.toString(),
      sortOrder: group.sortOrder,
      googleAdGroupResourceName: group.googleAdGroupResourceName,
      ads: group.ads.map((ad) => ({
        id: ad.id,
        headlines: decodeList(ad.headlinesText),
        descriptions: decodeList(ad.descriptionsText),
        businessName: ad.businessName,
        finalUrl: ad.finalUrl,
        callToActionText: ad.callToActionText,
        googleAdResourceName: ad.googleAdResourceName,
        assets: ad.assets.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          urlText: asset.urlText,
          assetResourceName: asset.assetResourceName,
          sortOrder: asset.sortOrder,
        })),
      })),
    })),
    targets: row.targets.map((target) => ({
      id: target.id,
      type: target.type,
      valueText: target.valueText,
      criterionText: target.criterionText,
      included: target.included,
    })),
    audiences: row.audiences.map((audience) => ({
      id: audience.id,
      kind: audience.kind,
      valueText: audience.valueText,
      criterionText: audience.criterionText,
      included: audience.included,
    })),
  };
}

export function demandGenDraftViewToTree(view: DemandGenDraftView): DemandGenDraftTree {
  return toTree(view);
}

function toTree(view: DemandGenDraftView): DemandGenDraftTree {
  return {
    customerId: view.customerId,
    externalAccountId: view.externalAccountId,
    name: view.name,
    dailyBudgetMicros: Number(view.dailyBudgetMicros),
    biddingStrategy: view.biddingStrategy as DemandGenDraftTree["biddingStrategy"],
    targetCpaMicros: view.targetCpaMicros == null ? null : Number(view.targetCpaMicros),
    targetRoasText: view.targetRoasText,
    youtubeInStream: view.youtubeInStream,
    youtubeInFeed: view.youtubeInFeed,
    youtubeShorts: view.youtubeShorts,
    discover: view.discover,
    gmail: view.gmail,
    display: view.display,
    startDate: view.startDate,
    endDate: view.endDate,
    notesText: view.notesText,
    adGroups: view.adGroups.map((group) => ({
      name: group.name,
      defaultBidMicros: Number(group.defaultBidMicros),
      sortOrder: group.sortOrder,
      ads: group.ads.map((ad) => ({
        headlines: ad.headlines,
        descriptions: ad.descriptions,
        businessName: ad.businessName,
        finalUrl: ad.finalUrl,
        callToActionText: ad.callToActionText,
        assets: ad.assets.map((asset) => ({
          kind: asset.kind as DemandGenDraftTree["adGroups"][number]["ads"][number]["assets"][number]["kind"],
          urlText: asset.urlText,
          sortOrder: asset.sortOrder,
        })),
      })),
    })),
    targets: view.targets.map((target) => ({
      type: target.type as DemandGenDraftTree["targets"][number]["type"],
      valueText: target.valueText,
      criterionText: target.criterionText,
      included: target.included,
    })),
    audiences: view.audiences.map((audience) => ({
      kind: audience.kind as DemandGenDraftTree["audiences"][number]["kind"],
      valueText: audience.valueText,
      criterionText: audience.criterionText,
      included: audience.included,
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

async function replaceDraftChildren(draftId: string, tree: DemandGenDraftTree) {
  const db = prisma();
  await db.demandGenTargetDraft.deleteMany({ where: { draftId } });
  await db.demandGenAudienceDraft.deleteMany({ where: { draftId } });
  await db.demandGenAdGroupDraft.deleteMany({ where: { draftId } });
  for (const [index, group] of tree.adGroups.entries()) {
    await db.demandGenAdGroupDraft.create({
      data: {
        draftId,
        name: group.name,
        defaultBidMicros: BigInt(group.defaultBidMicros),
        sortOrder: group.sortOrder ?? index,
        ads: {
          create: group.ads.map((ad) => ({
            headlinesText: encodeTextList(ad.headlines),
            descriptionsText: encodeTextList(ad.descriptions),
            businessName: ad.businessName,
            finalUrl: ad.finalUrl,
            callToActionText: ad.callToActionText ?? null,
            assets: {
              create: ad.assets.map((asset, assetIndex) => ({
                kind: asset.kind,
                urlText: asset.urlText,
                sortOrder: asset.sortOrder ?? assetIndex,
              })),
            },
          })),
        },
      },
    });
  }
  if (tree.targets.length) {
    await db.demandGenTargetDraft.createMany({
      data: tree.targets.map((target) => ({
        draftId,
        type: target.type,
        valueText: target.valueText,
        criterionText: target.criterionText,
        included: target.included,
      })),
    });
  }
  if (tree.audiences.length) {
    await db.demandGenAudienceDraft.createMany({
      data: tree.audiences.map((audience) => ({
        draftId,
        kind: audience.kind,
        valueText: audience.valueText,
        criterionText: audience.criterionText,
        included: audience.included,
      })),
    });
  }
}

async function loadDraftOrThrow(id: string): Promise<DemandGenDraftRecord> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().demandGenCampaignDraft.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
  });
  if (!row) {
    throw Object.assign(new Error("Demand Gen campaign draft not found."), {
      status: 404,
      info: { kind: "validation", hint: "Create a draft from /ops first." },
    });
  }
  return row;
}

export async function listDemandGenDrafts(): Promise<DemandGenDraftView[]> {
  const ctx = await ensurePlatformContext();
  const rows = await prisma().demandGenCampaignDraft.findMany({
    where: { organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map((row) => toDemandGenDraftView(row));
}

export async function getDemandGenDraft(id: string): Promise<DemandGenDraftView> {
  return toDemandGenDraftView(await loadDraftOrThrow(id));
}

export async function createDemandGenDraft(body: unknown): Promise<DemandGenDraftView> {
  const tree = parseDemandGenDraftWrite(body);
  const ctx = await ensurePlatformContext();
  const external = await resolveExternalAccount({
    customerId: tree.customerId,
    externalAccountId: tree.externalAccountId,
  });
  const draft = await prisma().demandGenCampaignDraft.create({
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
      youtubeInStream: tree.youtubeInStream,
      youtubeInFeed: tree.youtubeInFeed,
      youtubeShorts: tree.youtubeShorts,
      discover: tree.discover,
      gmail: tree.gmail,
      display: tree.display,
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
    action: "demand_gen_draft.created",
    resourceType: "DEMAND_GEN_CAMPAIGN_DRAFT",
    resourceId: draft.id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getDemandGenDraft(draft.id);
}

export async function updateDemandGenDraft(id: string, body: unknown): Promise<DemandGenDraftView> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts are read-only."), {
      status: 400,
      info: { kind: "validation", hint: "Create a new draft to change an applied Demand Gen campaign." },
    });
  }
  const tree = parseDemandGenDraftWrite(body);
  const external = await resolveExternalAccount({
    customerId: tree.customerId || existing.externalAccount.externalId,
    externalAccountId: tree.externalAccountId ?? existing.externalAccountId,
  });
  await prisma().demandGenCampaignDraft.update({
    where: { id },
    data: {
      externalAccountId: external.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      targetCpaMicros: tree.targetCpaMicros == null ? null : BigInt(tree.targetCpaMicros),
      targetRoasText: tree.targetRoasText ?? null,
      youtubeInStream: tree.youtubeInStream,
      youtubeInFeed: tree.youtubeInFeed,
      youtubeShorts: tree.youtubeShorts,
      discover: tree.discover,
      gmail: tree.gmail,
      display: tree.display,
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
    action: "demand_gen_draft.updated",
    resourceType: "DEMAND_GEN_CAMPAIGN_DRAFT",
    resourceId: id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getDemandGenDraft(id);
}

export async function patchDemandGenDraft(id: string, patch: unknown): Promise<DemandGenDraftView> {
  const existing = await getDemandGenDraft(id);
  const merged = mergeDemandGenDraftPatch(toTree(existing), patch);
  return updateDemandGenDraft(id, merged);
}

export async function deleteDemandGenDraft(id: string): Promise<{ deleted: true }> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts cannot be deleted."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  await prisma().demandGenCampaignDraft.delete({ where: { id } });
  const ctx = await ensurePlatformContext();
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "demand_gen_draft.deleted",
    resourceType: "DEMAND_GEN_CAMPAIGN_DRAFT",
    resourceId: id,
  });
  return { deleted: true };
}

export async function getDemandGenDraftResult(id: string): Promise<{
  draft: DemandGenDraftView;
  campaignOp: CampaignOpDetailView | null;
}> {
  const draft = await loadDraftOrThrow(id);
  const view = toDemandGenDraftView(draft);
  if (!draft.campaignOpId) return { draft: view, campaignOp: null };
  try {
    return { draft: view, campaignOp: await getCampaignOpDetail(draft.campaignOpId) };
  } catch {
    return { draft: view, campaignOp: null };
  }
}

export async function validateOrApplyDemandGenDraft(
  id: string,
  body: unknown,
  mode: "validate" | "apply",
): Promise<{
  draft: DemandGenDraftView;
  dryRun: boolean;
  applied: boolean;
  status: "PAUSED";
  request: ReturnType<typeof buildDemandGenDraftMutate>;
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
  const tree = parseDemandGenDraftTree({
    ...toTree(toDemandGenDraftView(draft)),
    ...raw,
    customerId: draft.externalAccount.externalId,
    status: raw.status ?? "PAUSED",
  });
  const request = buildDemandGenDraftMutate(tree, dryRun);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (isKnownNotEnabledCustomer(tree.customerId)) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "campaign_op.blocked",
      resourceType: "DEMAND_GEN_CAMPAIGN_DRAFT",
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
      demandGenCampaignDraftId: draft.id,
      kind: "DEMAND_GEN_CREATE",
      status: "DRAFT",
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      dryRun: request.validateOnly,
      confirmPhrase: raw.confirmPhrase == null ? null : String(raw.confirmPhrase),
      requestPayload: toJsonText(request),
      googleValidateOnly: request.validateOnly,
    },
  });

  await prisma().demandGenCampaignDraft.update({
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

    await prisma().demandGenCampaignDraft.update({
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
          summary: `Apply PAUSED Demand Gen campaign ${tree.name}`,
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
            demandGenCampaignDraftId: draft.id,
            advertisingChannelType: "DEMAND_GEN",
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
          ? "demand_gen_draft.validated"
          : "demand_gen_draft.applied_paused"
        : "demand_gen_draft.failed",
      resourceType: "DEMAND_GEN_CAMPAIGN_DRAFT",
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
        ? "Dry-run: full Demand Gen tree validated locally. Nothing was sent to Google Ads."
        : "Mock apply: would create a PAUSED Demand Gen campaign tree. No live mutate executed.",
      mutateOperationResponses: request.validateOnly
        ? []
        : [
            { campaignResult: { resourceName: `customers/${tree.customerId}/campaigns/mock-demand-gen-${draft.id}` } },
          ],
    };
    const names = extractDemandGenResourceNames(response);
    await persistResult({
      response,
      source: "mock",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getDemandGenDraft(draft.id),
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
    const names = extractDemandGenResourceNames(response);
    await persistResult({
      response,
      source: "live",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getDemandGenDraft(draft.id),
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
