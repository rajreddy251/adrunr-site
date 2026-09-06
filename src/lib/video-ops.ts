import "server-only";

import type {
  CampaignOp,
  VideoAdDraft,
  VideoAdGroupDraft,
  VideoAssetDraft,
  VideoAudienceDraft,
  VideoCampaignDraft,
  VideoTargetDraft,
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
import { mergeVideoDraftPatch } from "./assistant";
import {
  assertApplyConfirm,
  buildVideoDraftMutate,
  encodeTextList,
  extractVideoResourceNames,
  parseVideoDraftTree,
  parseVideoDraftWrite,
  type VideoDraftTree,
} from "./video-draft";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { VideoDraftClientView } from "./types";
import type { CampaignOpDetailView } from "./search-ops";
import { getCampaignOpDetail } from "./search-ops";

export type VideoDraftRecord = VideoCampaignDraft & {
  externalAccount: { externalId: string };
  adGroups: Array<
    VideoAdGroupDraft & {
      ads: Array<VideoAdDraft & { assets: VideoAssetDraft[] }>;
    }
  >;
  targets: VideoTargetDraft[];
  audiences: VideoAudienceDraft[];
  campaignOps?: CampaignOp[];
};

export type VideoDraftView = VideoDraftClientView;

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

export function toVideoDraftView(row: VideoDraftRecord): VideoDraftView {
  return {
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccountId,
    name: row.name,
    dailyBudgetMicros: row.dailyBudgetMicros.toString(),
    biddingStrategy: row.biddingStrategy,
    maxCpvMicros: microsToString(row.maxCpvMicros),
    targetCpmMicros: microsToString(row.targetCpmMicros),
    targetCpaMicros: microsToString(row.targetCpaMicros),
    inStream: row.inStream,
    bumper: row.bumper,
    inFeed: row.inFeed,
    shorts: row.shorts,
    outstream: row.outstream,
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
        longHeadline: ad.longHeadline,
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

export function videoDraftViewToTree(view: VideoDraftView): VideoDraftTree {
  return toTree(view);
}

function toTree(view: VideoDraftView): VideoDraftTree {
  return {
    customerId: view.customerId,
    externalAccountId: view.externalAccountId,
    name: view.name,
    dailyBudgetMicros: Number(view.dailyBudgetMicros),
    biddingStrategy: view.biddingStrategy as VideoDraftTree["biddingStrategy"],
    maxCpvMicros: view.maxCpvMicros == null ? null : Number(view.maxCpvMicros),
    targetCpmMicros: view.targetCpmMicros == null ? null : Number(view.targetCpmMicros),
    targetCpaMicros: view.targetCpaMicros == null ? null : Number(view.targetCpaMicros),
    inStream: view.inStream,
    bumper: view.bumper,
    inFeed: view.inFeed,
    shorts: view.shorts,
    outstream: view.outstream,
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
        longHeadline: ad.longHeadline,
        finalUrl: ad.finalUrl,
        callToActionText: ad.callToActionText,
        assets: ad.assets.map((asset) => ({
          kind: asset.kind as VideoDraftTree["adGroups"][number]["ads"][number]["assets"][number]["kind"],
          urlText: asset.urlText,
          sortOrder: asset.sortOrder,
        })),
      })),
    })),
    targets: view.targets.map((target) => ({
      type: target.type as VideoDraftTree["targets"][number]["type"],
      valueText: target.valueText,
      criterionText: target.criterionText,
      included: target.included,
    })),
    audiences: view.audiences.map((audience) => ({
      kind: audience.kind as VideoDraftTree["audiences"][number]["kind"],
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

async function replaceDraftChildren(draftId: string, tree: VideoDraftTree) {
  const db = prisma();
  await db.videoTargetDraft.deleteMany({ where: { draftId } });
  await db.videoAudienceDraft.deleteMany({ where: { draftId } });
  await db.videoAdGroupDraft.deleteMany({ where: { draftId } });
  for (const [index, group] of tree.adGroups.entries()) {
    await db.videoAdGroupDraft.create({
      data: {
        draftId,
        name: group.name,
        defaultBidMicros: BigInt(group.defaultBidMicros),
        sortOrder: group.sortOrder ?? index,
        ads: {
          create: group.ads.map((ad) => ({
            headlinesText: encodeTextList(ad.headlines),
            descriptionsText: encodeTextList(ad.descriptions),
            longHeadline: ad.longHeadline ?? null,
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
    await db.videoTargetDraft.createMany({
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
    await db.videoAudienceDraft.createMany({
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

async function loadDraftOrThrow(id: string): Promise<VideoDraftRecord> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().videoCampaignDraft.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
  });
  if (!row) {
    throw Object.assign(new Error("Video campaign draft not found."), {
      status: 404,
      info: { kind: "validation", hint: "Create a draft from /ops first." },
    });
  }
  return row;
}

export async function listVideoDrafts(): Promise<VideoDraftView[]> {
  const ctx = await ensurePlatformContext();
  const rows = await prisma().videoCampaignDraft.findMany({
    where: { organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map((row) => toVideoDraftView(row));
}

export async function getVideoDraft(id: string): Promise<VideoDraftView> {
  return toVideoDraftView(await loadDraftOrThrow(id));
}

export async function createVideoDraft(body: unknown): Promise<VideoDraftView> {
  const tree = parseVideoDraftWrite(body);
  const ctx = await ensurePlatformContext();
  const external = await resolveExternalAccount({
    customerId: tree.customerId,
    externalAccountId: tree.externalAccountId,
  });
  const draft = await prisma().videoCampaignDraft.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      externalAccountId: external.id,
      createdById: ctx.user.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      maxCpvMicros: tree.maxCpvMicros == null ? null : BigInt(tree.maxCpvMicros),
      targetCpmMicros: tree.targetCpmMicros == null ? null : BigInt(tree.targetCpmMicros),
      targetCpaMicros: tree.targetCpaMicros == null ? null : BigInt(tree.targetCpaMicros),
      inStream: tree.inStream,
      bumper: tree.bumper,
      inFeed: tree.inFeed,
      shorts: tree.shorts,
      outstream: tree.outstream,
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
    action: "video_draft.created",
    resourceType: "VIDEO_CAMPAIGN_DRAFT",
    resourceId: draft.id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getVideoDraft(draft.id);
}

export async function updateVideoDraft(id: string, body: unknown): Promise<VideoDraftView> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts are read-only."), {
      status: 400,
      info: { kind: "validation", hint: "Create a new draft to change an applied Video campaign." },
    });
  }
  const tree = parseVideoDraftWrite(body);
  const external = await resolveExternalAccount({
    customerId: tree.customerId || existing.externalAccount.externalId,
    externalAccountId: tree.externalAccountId ?? existing.externalAccountId,
  });
  await prisma().videoCampaignDraft.update({
    where: { id },
    data: {
      externalAccountId: external.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      maxCpvMicros: tree.maxCpvMicros == null ? null : BigInt(tree.maxCpvMicros),
      targetCpmMicros: tree.targetCpmMicros == null ? null : BigInt(tree.targetCpmMicros),
      targetCpaMicros: tree.targetCpaMicros == null ? null : BigInt(tree.targetCpaMicros),
      inStream: tree.inStream,
      bumper: tree.bumper,
      inFeed: tree.inFeed,
      shorts: tree.shorts,
      outstream: tree.outstream,
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
    action: "video_draft.updated",
    resourceType: "VIDEO_CAMPAIGN_DRAFT",
    resourceId: id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getVideoDraft(id);
}

export async function patchVideoDraft(id: string, patch: unknown): Promise<VideoDraftView> {
  const existing = await getVideoDraft(id);
  const merged = mergeVideoDraftPatch(toTree(existing), patch);
  return updateVideoDraft(id, merged);
}

export async function deleteVideoDraft(id: string): Promise<{ deleted: true }> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts cannot be deleted."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  await prisma().videoCampaignDraft.delete({ where: { id } });
  const ctx = await ensurePlatformContext();
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "video_draft.deleted",
    resourceType: "VIDEO_CAMPAIGN_DRAFT",
    resourceId: id,
  });
  return { deleted: true };
}

export async function getVideoDraftResult(id: string): Promise<{
  draft: VideoDraftView;
  campaignOp: CampaignOpDetailView | null;
}> {
  const draft = await loadDraftOrThrow(id);
  const view = toVideoDraftView(draft);
  if (!draft.campaignOpId) return { draft: view, campaignOp: null };
  try {
    return { draft: view, campaignOp: await getCampaignOpDetail(draft.campaignOpId) };
  } catch {
    return { draft: view, campaignOp: null };
  }
}

export async function validateOrApplyVideoDraft(
  id: string,
  body: unknown,
  mode: "validate" | "apply",
): Promise<{
  draft: VideoDraftView;
  dryRun: boolean;
  applied: boolean;
  status: "PAUSED";
  request: ReturnType<typeof buildVideoDraftMutate>;
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
  const tree = parseVideoDraftTree({
    ...toTree(toVideoDraftView(draft)),
    ...raw,
    customerId: draft.externalAccount.externalId,
    status: raw.status ?? "PAUSED",
  });
  const request = buildVideoDraftMutate(tree, dryRun);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (isKnownNotEnabledCustomer(tree.customerId)) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "campaign_op.blocked",
      resourceType: "VIDEO_CAMPAIGN_DRAFT",
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
      videoCampaignDraftId: draft.id,
      kind: "VIDEO_CREATE",
      status: "DRAFT",
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      dryRun: request.validateOnly,
      confirmPhrase: raw.confirmPhrase == null ? null : String(raw.confirmPhrase),
      requestPayload: toJsonText(request),
      googleValidateOnly: request.validateOnly,
    },
  });

  await prisma().videoCampaignDraft.update({
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

    await prisma().videoCampaignDraft.update({
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
          summary: `Apply PAUSED Video campaign ${tree.name}`,
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
            videoCampaignDraftId: draft.id,
            advertisingChannelType: "VIDEO",
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
          ? "video_draft.validated"
          : "video_draft.applied_paused"
        : "video_draft.failed",
      resourceType: "VIDEO_CAMPAIGN_DRAFT",
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
        ? "Dry-run: full Video tree validated locally. Nothing was sent to Google Ads."
        : "Mock apply: would create a PAUSED Video campaign tree. No live mutate executed.",
      mutateOperationResponses: request.validateOnly
        ? []
        : [
            { campaignResult: { resourceName: `customers/${tree.customerId}/campaigns/mock-video-${draft.id}` } },
          ],
    };
    const names = extractVideoResourceNames(response);
    await persistResult({
      response,
      source: "mock",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getVideoDraft(draft.id),
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
    const names = extractVideoResourceNames(response);
    await persistResult({
      response,
      source: "live",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getVideoDraft(draft.id),
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
