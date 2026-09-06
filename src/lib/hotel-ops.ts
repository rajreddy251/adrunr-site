import "server-only";

import type {
  CampaignOp,
  HotelAdGroupDraft,
  HotelCampaignDraft,
  HotelListingDraft,
  HotelTargetDraft,
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
import { mergeHotelDraftPatch } from "./assistant";
import {
  assertApplyConfirm,
  buildHotelDraftMutate,
  extractHotelResourceNames,
  parseHotelDraftTree,
  parseHotelDraftWrite,
  type HotelDraftTree,
} from "./hotel-draft";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { HotelDraftClientView } from "./types";
import type { CampaignOpDetailView } from "./search-ops";
import { getCampaignOpDetail } from "./search-ops";

export type HotelDraftRecord = HotelCampaignDraft & {
  externalAccount: { externalId: string };
  adGroups: Array<HotelAdGroupDraft & { listings: HotelListingDraft[] }>;
  targets: HotelTargetDraft[];
  campaignOps?: CampaignOp[];
};

export type HotelDraftView = HotelDraftClientView;

const draftInclude = {
  adGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: { listings: { orderBy: { sortOrder: "asc" as const } } },
  },
  targets: { orderBy: { createdAt: "asc" as const } },
};

function microsToString(value: bigint | null | undefined): string | null {
  if (value == null) return null;
  return value.toString();
}

