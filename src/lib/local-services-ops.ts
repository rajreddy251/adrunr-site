import "server-only";

import type {
  CampaignOp,
  LocalServicesCampaignDraft,
  LocalServicesCategoryDraft,
  LocalServicesTargetDraft,
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
import { mergeLocalServicesDraftPatch } from "./assistant";
import {
  assertApplyConfirm,
  buildLocalServicesDraftMutate,
  extractLocalServicesResourceNames,
  parseLocalServicesDraftTree,
  parseLocalServicesDraftWrite,
  type LocalServicesDraftTree,
} from "./local-services-draft";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { LocalServicesDraftClientView } from "./types";
import type { CampaignOpDetailView } from "./search-ops";
import { getCampaignOpDetail } from "./search-ops";

export type LocalServicesDraftRecord = LocalServicesCampaignDraft & {
  externalAccount: { externalId: string };
  categories: LocalServicesCategoryDraft[];
  targets: LocalServicesTargetDraft[];
  campaignOps?: CampaignOp[];
};

export type LocalServicesDraftView = LocalServicesDraftClientView;

const draftInclude = {
  categories: { orderBy: { sortOrder: "asc" as const } },
  targets: { orderBy: { createdAt: "asc" as const } },
};

function microsToString(value: bigint | null | undefined): string | null {
  if (value == null) return null;
  return value.toString();
}

export function toLocalServicesDraftView(row: LocalServicesDraftRecord): LocalServicesDraftView {
  return {
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccountId,
    name: row.name,
    dailyBudgetMicros: row.dailyBudgetMicros.toString(),
    biddingStrategy: row.biddingStrategy,
    maxLeadBidMicros: microsToString(row.maxLeadBidMicros),
    businessName: row.businessName,
    licenseText: row.licenseText,
    insuranceText: row.insuranceText,
    googleGuaranteed: row.googleGuaranteed,
    startDate: row.startDate,
    endDate: row.endDate,
    statusDraft: row.statusDraft,
    googleCampaignResourceName: row.googleCampaignResourceName,
    campaignOpId: row.campaignOpId,
    notesText: row.notesText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    categories: row.categories.map((item) => ({
      id: item.id,
      kind: item.kind,
      categoryId: item.categoryId,
      valueText: item.valueText,
      included: item.included,
      sortOrder: item.sortOrder,
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

export function localServicesDraftViewToTree(view: LocalServicesDraftView): LocalServicesDraftTree {
  return toTree(view);
}

function toTree(view: LocalServicesDraftView): LocalServicesDraftTree {
  return {
    customerId: view.customerId,
    externalAccountId: view.externalAccountId,
    name: view.name,
    dailyBudgetMicros: Number(view.dailyBudgetMicros),
    biddingStrategy: view.biddingStrategy as LocalServicesDraftTree["biddingStrategy"],
    maxLeadBidMicros: view.maxLeadBidMicros == null ? null : Number(view.maxLeadBidMicros),
    businessName: view.businessName,
    licenseText: view.licenseText,
    insuranceText: view.insuranceText,
    googleGuaranteed: view.googleGuaranteed,
    startDate: view.startDate,
    endDate: view.endDate,
    notesText: view.notesText,
    categories: view.categories.map((item) => ({
      kind: item.kind as LocalServicesDraftTree["categories"][number]["kind"],
      categoryId: item.categoryId,
      valueText: item.valueText,
      included: item.included,
      sortOrder: item.sortOrder,
    })),
    targets: view.targets.map((target) => ({
      type: target.type as LocalServicesDraftTree["targets"][number]["type"],
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

async function replaceDraftChildren(draftId: string, tree: LocalServicesDraftTree) {
  const db = prisma();
  await db.localServicesTargetDraft.deleteMany({ where: { draftId } });
  await db.localServicesCategoryDraft.deleteMany({ where: { draftId } });
  if (tree.categories.length) {
    await db.localServicesCategoryDraft.createMany({
      data: tree.categories.map((item, index) => ({
        draftId,
        kind: item.kind,
        categoryId: item.categoryId,
        valueText: item.valueText,
        included: item.included,
        sortOrder: item.sortOrder ?? index,
      })),
    });
  }
  if (tree.targets.length) {
    await db.localServicesTargetDraft.createMany({
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

async function loadDraftOrThrow(id: string): Promise<LocalServicesDraftRecord> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().localServicesCampaignDraft.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
  });
  if (!row) {
    throw Object.assign(new Error("Local Services campaign draft not found."), {
      status: 404,
      info: { kind: "validation", hint: "Create a draft from /ops first." },
    });
  }
  return row;
}

export async function listLocalServicesDrafts(): Promise<LocalServicesDraftView[]> {
  const ctx = await ensurePlatformContext();
  const rows = await prisma().localServicesCampaignDraft.findMany({
    where: { organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map((row) => toLocalServicesDraftView(row));
}

export async function getLocalServicesDraft(id: string): Promise<LocalServicesDraftView> {
  return toLocalServicesDraftView(await loadDraftOrThrow(id));
}

export async function createLocalServicesDraft(body: unknown): Promise<LocalServicesDraftView> {
  const tree = parseLocalServicesDraftWrite(body);
  const ctx = await ensurePlatformContext();
  const external = await resolveExternalAccount({
    customerId: tree.customerId,
    externalAccountId: tree.externalAccountId,
  });
  const draft = await prisma().localServicesCampaignDraft.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      externalAccountId: external.id,
      createdById: ctx.user.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      maxLeadBidMicros: tree.maxLeadBidMicros == null ? null : BigInt(tree.maxLeadBidMicros),
      businessName: tree.businessName ?? null,
      licenseText: tree.licenseText ?? null,
      insuranceText: tree.insuranceText ?? null,
      googleGuaranteed: tree.googleGuaranteed,
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
    action: "local_services_draft.created",
    resourceType: "LOCAL_SERVICES_CAMPAIGN_DRAFT",
    resourceId: draft.id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getLocalServicesDraft(draft.id);
}

export async function updateLocalServicesDraft(id: string, body: unknown): Promise<LocalServicesDraftView> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts are read-only."), {
      status: 400,
      info: { kind: "validation", hint: "Create a new draft to change an applied Local Services campaign." },
    });
  }
  const tree = parseLocalServicesDraftWrite(body);
  const external = await resolveExternalAccount({
    customerId: tree.customerId || existing.externalAccount.externalId,
    externalAccountId: tree.externalAccountId ?? existing.externalAccountId,
  });
  await prisma().localServicesCampaignDraft.update({
    where: { id },
    data: {
      externalAccountId: external.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      maxLeadBidMicros: tree.maxLeadBidMicros == null ? null : BigInt(tree.maxLeadBidMicros),
      businessName: tree.businessName ?? null,
      licenseText: tree.licenseText ?? null,
      insuranceText: tree.insuranceText ?? null,
      googleGuaranteed: tree.googleGuaranteed,
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
    action: "local_services_draft.updated",
    resourceType: "LOCAL_SERVICES_CAMPAIGN_DRAFT",
    resourceId: id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getLocalServicesDraft(id);
}

export async function patchLocalServicesDraft(id: string, patch: unknown): Promise<LocalServicesDraftView> {
  const existing = await getLocalServicesDraft(id);
  const merged = mergeLocalServicesDraftPatch(toTree(existing), patch);
  return updateLocalServicesDraft(id, merged);
}

export async function deleteLocalServicesDraft(id: string): Promise<{ deleted: true }> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts cannot be deleted."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  await prisma().localServicesCampaignDraft.delete({ where: { id } });
  const ctx = await ensurePlatformContext();
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "local_services_draft.deleted",
    resourceType: "LOCAL_SERVICES_CAMPAIGN_DRAFT",
    resourceId: id,
  });
  return { deleted: true };
}

export async function getLocalServicesDraftResult(id: string): Promise<{
  draft: LocalServicesDraftView;
  campaignOp: CampaignOpDetailView | null;
}> {
  const draft = await loadDraftOrThrow(id);
  const view = toLocalServicesDraftView(draft);
  if (!draft.campaignOpId) return { draft: view, campaignOp: null };
  try {
    return { draft: view, campaignOp: await getCampaignOpDetail(draft.campaignOpId) };
  } catch {
    return { draft: view, campaignOp: null };
  }
}

export async function validateOrApplyLocalServicesDraft(
  id: string,
  body: unknown,
  mode: "validate" | "apply",
): Promise<{
  draft: LocalServicesDraftView;
  dryRun: boolean;
  applied: boolean;
  status: "PAUSED";
  request: ReturnType<typeof buildLocalServicesDraftMutate>;
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
  const tree = parseLocalServicesDraftTree({
    ...toTree(toLocalServicesDraftView(draft)),
    ...raw,
    customerId: draft.externalAccount.externalId,
    status: raw.status ?? "PAUSED",
  });
  const request = buildLocalServicesDraftMutate(tree, dryRun);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (isKnownNotEnabledCustomer(tree.customerId)) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "campaign_op.blocked",
      resourceType: "LOCAL_SERVICES_CAMPAIGN_DRAFT",
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
      localServicesCampaignDraftId: draft.id,
      kind: "LOCAL_SERVICES_CREATE",
      status: "DRAFT",
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      dryRun: request.validateOnly,
      confirmPhrase: raw.confirmPhrase == null ? null : String(raw.confirmPhrase),
      requestPayload: toJsonText(request),
      googleValidateOnly: request.validateOnly,
    },
  });

  await prisma().localServicesCampaignDraft.update({
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

    await prisma().localServicesCampaignDraft.update({
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
          summary: `Apply PAUSED Local Services campaign ${tree.name}`,
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
            localServicesCampaignDraftId: draft.id,
            advertisingChannelType: "LOCAL_SERVICES",
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
          ? "local_services_draft.validated"
          : "local_services_draft.applied_paused"
        : "local_services_draft.failed",
      resourceType: "LOCAL_SERVICES_CAMPAIGN_DRAFT",
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
        ? "Dry-run: full Local Services tree validated locally. Nothing was sent to Google Ads."
        : "Mock apply: would create a PAUSED Local Services campaign tree. No live mutate executed.",
      mutateOperationResponses: request.validateOnly
        ? []
        : [{ campaignResult: { resourceName: `customers/${tree.customerId}/campaigns/mock-lsa-${draft.id}` } }],
    };
    const names = extractLocalServicesResourceNames(response);
    await persistResult({
      response,
      source: "mock",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getLocalServicesDraft(draft.id),
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
    const names = extractLocalServicesResourceNames(response);
    await persistResult({
      response,
      source: "live",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getLocalServicesDraft(draft.id),
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
