import "server-only";

import type {
  CampaignEditBidDraft,
  CampaignEditDraft,
  CampaignEditFieldDraft,
  CampaignEditTargetDraft,
  CampaignOp,
  DryRunJob,
} from "@prisma/client";

import { upsertExternalAccount } from "./accounts";
import { writeAudit } from "./audit";
import {
  assertEditApplyConfirm,
  buildCampaignEditMutate,
  campaignResourceName,
  deriveEditFieldKinds,
  parseCampaignEditTree,
  refuseEnableOnEdit,
  type CampaignEditTree,
} from "./campaign-edit";
import { loadActiveConnection } from "./connections";
import { getEnv } from "./env";
import { mutateGoogleAds } from "./google-ads";
import { toJsonText } from "./http";
import { digitsOnly, isKnownNotEnabledCustomer } from "./ids";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG } from "./providers";
import { resolveDryRun } from "./safety";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { CampaignEditDraftView } from "./types";

export type CampaignEditRecord = CampaignEditDraft & {
  externalAccount: { externalId: string };
  fields: CampaignEditFieldDraft[];
  bids: CampaignEditBidDraft[];
  targets: CampaignEditTargetDraft[];
};

export type CampaignOpDetailView = {
  id: string;
  kind: string;
  status: string;
  name: string;
  dryRun: boolean;
  googleValidateOnly: boolean;
  googleCampaignResourceName: string | null;
  campaignEditDraftId: string | null;
  requestPayload: string;
  responsePayload: string | null;
  errorMessage: string | null;
  appliedAt: string | null;
  createdAt: string;
  dryRunJobs: Array<{
    id: string;
    validateOnly: boolean;
    success: boolean;
    requestBody: string;
    responseBody: string | null;
    createdAt: string;
  }>;
};

const draftInclude = {
  fields: { orderBy: { kind: "asc" as const } },
  bids: { orderBy: { createdAt: "asc" as const } },
  targets: { orderBy: { createdAt: "asc" as const } },
  externalAccount: true,
};

function microsToString(value: bigint | null | undefined): string | null {
  if (value == null) return null;
  return value.toString();
}

