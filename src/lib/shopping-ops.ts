import "server-only";

import type {
  CampaignOp,
  ShoppingAdGroupDraft,
  ShoppingCampaignDraft,
  ShoppingListingDraft,
  ShoppingProductGroupDraft,
  ShoppingTargetDraft,
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
import { mergeShoppingDraftPatch } from "./assistant";
import {
  assertApplyConfirm,
  buildShoppingDraftMutate,
  extractShoppingResourceNames,
  parseShoppingDraftTree,
  parseShoppingDraftWrite,
  type ShoppingDraftTree,
} from "./shopping-draft";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { ShoppingDraftClientView } from "./types";
import type { CampaignOpDetailView } from "./search-ops";
import { getCampaignOpDetail } from "./search-ops";

export type ShoppingDraftRecord = ShoppingCampaignDraft & {
  externalAccount: { externalId: string };
  adGroups: Array<
    ShoppingAdGroupDraft & {
      productGroups: ShoppingProductGroupDraft[];
      listings: ShoppingListingDraft[];
    }
  >;
  targets: ShoppingTargetDraft[];
  campaignOps?: CampaignOp[];
};

export type ShoppingDraftView = ShoppingDraftClientView;

const draftInclude = {
  adGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      productGroups: { orderBy: { sortOrder: "asc" as const } },
      listings: { orderBy: { createdAt: "asc" as const } },
    },
  },
  targets: { orderBy: { createdAt: "asc" as const } },
};

