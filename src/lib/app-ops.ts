import "server-only";

import type {
  AppAdDraft,
  AppAdGroupDraft,
  AppAssetDraft,
  AppCampaignDraft,
  AppPlatformDraft,
  AppTargetDraft,
  CampaignOp,
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
import { mergeAppDraftPatch } from "./assistant";
import {
  assertApplyConfirm,
  buildAppDraftMutate,
  encodeTextList,
  extractAppResourceNames,
  parseAppDraftTree,
  parseAppDraftWrite,
  type AppDraftTree,
} from "./app-draft";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { AppDraftClientView } from "./types";
import type { CampaignOpDetailView } from "./search-ops";
import { getCampaignOpDetail } from "./search-ops";

export type AppDraftRecord = AppCampaignDraft & {
  externalAccount: { externalId: string };
  platforms: AppPlatformDraft[];
  adGroups: Array<
    AppAdGroupDraft & {
      ads: Array<AppAdDraft & { assets: AppAssetDraft[] }>;
    }
  >;
  targets: AppTargetDraft[];
  campaignOps?: CampaignOp[];
};

export type AppDraftView = AppDraftClientView;

const draftInclude = {
  platforms: { orderBy: { sortOrder: "asc" as const } },
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

export function toAppDraftView(row: AppDraftRecord): AppDraftView {
  return {
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccountId,
    name: row.name,
    dailyBudgetMicros: row.dailyBudgetMicros.toString(),
    biddingStrategy: row.biddingStrategy,
    goal: row.goal,
    targetCpaMicros: microsToString(row.targetCpaMicros),
    targetRoasText: row.targetRoasText,
    startDate: row.startDate,
    endDate: row.endDate,
    statusDraft: row.statusDraft,
    googleCampaignResourceName: row.googleCampaignResourceName,
    campaignOpId: row.campaignOpId,
    notesText: row.notesText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    platforms: row.platforms.map((item) => ({
      id: item.id,
      platform: item.platform,
      appId: item.appId,
      included: item.included,
      sortOrder: item.sortOrder,
    })),
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
  };
}

export function appDraftViewToTree(view: AppDraftView): AppDraftTree {
  return toTree(view);
}

function toTree(view: AppDraftView): AppDraftTree {
  return {
    customerId: view.customerId,
    externalAccountId: view.externalAccountId,
    name: view.name,
    dailyBudgetMicros: Number(view.dailyBudgetMicros),
    biddingStrategy: view.biddingStrategy as AppDraftTree["biddingStrategy"],
    goal: view.goal as AppDraftTree["goal"],
    targetCpaMicros: view.targetCpaMicros == null ? null : Number(view.targetCpaMicros),
    targetRoasText: view.targetRoasText,
    startDate: view.startDate,
    endDate: view.endDate,
    notesText: view.notesText,
    platforms: view.platforms.map((item) => ({
      platform: item.platform as AppDraftTree["platforms"][number]["platform"],
      appId: item.appId,
      included: item.included,
      sortOrder: item.sortOrder,
    })),
    adGroups: view.adGroups.map((group) => ({
      name: group.name,
      defaultBidMicros: Number(group.defaultBidMicros),
      sortOrder: group.sortOrder,
      ads: group.ads.map((ad) => ({
        headlines: ad.headlines,
        descriptions: ad.descriptions,
        assets: ad.assets.map((asset) => ({
          kind: asset.kind as AppDraftTree["adGroups"][number]["ads"][number]["assets"][number]["kind"],
          urlText: asset.urlText,
          sortOrder: asset.sortOrder,
        })),
      })),
    })),
    targets: view.targets.map((target) => ({
      type: target.type as AppDraftTree["targets"][number]["type"],
      valueText: target.valueText,
      criterionText: target.criterionText,
      included: target.included,
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

async function replaceDraftChildren(draftId: string, tree: AppDraftTree) {
  const db = prisma();
  await db.appTargetDraft.deleteMany({ where: { draftId } });
  await db.appPlatformDraft.deleteMany({ where: { draftId } });
  await db.appAdGroupDraft.deleteMany({ where: { draftId } });
  if (tree.platforms.length) {
    await db.appPlatformDraft.createMany({
      data: tree.platforms.map((item, index) => ({
        draftId,
        platform: item.platform,
        appId: item.appId,
        included: item.included,
        sortOrder: item.sortOrder ?? index,
      })),
    });
  }
  for (const [index, group] of tree.adGroups.entries()) {
    await db.appAdGroupDraft.create({
      data: {
        draftId,
        name: group.name,
        defaultBidMicros: BigInt(group.defaultBidMicros),
        sortOrder: group.sortOrder ?? index,
        ads: {
          create: group.ads.map((ad) => ({
            headlinesText: encodeTextList(ad.headlines),
            descriptionsText: encodeTextList(ad.descriptions),
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
    await db.appTargetDraft.createMany({
      data: tree.targets.map((target) => ({
        draftId,
        type: target.type,
        valueText: target.valueText,
        criterionText: target.criterionText,
        included: target.included,
      })),
    });
  }
}

async function loadDraftOrThrow(id: string): Promise<AppDraftRecord> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().appCampaignDraft.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
  });
  if (!row) {
    throw Object.assign(new Error("App campaign draft not found."), {
      status: 404,
      info: { kind: "validation", hint: "Create a draft from /ops first." },
    });
  }
  return row;
}

export async function listAppDrafts(): Promise<AppDraftView[]> {
  const ctx = await ensurePlatformContext();
  const rows = await prisma().appCampaignDraft.findMany({
    where: { organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map((row) => toAppDraftView(row));
}

export async function getAppDraft(id: string): Promise<AppDraftView> {
  return toAppDraftView(await loadDraftOrThrow(id));
}

export async function createAppDraft(body: unknown): Promise<AppDraftView> {
  const tree = parseAppDraftWrite(body);
  const ctx = await ensurePlatformContext();
  const external = await resolveExternalAccount({
    customerId: tree.customerId,
    externalAccountId: tree.externalAccountId,
  });
  const draft = await prisma().appCampaignDraft.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      externalAccountId: external.id,
      createdById: ctx.user.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      goal: tree.goal,
      targetCpaMicros: tree.targetCpaMicros == null ? null : BigInt(tree.targetCpaMicros),
      targetRoasText: tree.targetRoasText ?? null,
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
    action: "app_draft.created",
    resourceType: "APP_CAMPAIGN_DRAFT",
    resourceId: draft.id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getAppDraft(draft.id);
}

export async function updateAppDraft(id: string, body: unknown): Promise<AppDraftView> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts are read-only."), {
      status: 400,
      info: { kind: "validation", hint: "Create a new draft to change an applied App campaign." },
    });
  }
  const tree = parseAppDraftWrite(body);
  const external = await resolveExternalAccount({
    customerId: tree.customerId || existing.externalAccount.externalId,
    externalAccountId: tree.externalAccountId ?? existing.externalAccountId,
  });
  await prisma().appCampaignDraft.update({
    where: { id },
    data: {
      externalAccountId: external.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      goal: tree.goal,
      targetCpaMicros: tree.targetCpaMicros == null ? null : BigInt(tree.targetCpaMicros),
      targetRoasText: tree.targetRoasText ?? null,
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
    action: "app_draft.updated",
    resourceType: "APP_CAMPAIGN_DRAFT",
    resourceId: id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getAppDraft(id);
}

export async function patchAppDraft(id: string, patch: unknown): Promise<AppDraftView> {
  const existing = await getAppDraft(id);
  const merged = mergeAppDraftPatch(toTree(existing), patch);
  return updateAppDraft(id, merged);
}

export async function deleteAppDraft(id: string): Promise<{ deleted: true }> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts cannot be deleted."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  await prisma().appCampaignDraft.delete({ where: { id } });
  const ctx = await ensurePlatformContext();
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "app_draft.deleted",
    resourceType: "APP_CAMPAIGN_DRAFT",
    resourceId: id,
  });
  return { deleted: true };
}

export async function getAppDraftResult(id: string): Promise<{
  draft: AppDraftView;
  campaignOp: CampaignOpDetailView | null;
}> {
  const draft = await loadDraftOrThrow(id);
  const view = toAppDraftView(draft);
  if (!draft.campaignOpId) return { draft: view, campaignOp: null };
  try {
    return { draft: view, campaignOp: await getCampaignOpDetail(draft.campaignOpId) };
  } catch {
    return { draft: view, campaignOp: null };
  }
}

export async function validateOrApplyAppDraft(
  id: string,
  body: unknown,
  mode: "validate" | "apply",
): Promise<{
  draft: AppDraftView;
  dryRun: boolean;
  applied: boolean;
  status: "PAUSED";
  request: ReturnType<typeof buildAppDraftMutate>;
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
  const tree = parseAppDraftTree({
    ...toTree(toAppDraftView(draft)),
    ...raw,
    customerId: draft.externalAccount.externalId,
    status: raw.status ?? "PAUSED",
  });
  const request = buildAppDraftMutate(tree, dryRun);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (isKnownNotEnabledCustomer(tree.customerId)) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "campaign_op.blocked",
      resourceType: "APP_CAMPAIGN_DRAFT",
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
      appCampaignDraftId: draft.id,
      kind: "APP_CREATE",
      status: "DRAFT",
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      dryRun: request.validateOnly,
      confirmPhrase: raw.confirmPhrase == null ? null : String(raw.confirmPhrase),
      requestPayload: toJsonText(request),
      googleValidateOnly: request.validateOnly,
    },
  });

  await prisma().appCampaignDraft.update({
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

    await prisma().appCampaignDraft.update({
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
          summary: `Apply PAUSED App campaign ${tree.name}`,
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
            appCampaignDraftId: draft.id,
            advertisingChannelType: "MULTI_CHANNEL",
            advertisingChannelSubType: "APP_CAMPAIGN",
            goal: tree.goal,
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
          ? "app_draft.validated"
          : "app_draft.applied_paused"
        : "app_draft.failed",
      resourceType: "APP_CAMPAIGN_DRAFT",
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
        ? "Dry-run: full App tree validated locally. Nothing was sent to Google Ads."
        : "Mock apply: would create a PAUSED App campaign tree. No live mutate executed.",
      mutateOperationResponses: request.validateOnly
        ? []
        : [{ campaignResult: { resourceName: `customers/${tree.customerId}/campaigns/mock-app-${draft.id}` } }],
    };
    const names = extractAppResourceNames(response);
    await persistResult({
      response,
      source: "mock",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getAppDraft(draft.id),
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
    const names = extractAppResourceNames(response);
    await persistResult({
      response,
      source: "live",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getAppDraft(draft.id),
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