export function toCampaignEditView(row: CampaignEditRecord): CampaignEditDraftView {
  return {
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccountId,
    syncedCampaignId: row.syncedCampaignId,
    campaignExternalId: row.campaignExternalId,
    googleCampaignResourceName: row.googleCampaignResourceName,
    budgetResourceName: row.budgetResourceName,
    advertisingChannelType: row.advertisingChannelType,
    currentName: row.currentName,
    proposedName: row.proposedName,
    currentDailyBudgetMicros: microsToString(row.currentDailyBudgetMicros),
    proposedDailyBudgetMicros: microsToString(row.proposedDailyBudgetMicros),
    notesText: row.notesText,
    statusDraft: row.statusDraft,
    campaignOpId: row.campaignOpId,
    fieldKinds: row.fields.map((field) => field.kind),
    bids: row.bids.map((bid) => ({
      id: bid.id,
      adGroupExternalId: bid.adGroupExternalId,
      googleAdGroupResourceName: bid.googleAdGroupResourceName,
      adGroupName: bid.adGroupName,
      currentBidMicros: microsToString(bid.currentBidMicros),
      proposedBidMicros: bid.proposedBidMicros.toString(),
    })),
    targets: row.targets.map((target) => ({
      id: target.id,
      type: target.type,
      valueText: target.valueText,
      criterionText: target.criterionText,
      included: target.included,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function campaignEditViewToTree(view: CampaignEditDraftView): CampaignEditTree {
  return {
    customerId: view.customerId,
    syncedCampaignId: view.syncedCampaignId,
    campaignExternalId: view.campaignExternalId,
    googleCampaignResourceName: view.googleCampaignResourceName,
    budgetResourceName: view.budgetResourceName,
    advertisingChannelType: view.advertisingChannelType,
    currentName: view.currentName,
    proposedName: view.proposedName,
    currentDailyBudgetMicros:
      view.currentDailyBudgetMicros == null ? null : Number(view.currentDailyBudgetMicros),
    proposedDailyBudgetMicros:
      view.proposedDailyBudgetMicros == null ? null : Number(view.proposedDailyBudgetMicros),
    notesText: view.notesText,
    bids: view.bids.map((bid) => ({
      adGroupExternalId: bid.adGroupExternalId,
      googleAdGroupResourceName: bid.googleAdGroupResourceName,
      adGroupName: bid.adGroupName,
      currentBidMicros: bid.currentBidMicros == null ? null : Number(bid.currentBidMicros),
      proposedBidMicros: Number(bid.proposedBidMicros),
    })),
    targets: view.targets.map((target) => ({
      type: target.type as CampaignEditTree["targets"][number]["type"],
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

async function loadDraftOrThrow(id: string): Promise<CampaignEditRecord> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().campaignEditDraft.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: draftInclude,
  });
  if (!row) {
    throw Object.assign(new Error("Campaign edit draft not found."), {
      status: 404,
      info: { kind: "validation", hint: "Create an edit draft from /ops first." },
    });
  }
  return row;
}

async function replaceEditChildren(draftId: string, tree: CampaignEditTree) {
  const db = prisma();
  await db.campaignEditFieldDraft.deleteMany({ where: { draftId } });
  await db.campaignEditBidDraft.deleteMany({ where: { draftId } });
  await db.campaignEditTargetDraft.deleteMany({ where: { draftId } });
  const kinds = deriveEditFieldKinds(tree);
  if (kinds.length) {
    await db.campaignEditFieldDraft.createMany({
      data: kinds.map((kind) => ({ draftId, kind })),
    });
  }
  if (tree.bids.length) {
    await db.campaignEditBidDraft.createMany({
      data: tree.bids.map((bid) => ({
        draftId,
        adGroupExternalId: bid.adGroupExternalId,
        googleAdGroupResourceName: bid.googleAdGroupResourceName ?? null,
        adGroupName: bid.adGroupName ?? null,
        currentBidMicros: bid.currentBidMicros == null ? null : BigInt(bid.currentBidMicros),
        proposedBidMicros: BigInt(bid.proposedBidMicros),
      })),
    });
  }
  if (tree.targets.length) {
    await db.campaignEditTargetDraft.createMany({
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

async function resolveSyncedContext(raw: Record<string, unknown>, externalAccountId: string) {
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  const syncedCampaignId = raw.syncedCampaignId ? String(raw.syncedCampaignId) : "";
  const campaignExternalId = String(raw.campaignExternalId ?? "").trim();
  const synced = await prisma().syncedCampaign.findFirst({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      externalAccountId,
      ...(syncedCampaignId ? { id: syncedCampaignId } : {}),
      ...(campaignExternalId && !syncedCampaignId ? { externalId: campaignExternalId } : {}),
    },
    include: {
      adGroups: { orderBy: { name: "asc" } },
      metricSnapshots: { orderBy: { lastSyncedAt: "desc" }, take: 1 },
    },
  });
  const snapshot = synced?.metricSnapshots[0];
  const customerId = digitsOnly(String(raw.customerId ?? ""));
  return {
    synced,
    snapshot,
    campaignExternalId: synced?.externalId || campaignExternalId,
    currentName: String(raw.currentName ?? synced?.name ?? "").trim(),
    googleCampaignResourceName:
      String(raw.googleCampaignResourceName ?? synced?.resourceName ?? "") ||
      (customerId && (synced?.externalId || campaignExternalId)
        ? campaignResourceName(customerId, synced?.externalId || campaignExternalId)
        : null),
    budgetResourceName: String(raw.budgetResourceName ?? snapshot?.budgetResourceName ?? "") || null,
    advertisingChannelType:
      String(raw.advertisingChannelType ?? synced?.advertisingChannelType ?? "") || null,
    currentDailyBudgetMicros:
      raw.currentDailyBudgetMicros != null
        ? raw.currentDailyBudgetMicros
        : snapshot?.budgetAmountMicros != null
          ? snapshot.budgetAmountMicros.toString()
          : null,
  };
}

export async function listCampaignEditDrafts(customerId?: string): Promise<CampaignEditDraftView[]> {
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  const digits = customerId ? digitsOnly(customerId) : "";
  const external = digits
    ? await prisma().externalAccount.findFirst({
        where: { organizationId: ctx.org.id, providerId: provider.id, externalId: digits },
      })
    : null;
  const rows = await prisma().campaignEditDraft.findMany({
    where: {
      organizationId: ctx.org.id,
      ...(external ? { externalAccountId: external.id } : {}),
    },
    include: draftInclude,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toCampaignEditView);
}

export async function getCampaignEditDraft(id: string): Promise<CampaignEditDraftView> {
  return toCampaignEditView(await loadDraftOrThrow(id));
}

export async function createCampaignEditDraft(body: unknown): Promise<CampaignEditDraftView> {
  const raw = (body ?? {}) as Record<string, unknown>;
  refuseEnableOnEdit(raw);
  const ctx = await ensurePlatformContext();
  const customerId = digitsOnly(String(raw.customerId ?? raw.externalId ?? ""));
  const external = await resolveExternalAccount({
    customerId,
    externalAccountId: raw.externalAccountId ? String(raw.externalAccountId) : undefined,
  });
  const resolved = await resolveSyncedContext({ ...raw, customerId: customerId || external.externalId }, external.id);
  const tree = parseCampaignEditTree({
    ...raw,
    customerId: customerId || external.externalId,
    campaignExternalId: resolved.campaignExternalId,
    currentName: resolved.currentName,
    googleCampaignResourceName: raw.googleCampaignResourceName ?? resolved.googleCampaignResourceName,
    budgetResourceName: raw.budgetResourceName ?? resolved.budgetResourceName,
    advertisingChannelType: raw.advertisingChannelType ?? resolved.advertisingChannelType,
    currentDailyBudgetMicros: raw.currentDailyBudgetMicros ?? resolved.currentDailyBudgetMicros,
    syncedCampaignId: raw.syncedCampaignId ?? resolved.synced?.id,
  });

  const draft = await prisma().campaignEditDraft.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      externalAccountId: external.id,
      createdById: ctx.user.id,
      syncedCampaignId: tree.syncedCampaignId,
      campaignExternalId: tree.campaignExternalId,
      googleCampaignResourceName: tree.googleCampaignResourceName,
      budgetResourceName: tree.budgetResourceName,
      advertisingChannelType: tree.advertisingChannelType,
      currentName: tree.currentName,
      proposedName: tree.proposedName,
      currentDailyBudgetMicros:
        tree.currentDailyBudgetMicros == null ? null : BigInt(tree.currentDailyBudgetMicros),
      proposedDailyBudgetMicros:
        tree.proposedDailyBudgetMicros == null ? null : BigInt(tree.proposedDailyBudgetMicros),
      notesText: tree.notesText,
      statusDraft: "DRAFT",
    },
  });
  await replaceEditChildren(draft.id, tree);
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "campaign_edit.created",
    resourceType: "CAMPAIGN_EDIT_DRAFT",
    resourceId: draft.id,
    metadata: { customerId: tree.customerId, campaignExternalId: tree.campaignExternalId },
  });
  return getCampaignEditDraft(draft.id);
}

export async function updateCampaignEditDraft(
  id: string,
  body: unknown,
): Promise<CampaignEditDraftView> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied edit drafts cannot be updated."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  refuseEnableOnEdit(raw);
  const current = campaignEditViewToTree(toCampaignEditView(existing));
  const tree = parseCampaignEditTree({
    ...current,
    ...raw,
    customerId: existing.externalAccount.externalId,
    campaignExternalId: raw.campaignExternalId ?? current.campaignExternalId,
    currentName: raw.currentName ?? current.currentName,
  });
  await prisma().campaignEditDraft.update({
    where: { id },
    data: {
      syncedCampaignId: tree.syncedCampaignId,
      campaignExternalId: tree.campaignExternalId,
      googleCampaignResourceName: tree.googleCampaignResourceName,
      budgetResourceName: tree.budgetResourceName,
      advertisingChannelType: tree.advertisingChannelType,
      currentName: tree.currentName,
      proposedName: tree.proposedName,
      currentDailyBudgetMicros:
        tree.currentDailyBudgetMicros == null ? null : BigInt(tree.currentDailyBudgetMicros),
      proposedDailyBudgetMicros:
        tree.proposedDailyBudgetMicros == null ? null : BigInt(tree.proposedDailyBudgetMicros),
      notesText: tree.notesText,
      statusDraft: "DRAFT",
    },
  });
  await replaceEditChildren(id, tree);
  return getCampaignEditDraft(id);
}

export async function deleteCampaignEditDraft(id: string): Promise<{ deleted: true }> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied edit drafts cannot be deleted."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  await prisma().campaignEditDraft.delete({ where: { id } });
  const ctx = await ensurePlatformContext();
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "campaign_edit.deleted",
    resourceType: "CAMPAIGN_EDIT_DRAFT",
    resourceId: id,
  });
  return { deleted: true };
}

function toOpDetail(row: CampaignOp & { dryRunJobs: DryRunJob[] }): CampaignOpDetailView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    name: row.name,
    dryRun: row.dryRun,
    googleValidateOnly: row.googleValidateOnly,
    googleCampaignResourceName: row.googleCampaignResourceName,
    campaignEditDraftId: row.campaignEditDraftId,
    requestPayload: row.requestPayload,
    responsePayload: row.responsePayload,
    errorMessage: row.errorMessage,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    dryRunJobs: row.dryRunJobs.map((job) => ({
      id: job.id,
      validateOnly: job.validateOnly,
      success: job.success,
      requestBody: job.requestBody,
      responseBody: job.responseBody,
      createdAt: job.createdAt.toISOString(),
    })),
  };
}