export function toShoppingDraftView(row: ShoppingDraftRecord): ShoppingDraftView {
  return {
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccountId,
    name: row.name,
    dailyBudgetMicros: row.dailyBudgetMicros.toString(),
    biddingStrategy: row.biddingStrategy,
    merchantCenterId: row.merchantCenterId,
    salesCountry: row.salesCountry,
    campaignPriority: row.campaignPriority,
    enableLocal: row.enableLocal,
    targetRoasText: row.targetRoasText,
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
      productGroups: group.productGroups.map((item) => ({
        id: item.id,
        kind: item.kind,
        valueText: item.valueText,
        dimensionText: item.dimensionText,
        included: item.included,
        sortOrder: item.sortOrder,
        googleListingGroupResourceName: item.googleListingGroupResourceName,
      })),
      listings: group.listings.map((item) => ({
        id: item.id,
        kind: item.kind,
        valueText: item.valueText,
        dimensionText: item.dimensionText,
        included: item.included,
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

export function shoppingDraftViewToTree(view: ShoppingDraftView): ShoppingDraftTree {
  return toTree(view);
}

function toTree(view: ShoppingDraftView): ShoppingDraftTree {
  return {
    customerId: view.customerId,
    externalAccountId: view.externalAccountId,
    name: view.name,
    dailyBudgetMicros: Number(view.dailyBudgetMicros),
    biddingStrategy: view.biddingStrategy as ShoppingDraftTree["biddingStrategy"],
    merchantCenterId: view.merchantCenterId,
    salesCountry: view.salesCountry,
    campaignPriority: view.campaignPriority as ShoppingDraftTree["campaignPriority"],
    enableLocal: view.enableLocal,
    targetRoasText: view.targetRoasText,
    startDate: view.startDate,
    endDate: view.endDate,
    notesText: view.notesText,
    adGroups: view.adGroups.map((group) => ({
      name: group.name,
      defaultBidMicros: Number(group.defaultBidMicros),
      sortOrder: group.sortOrder,
      productGroups: group.productGroups.map((item) => ({
        kind: item.kind as ShoppingDraftTree["adGroups"][number]["productGroups"][number]["kind"],
        valueText: item.valueText,
        dimensionText: item.dimensionText,
        included: item.included,
        sortOrder: item.sortOrder,
      })),
      listings: group.listings.map((item) => ({
        kind: item.kind as ShoppingDraftTree["adGroups"][number]["listings"][number]["kind"],
        valueText: item.valueText,
        dimensionText: item.dimensionText,
        included: item.included,
      })),
    })),
    targets: view.targets.map((target) => ({
      type: target.type as ShoppingDraftTree["targets"][number]["type"],
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

async function replaceDraftChildren(draftId: string, tree: ShoppingDraftTree) {
  const db = prisma();
  await db.shoppingTargetDraft.deleteMany({ where: { draftId } });
  await db.shoppingAdGroupDraft.deleteMany({ where: { draftId } });
  for (const [index, group] of tree.adGroups.entries()) {
    await db.shoppingAdGroupDraft.create({
      data: {
        draftId,
        name: group.name,
        defaultBidMicros: BigInt(group.defaultBidMicros),
        sortOrder: group.sortOrder ?? index,
        productGroups: {
          create: group.productGroups.map((item, itemIndex) => ({
            kind: item.kind,
            valueText: item.valueText,
            dimensionText: item.dimensionText,
            included: item.included,
            sortOrder: item.sortOrder ?? itemIndex,
          })),
        },
        listings: {
          create: group.listings.map((item) => ({
            kind: item.kind,
            valueText: item.valueText,
            dimensionText: item.dimensionText,
            included: item.included,
          })),
        },
      },
    });
  }
  if (tree.targets.length) {
    await db.shoppingTargetDraft.createMany({
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

async function loadDraftOrThrow(id: string): Promise<ShoppingDraftRecord> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().shoppingCampaignDraft.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
  });
  if (!row) {
    throw Object.assign(new Error("Shopping campaign draft not found."), {
      status: 404,
      info: { kind: "validation", hint: "Create a draft from /ops first." },
    });
  }
  return row;
}

export async function listShoppingDrafts(): Promise<ShoppingDraftView[]> {
  const ctx = await ensurePlatformContext();
  const rows = await prisma().shoppingCampaignDraft.findMany({
    where: { organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map((row) => toShoppingDraftView(row));
}

export async function getShoppingDraft(id: string): Promise<ShoppingDraftView> {
  return toShoppingDraftView(await loadDraftOrThrow(id));
}

export async function createShoppingDraft(body: unknown): Promise<ShoppingDraftView> {
  const tree = parseShoppingDraftWrite(body);
  const ctx = await ensurePlatformContext();
  const external = await resolveExternalAccount({
    customerId: tree.customerId,
    externalAccountId: tree.externalAccountId,
  });
  const draft = await prisma().shoppingCampaignDraft.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      externalAccountId: external.id,
      createdById: ctx.user.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      merchantCenterId: tree.merchantCenterId ?? null,
      salesCountry: tree.salesCountry,
      campaignPriority: tree.campaignPriority,
      enableLocal: tree.enableLocal,
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
    action: "shopping_draft.created",
    resourceType: "SHOPPING_CAMPAIGN_DRAFT",
    resourceId: draft.id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getShoppingDraft(draft.id);
}

export async function updateShoppingDraft(id: string, body: unknown): Promise<ShoppingDraftView> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts are read-only."), {
      status: 400,
      info: { kind: "validation", hint: "Create a new draft to change an applied Shopping campaign." },
    });
  }
  const tree = parseShoppingDraftWrite(body);
  const external = await resolveExternalAccount({
    customerId: tree.customerId || existing.externalAccount.externalId,
    externalAccountId: tree.externalAccountId ?? existing.externalAccountId,
  });
  await prisma().shoppingCampaignDraft.update({
    where: { id },
    data: {
      externalAccountId: external.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      merchantCenterId: tree.merchantCenterId ?? null,
      salesCountry: tree.salesCountry,
      campaignPriority: tree.campaignPriority,
      enableLocal: tree.enableLocal,
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
    action: "shopping_draft.updated",
    resourceType: "SHOPPING_CAMPAIGN_DRAFT",
    resourceId: id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getShoppingDraft(id);
}

export async function patchShoppingDraft(id: string, patch: unknown): Promise<ShoppingDraftView> {
  const existing = await getShoppingDraft(id);
  const merged = mergeShoppingDraftPatch(toTree(existing), patch);
  return updateShoppingDraft(id, merged);
}

export async function deleteShoppingDraft(id: string): Promise<{ deleted: true }> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts cannot be deleted."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  await prisma().shoppingCampaignDraft.delete({ where: { id } });
  const ctx = await ensurePlatformContext();
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "shopping_draft.deleted",
    resourceType: "SHOPPING_CAMPAIGN_DRAFT",
    resourceId: id,
  });
  return { deleted: true };
}

export async function getShoppingDraftResult(id: string): Promise<{
  draft: ShoppingDraftView;
  campaignOp: CampaignOpDetailView | null;
}> {
  const draft = await loadDraftOrThrow(id);
  const view = toShoppingDraftView(draft);
  if (!draft.campaignOpId) return { draft: view, campaignOp: null };
  try {
    return { draft: view, campaignOp: await getCampaignOpDetail(draft.campaignOpId) };
  } catch {
    return { draft: view, campaignOp: null };
  }
}

export async function validateOrApplyShoppingDraft(
  id: string,
  body: unknown,
  mode: "validate" | "apply",
): Promise<{
  draft: ShoppingDraftView;
  dryRun: boolean;
  applied: boolean;
  status: "PAUSED";
  request: ReturnType<typeof buildShoppingDraftMutate>;
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
  const tree = parseShoppingDraftTree({
    ...toTree(toShoppingDraftView(draft)),
    ...raw,
    customerId: draft.externalAccount.externalId,
    status: raw.status ?? "PAUSED",
  });
  const request = buildShoppingDraftMutate(tree, dryRun);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (isKnownNotEnabledCustomer(tree.customerId)) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "campaign_op.blocked",
      resourceType: "SHOPPING_CAMPAIGN_DRAFT",
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
      shoppingCampaignDraftId: draft.id,
      kind: "SHOPPING_CREATE",
      status: "DRAFT",
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      dryRun: request.validateOnly,
      confirmPhrase: raw.confirmPhrase == null ? null : String(raw.confirmPhrase),
      requestPayload: toJsonText(request),
      googleValidateOnly: request.validateOnly,
    },
  });

  await prisma().shoppingCampaignDraft.update({
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

    await prisma().shoppingCampaignDraft.update({
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
          summary: `Apply PAUSED Shopping campaign ${tree.name}`,
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
            shoppingCampaignDraftId: draft.id,
            advertisingChannelType: "SHOPPING",
            merchantCenterId: tree.merchantCenterId,
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
          ? "shopping_draft.validated"
          : "shopping_draft.applied_paused"
        : "shopping_draft.failed",
      resourceType: "SHOPPING_CAMPAIGN_DRAFT",
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
        ? "Dry-run: full Shopping tree validated locally. Nothing was sent to Google Ads."
        : "Mock apply: would create a PAUSED Shopping campaign tree. No live mutate executed.",
      mutateOperationResponses: request.validateOnly
        ? []
        : [
            { campaignResult: { resourceName: `customers/${tree.customerId}/campaigns/mock-shopping-${draft.id}` } },
          ],
    };
    const names = extractShoppingResourceNames(response);
    await persistResult({
      response,
      source: "mock",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getShoppingDraft(draft.id),
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
    const names = extractShoppingResourceNames(response);
    await persistResult({
      response,
      source: "live",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getShoppingDraft(draft.id),
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