export function toHotelDraftView(row: HotelDraftRecord): HotelDraftView {
  return {
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccountId,
    name: row.name,
    dailyBudgetMicros: row.dailyBudgetMicros.toString(),
    biddingStrategy: row.biddingStrategy,
    hotelCenterId: row.hotelCenterId,
    percentCpcCeilingMicros: microsToString(row.percentCpcCeilingMicros),
    commissionRateText: row.commissionRateText,
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
      listings: group.listings.map((item) => ({
        id: item.id,
        kind: item.kind,
        valueText: item.valueText,
        hotelIdText: item.hotelIdText,
        included: item.included,
        sortOrder: item.sortOrder,
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

export function hotelDraftViewToTree(view: HotelDraftView): HotelDraftTree {
  return toTree(view);
}

function toTree(view: HotelDraftView): HotelDraftTree {
  return {
    customerId: view.customerId,
    externalAccountId: view.externalAccountId,
    name: view.name,
    dailyBudgetMicros: Number(view.dailyBudgetMicros),
    biddingStrategy: view.biddingStrategy as HotelDraftTree["biddingStrategy"],
    hotelCenterId: view.hotelCenterId,
    percentCpcCeilingMicros: view.percentCpcCeilingMicros == null ? null : Number(view.percentCpcCeilingMicros),
    commissionRateText: view.commissionRateText,
    startDate: view.startDate,
    endDate: view.endDate,
    notesText: view.notesText,
    adGroups: view.adGroups.map((group) => ({
      name: group.name,
      defaultBidMicros: Number(group.defaultBidMicros),
      sortOrder: group.sortOrder,
      listings: group.listings.map((item) => ({
        kind: item.kind as HotelDraftTree["adGroups"][number]["listings"][number]["kind"],
        valueText: item.valueText,
        hotelIdText: item.hotelIdText,
        included: item.included,
        sortOrder: item.sortOrder,
      })),
    })),
    targets: view.targets.map((target) => ({
      type: target.type as HotelDraftTree["targets"][number]["type"],
      valueText: target.valueText,
      criterionText: target.criterionText,
      included: target.included,
    })),
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

async function replaceDraftChildren(draftId: string, tree: HotelDraftTree) {
  const db = prisma();
  await db.hotelTargetDraft.deleteMany({ where: { draftId } });
  await db.hotelAdGroupDraft.deleteMany({ where: { draftId } });
  for (const [index, group] of tree.adGroups.entries()) {
    await db.hotelAdGroupDraft.create({
      data: {
        draftId,
        name: group.name,
        defaultBidMicros: BigInt(group.defaultBidMicros),
        sortOrder: group.sortOrder ?? index,
        listings: {
          create: group.listings.map((item, listingIndex) => ({
            kind: item.kind,
            valueText: item.valueText,
            hotelIdText: item.hotelIdText,
            included: item.included,
            sortOrder: item.sortOrder ?? listingIndex,
          })),
        },
      },
    });
  }
  if (tree.targets.length) {
    await db.hotelTargetDraft.createMany({
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

async function loadDraftOrThrow(id: string): Promise<HotelDraftRecord> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().hotelCampaignDraft.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
  });
  if (!row) {
    throw Object.assign(new Error("Hotel campaign draft not found."), {
      status: 404,
      info: { kind: "validation", hint: "Create a draft from /ops first." },
    });
  }
  return row;
}

export async function listHotelDrafts(): Promise<HotelDraftView[]> {
  const ctx = await ensurePlatformContext();
  const rows = await prisma().hotelCampaignDraft.findMany({
    where: { organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map((row) => toHotelDraftView(row));
}

export async function getHotelDraft(id: string): Promise<HotelDraftView> {
  return toHotelDraftView(await loadDraftOrThrow(id));
}

export async function createHotelDraft(body: unknown): Promise<HotelDraftView> {
  const tree = parseHotelDraftWrite(body);
  const ctx = await ensurePlatformContext();
  const external = await resolveExternalAccount({
    customerId: tree.customerId,
    externalAccountId: tree.externalAccountId,
  });
  const draft = await prisma().hotelCampaignDraft.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      externalAccountId: external.id,
      createdById: ctx.user.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      hotelCenterId: tree.hotelCenterId ?? null,
      percentCpcCeilingMicros: tree.percentCpcCeilingMicros == null ? null : BigInt(tree.percentCpcCeilingMicros),
      commissionRateText: tree.commissionRateText ?? null,
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
    action: "hotel_draft.created",
    resourceType: "HOTEL_CAMPAIGN_DRAFT",
    resourceId: draft.id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getHotelDraft(draft.id);
}

export async function updateHotelDraft(id: string, body: unknown): Promise<HotelDraftView> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts are read-only."), {
      status: 400,
      info: { kind: "validation", hint: "Create a new draft to change an applied Hotel campaign." },
    });
  }
  const tree = parseHotelDraftWrite(body);
  const external = await resolveExternalAccount({
    customerId: tree.customerId || existing.externalAccount.externalId,
    externalAccountId: tree.externalAccountId ?? existing.externalAccountId,
  });
  await prisma().hotelCampaignDraft.update({
    where: { id },
    data: {
      externalAccountId: external.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      hotelCenterId: tree.hotelCenterId ?? null,
      percentCpcCeilingMicros: tree.percentCpcCeilingMicros == null ? null : BigInt(tree.percentCpcCeilingMicros),
      commissionRateText: tree.commissionRateText ?? null,
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
    action: "hotel_draft.updated",
    resourceType: "HOTEL_CAMPAIGN_DRAFT",
    resourceId: id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getHotelDraft(id);
}

export async function patchHotelDraft(id: string, patch: unknown): Promise<HotelDraftView> {
  const existing = await getHotelDraft(id);
  const merged = mergeHotelDraftPatch(toTree(existing), patch);
  return updateHotelDraft(id, merged);
}

export async function deleteHotelDraft(id: string): Promise<{ deleted: true }> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts cannot be deleted."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  await prisma().hotelCampaignDraft.delete({ where: { id } });
  const ctx = await ensurePlatformContext();
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "hotel_draft.deleted",
    resourceType: "HOTEL_CAMPAIGN_DRAFT",
    resourceId: id,
  });
  return { deleted: true };
}

export async function getHotelDraftResult(id: string): Promise<{
  draft: HotelDraftView;
  campaignOp: CampaignOpDetailView | null;
}> {
  const draft = await loadDraftOrThrow(id);
  const view = toHotelDraftView(draft);
  if (!draft.campaignOpId) return { draft: view, campaignOp: null };
  try {
    return { draft: view, campaignOp: await getCampaignOpDetail(draft.campaignOpId) };
  } catch {
    return { draft: view, campaignOp: null };
  }
}

export async function validateOrApplyHotelDraft(
  id: string,
  body: unknown,
  mode: "validate" | "apply",
): Promise<{
  draft: HotelDraftView;
  dryRun: boolean;
  applied: boolean;
  status: "PAUSED";
  request: ReturnType<typeof buildHotelDraftMutate>;
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
  const tree = parseHotelDraftTree({
    ...toTree(toHotelDraftView(draft)),
    ...raw,
    customerId: draft.externalAccount.externalId,
    status: raw.status ?? "PAUSED",
  });
  const request = buildHotelDraftMutate(tree, dryRun);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (isKnownNotEnabledCustomer(tree.customerId)) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "campaign_op.blocked",
      resourceType: "HOTEL_CAMPAIGN_DRAFT",
      resourceId: id,
      metadata: { reason: "CUSTOMER_NOT_ENABLED", customerId: tree.customerId },
    });
    throw Object.assign(new Error("Refusing mutate on known CUSTOMER_NOT_ENABLED account 485-651-7690."), {
      status: 400,
      info: { kind: "customer_not_enabled", hint: "Pick an enabled customer under MCC 857-080-5596." },
    });
  }

  const campaignOp = await prisma().campaignOp.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      workspaceId: ctx.workspace.id,
      providerId: provider.id,
      externalAccountId: draft.externalAccountId,
      requestedById: ctx.user.id,
      hotelCampaignDraftId: draft.id,
      kind: "HOTEL_CREATE",
      status: "DRAFT",
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      dryRun: request.validateOnly,
      confirmPhrase: raw.confirmPhrase == null ? null : String(raw.confirmPhrase),
      requestPayload: toJsonText(request),
      googleValidateOnly: request.validateOnly,
    },
  });

  await prisma().hotelCampaignDraft.update({
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
        status: result.success ? (request.validateOnly ? "DRY_RUN_VALIDATED" : "APPLIED_PAUSED") : "FAILED",
        responsePayload: toJsonText(result.response),
        googleCampaignResourceName: result.resourceName ?? null,
        errorMessage: result.errorMessage ?? null,
        appliedAt: result.success && !request.validateOnly ? new Date() : null,
      },
    });

    await prisma().hotelCampaignDraft.update({
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
          summary: `Apply PAUSED Hotel campaign ${tree.name}`,
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
            hotelCampaignDraftId: draft.id,
            advertisingChannelType: "HOTEL",
            hotelCenterId: tree.hotelCenterId,
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
          ? "hotel_draft.validated"
          : "hotel_draft.applied_paused"
        : "hotel_draft.failed",
      resourceType: "HOTEL_CAMPAIGN_DRAFT",
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
        ? "Dry-run: full Hotel tree validated locally. Nothing was sent to Google Ads."
        : "Mock apply: would create a PAUSED Hotel campaign tree. No live mutate executed.",
      mutateOperationResponses: request.validateOnly
        ? []
        : [{ campaignResult: { resourceName: `customers/${tree.customerId}/campaigns/mock-hotel-${draft.id}` } }],
    };
    const names = extractHotelResourceNames(response);
    await persistResult({
      response,
      source: "mock",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getHotelDraft(draft.id),
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
    const names = extractHotelResourceNames(response);
    await persistResult({
      response,
      source: "live",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getHotelDraft(draft.id),
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