export async function getCampaignEditResult(id: string): Promise<{
  draft: CampaignEditDraftView;
  campaignOp: CampaignOpDetailView | null;
}> {
  const draft = await loadDraftOrThrow(id);
  const view = toCampaignEditView(draft);
  if (!draft.campaignOpId) return { draft: view, campaignOp: null };
  const ctx = await ensurePlatformContext();
  const row = await prisma().campaignOp.findFirst({
    where: { id: draft.campaignOpId, organizationId: ctx.org.id },
    include: { dryRunJobs: { orderBy: { createdAt: "desc" } } },
  });
  return { draft: view, campaignOp: row ? toOpDetail(row) : null };
}

export async function validateOrApplyCampaignEdit(
  id: string,
  body: unknown,
  mode: "validate" | "apply",
): Promise<{
  draft: CampaignEditDraftView;
  dryRun: boolean;
  applied: boolean;
  enablePath: false;
  request: ReturnType<typeof buildCampaignEditMutate>;
  response: unknown;
  source: "live" | "mock";
  campaignOpId: string;
}> {
  const raw = (body ?? {}) as Record<string, unknown>;
  refuseEnableOnEdit(raw);
  const dryRun = mode === "validate" ? true : resolveDryRun(raw.dryRun);
  if (mode === "apply") {
    assertEditApplyConfirm(dryRun, raw.confirmPhrase);
  }
  const draft = await loadDraftOrThrow(id);
  const tree = parseCampaignEditTree({
    ...campaignEditViewToTree(toCampaignEditView(draft)),
    ...raw,
    customerId: draft.externalAccount.externalId,
    campaignExternalId: draft.campaignExternalId,
    currentName: draft.currentName,
  });
  const request = buildCampaignEditMutate(tree, dryRun);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (isKnownNotEnabledCustomer(tree.customerId)) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "campaign_op.blocked",
      resourceType: "CAMPAIGN_EDIT_DRAFT",
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
      campaignEditDraftId: draft.id,
      kind: "CAMPAIGN_EDIT",
      status: "DRAFT",
      name: tree.proposedName || tree.currentName,
      dailyBudgetMicros:
        tree.proposedDailyBudgetMicros == null ? null : BigInt(tree.proposedDailyBudgetMicros),
      dryRun: request.validateOnly,
      confirmPhrase: raw.confirmPhrase == null ? null : String(raw.confirmPhrase),
      requestPayload: toJsonText(request),
      googleValidateOnly: request.validateOnly,
    },
  });

  await prisma().campaignEditDraft.update({
    where: { id: draft.id },
    data: { campaignOpId: campaignOp.id },
  });

  async function persistResult(result: {
    response: unknown;
    source: "live" | "mock";
    success: boolean;
    errorMessage?: string;
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
        googleCampaignResourceName: tree.googleCampaignResourceName ?? null,
        errorMessage: result.errorMessage ?? null,
        appliedAt: result.success && !request.validateOnly ? new Date() : null,
      },
    });

    await prisma().campaignEditDraft.update({
      where: { id: draft.id },
      data: {
        statusDraft: result.success ? (request.validateOnly ? "VALIDATED" : "APPLIED") : "FAILED",
        campaignOpId: campaignOp.id,
        currentName: result.success && !request.validateOnly && tree.proposedName
          ? tree.proposedName
          : undefined,
        currentDailyBudgetMicros:
          result.success && !request.validateOnly && tree.proposedDailyBudgetMicros != null
            ? BigInt(tree.proposedDailyBudgetMicros)
            : undefined,
      },
    });

    if (result.success && !request.validateOnly) {
      await prisma().changeRequest.create({
        data: {
          organizationId: ctx.org.id,
          providerId: provider.id,
          campaignOpId: campaignOp.id,
          requestedById: ctx.user.id,
          summary: `Safe edit ${tree.currentName}`,
          approved: true,
          reviewedAt: new Date(),
        },
      });
      if (draft.syncedCampaignId && tree.proposedName && tree.proposedName !== tree.currentName) {
        await prisma().syncedCampaign.update({
          where: { id: draft.syncedCampaignId },
          data: { name: tree.proposedName },
        });
      }
    }

    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: result.success
        ? request.validateOnly
          ? "campaign_edit.validated"
          : "campaign_edit.applied"
        : "campaign_edit.failed",
      resourceType: "CAMPAIGN_EDIT_DRAFT",
      resourceId: draft.id,
      metadata: {
        customerId: tree.customerId,
        dryRun: request.validateOnly,
        source: result.source,
        campaignOpId: campaignOp.id,
        enablePath: false,
      },
    });
  }

  if (env.mockMode) {
    const response = {
      validateOnly: request.validateOnly,
      mock: true,
      enablePath: false,
      note: request.validateOnly
        ? "Dry-run: safe edit payload validated locally. Nothing was sent to Google Ads."
        : "Mock apply: would update name/budget/bids/targeting only. No enable and no live mutate.",
    };
    await persistResult({ response, source: "mock", success: true });
    return {
      draft: await getCampaignEditDraft(draft.id),
      dryRun: request.validateOnly,
      applied: !request.validateOnly,
      enablePath: false,
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
    await persistResult({ response, source: "live", success: true });
    return {
      draft: await getCampaignEditDraft(draft.id),
      dryRun: request.validateOnly,
      applied: !request.validateOnly,
      enablePath: false,
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
