import "server-only";

import type {
  CampaignOp,
  DryRunJob,
  SearchAdDraft,
  SearchAdGroupDraft,
  SearchCampaignDraft,
  SearchKeywordDraft,
  SearchTargetDraft,
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
import { mergeDraftPatch } from "./assistant";
import {
  assertApplyConfirm,
  buildSearchDraftMutate,
  encodeTextList,
  extractResourceNames,
  parseSearchDraftTree,
  parseSearchDraftWrite,
  type SearchDraftTree,
} from "./search-draft";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { SearchDraftClientView } from "./types";

export type SearchDraftRecord = SearchCampaignDraft & {
  externalAccount: { externalId: string };
  adGroups: Array<
    SearchAdGroupDraft & {
      keywords: SearchKeywordDraft[];
      ads: SearchAdDraft[];
    }
  >;
  targets: SearchTargetDraft[];
  campaignOps?: CampaignOp[];
};

export type SearchDraftView = SearchDraftClientView;

export type CampaignOpDetailView = {
  id: string;
  kind: string;
  status: string;
  name: string;
  dryRun: boolean;
  googleValidateOnly: boolean;
  googleCampaignResourceName: string | null;
  searchCampaignDraftId: string | null;
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
  adGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      keywords: { orderBy: { createdAt: "asc" as const } },
      ads: { orderBy: { createdAt: "asc" as const } },
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

export function toSearchDraftView(row: SearchDraftRecord): SearchDraftView {
  return {
    id: row.id,
    customerId: row.externalAccount.externalId,
    externalAccountId: row.externalAccountId,
    name: row.name,
    dailyBudgetMicros: row.dailyBudgetMicros.toString(),
    biddingStrategy: row.biddingStrategy,
    enhancedCpcEnabled: row.enhancedCpcEnabled,
    targetCpaMicros: microsToString(row.targetCpaMicros),
    targetRoasText: row.targetRoasText,
    targetGoogleSearch: row.targetGoogleSearch,
    targetSearchNetwork: row.targetSearchNetwork,
    targetContentNetwork: row.targetContentNetwork,
    targetPartnerSearchNetwork: row.targetPartnerSearchNetwork,
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
      keywords: group.keywords.map((keyword) => ({
        id: keyword.id,
        text: keyword.text,
        matchType: keyword.matchType,
        bidMicros: microsToString(keyword.bidMicros),
        isNegative: keyword.isNegative,
        googleCriterionResourceName: keyword.googleCriterionResourceName,
      })),
      ads: group.ads.map((ad) => ({
        id: ad.id,
        headlines: decodeList(ad.headlinesText),
        descriptions: decodeList(ad.descriptionsText),
        finalUrl: ad.finalUrl,
        path1: ad.path1,
        path2: ad.path2,
        googleAdResourceName: ad.googleAdResourceName,
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

export function searchDraftViewToTree(view: SearchDraftView): SearchDraftTree {
  return toTree(view);
}

function toTree(view: SearchDraftView): SearchDraftTree {
  return {
    customerId: view.customerId,
    externalAccountId: view.externalAccountId,
    name: view.name,
    dailyBudgetMicros: Number(view.dailyBudgetMicros),
    biddingStrategy: view.biddingStrategy as SearchDraftTree["biddingStrategy"],
    enhancedCpcEnabled: view.enhancedCpcEnabled,
    targetCpaMicros: view.targetCpaMicros == null ? null : Number(view.targetCpaMicros),
    targetRoasText: view.targetRoasText,
    targetGoogleSearch: view.targetGoogleSearch,
    targetSearchNetwork: view.targetSearchNetwork,
    targetContentNetwork: view.targetContentNetwork,
    targetPartnerSearchNetwork: view.targetPartnerSearchNetwork,
    startDate: view.startDate,
    endDate: view.endDate,
    notesText: view.notesText,
    adGroups: view.adGroups.map((group) => ({
      name: group.name,
      defaultBidMicros: Number(group.defaultBidMicros),
      sortOrder: group.sortOrder,
      keywords: group.keywords.map((keyword) => ({
        text: keyword.text,
        matchType: keyword.matchType as SearchDraftTree["adGroups"][number]["keywords"][number]["matchType"],
        bidMicros: keyword.bidMicros == null ? null : Number(keyword.bidMicros),
        isNegative: keyword.isNegative,
      })),
      ads: group.ads.map((ad) => ({
        headlines: ad.headlines,
        descriptions: ad.descriptions,
        finalUrl: ad.finalUrl,
        path1: ad.path1,
        path2: ad.path2,
      })),
    })),
    targets: view.targets.map((target) => ({
      type: target.type as SearchDraftTree["targets"][number]["type"],
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

async function replaceDraftChildren(draftId: string, tree: SearchDraftTree) {
  const db = prisma();
  await db.searchTargetDraft.deleteMany({ where: { draftId } });
  await db.searchAdGroupDraft.deleteMany({ where: { draftId } });
  for (const [index, group] of tree.adGroups.entries()) {
    await db.searchAdGroupDraft.create({
      data: {
        draftId,
        name: group.name,
        defaultBidMicros: BigInt(group.defaultBidMicros),
        sortOrder: group.sortOrder ?? index,
        keywords: {
          create: group.keywords.map((keyword) => ({
            text: keyword.text,
            matchType: keyword.matchType,
            bidMicros: keyword.bidMicros == null ? null : BigInt(keyword.bidMicros),
            isNegative: keyword.isNegative,
          })),
        },
        ads: {
          create: group.ads.map((ad) => ({
            headlinesText: encodeTextList(ad.headlines),
            descriptionsText: encodeTextList(ad.descriptions),
            finalUrl: ad.finalUrl,
            path1: ad.path1 ?? null,
            path2: ad.path2 ?? null,
          })),
        },
      },
    });
  }
  if (tree.targets.length) {
    await db.searchTargetDraft.createMany({
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

async function loadDraftOrThrow(id: string): Promise<SearchDraftRecord> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().searchCampaignDraft.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
  });
  if (!row) {
    throw Object.assign(new Error("Search campaign draft not found."), {
      status: 404,
      info: { kind: "validation", hint: "Create a draft from /ops first." },
    });
  }
  return row;
}

export async function listSearchDrafts(): Promise<SearchDraftView[]> {
  const ctx = await ensurePlatformContext();
  const rows = await prisma().searchCampaignDraft.findMany({
    where: { organizationId: ctx.org.id },
    include: { ...draftInclude, externalAccount: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map((row) => toSearchDraftView(row));
}

export async function getSearchDraft(id: string): Promise<SearchDraftView> {
  return toSearchDraftView(await loadDraftOrThrow(id));
}

export async function createSearchDraft(body: unknown): Promise<SearchDraftView> {
  const tree = parseSearchDraftWrite(body);
  const ctx = await ensurePlatformContext();
  const external = await resolveExternalAccount({
    customerId: tree.customerId,
    externalAccountId: tree.externalAccountId,
  });
  const draft = await prisma().searchCampaignDraft.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      externalAccountId: external.id,
      createdById: ctx.user.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      enhancedCpcEnabled: tree.enhancedCpcEnabled,
      targetCpaMicros: tree.targetCpaMicros == null ? null : BigInt(tree.targetCpaMicros),
      targetRoasText: tree.targetRoasText ?? null,
      targetGoogleSearch: tree.targetGoogleSearch,
      targetSearchNetwork: tree.targetSearchNetwork,
      targetContentNetwork: tree.targetContentNetwork,
      targetPartnerSearchNetwork: tree.targetPartnerSearchNetwork,
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
    action: "search_draft.created",
    resourceType: "SEARCH_CAMPAIGN_DRAFT",
    resourceId: draft.id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getSearchDraft(draft.id);
}

export async function updateSearchDraft(id: string, body: unknown): Promise<SearchDraftView> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts are read-only."), {
      status: 400,
      info: { kind: "validation", hint: "Create a new draft to change an applied Search campaign." },
    });
  }
  const tree = parseSearchDraftWrite(body);
  const external = await resolveExternalAccount({
    customerId: tree.customerId || existing.externalAccount.externalId,
    externalAccountId: tree.externalAccountId ?? existing.externalAccountId,
  });
  await prisma().searchCampaignDraft.update({
    where: { id },
    data: {
      externalAccountId: external.id,
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      biddingStrategy: tree.biddingStrategy,
      enhancedCpcEnabled: tree.enhancedCpcEnabled,
      targetCpaMicros: tree.targetCpaMicros == null ? null : BigInt(tree.targetCpaMicros),
      targetRoasText: tree.targetRoasText ?? null,
      targetGoogleSearch: tree.targetGoogleSearch,
      targetSearchNetwork: tree.targetSearchNetwork,
      targetContentNetwork: tree.targetContentNetwork,
      targetPartnerSearchNetwork: tree.targetPartnerSearchNetwork,
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
    action: "search_draft.updated",
    resourceType: "SEARCH_CAMPAIGN_DRAFT",
    resourceId: id,
    metadata: { name: tree.name, customerId: external.externalId },
  });
  return getSearchDraft(id);
}

export async function patchSearchDraft(id: string, patch: unknown): Promise<SearchDraftView> {
  const existing = await getSearchDraft(id);
  const merged = mergeDraftPatch(toTree(existing), patch);
  return updateSearchDraft(id, merged);
}

export async function deleteSearchDraft(id: string): Promise<{ deleted: true }> {
  const existing = await loadDraftOrThrow(id);
  if (existing.statusDraft === "APPLIED") {
    throw Object.assign(new Error("Applied drafts cannot be deleted."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  await prisma().searchCampaignDraft.delete({ where: { id } });
  const ctx = await ensurePlatformContext();
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "search_draft.deleted",
    resourceType: "SEARCH_CAMPAIGN_DRAFT",
    resourceId: id,
  });
  return { deleted: true };
}

export async function getCampaignOpDetail(id: string): Promise<CampaignOpDetailView> {
  const ctx = await ensurePlatformContext();
  const row = await prisma().campaignOp.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: { dryRunJobs: { orderBy: { createdAt: "desc" } } },
  });
  if (!row) {
    throw Object.assign(new Error("Campaign op not found."), {
      status: 404,
      info: { kind: "validation" },
    });
  }
  return toOpDetail(row);
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
    searchCampaignDraftId: row.searchCampaignDraftId,
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

export async function getSearchDraftResult(id: string): Promise<{
  draft: SearchDraftView;
  campaignOp: CampaignOpDetailView | null;
}> {
  const draft = await loadDraftOrThrow(id);
  const view = toSearchDraftView(draft);
  if (!draft.campaignOpId) return { draft: view, campaignOp: null };
  try {
    return { draft: view, campaignOp: await getCampaignOpDetail(draft.campaignOpId) };
  } catch {
    return { draft: view, campaignOp: null };
  }
}

export async function validateOrApplySearchDraft(
  id: string,
  body: unknown,
  mode: "validate" | "apply",
): Promise<{
  draft: SearchDraftView;
  dryRun: boolean;
  applied: boolean;
  status: "PAUSED";
  request: ReturnType<typeof buildSearchDraftMutate>;
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
  const tree = parseSearchDraftTree({
    ...toTree(toSearchDraftView(draft)),
    ...raw,
    customerId: draft.externalAccount.externalId,
    status: raw.status ?? "PAUSED",
  });
  const request = buildSearchDraftMutate(tree, dryRun);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (isKnownNotEnabledCustomer(tree.customerId)) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "campaign_op.blocked",
      resourceType: "SEARCH_CAMPAIGN_DRAFT",
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
      searchCampaignDraftId: draft.id,
      kind: "SEARCH_CREATE",
      status: "DRAFT",
      name: tree.name,
      dailyBudgetMicros: BigInt(tree.dailyBudgetMicros),
      dryRun: request.validateOnly,
      confirmPhrase: raw.confirmPhrase == null ? null : String(raw.confirmPhrase),
      requestPayload: toJsonText(request),
      googleValidateOnly: request.validateOnly,
    },
  });

  await prisma().searchCampaignDraft.update({
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

    await prisma().searchCampaignDraft.update({
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
          summary: `Apply PAUSED Search campaign ${tree.name}`,
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
            searchCampaignDraftId: draft.id,
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
          ? "search_draft.validated"
          : "search_draft.applied_paused"
        : "search_draft.failed",
      resourceType: "SEARCH_CAMPAIGN_DRAFT",
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
        ? "Dry-run: full Search tree validated locally. Nothing was sent to Google Ads."
        : "Mock apply: would create a PAUSED Search campaign tree. No live mutate executed.",
      mutateOperationResponses: request.validateOnly
        ? []
        : [
            { campaignResult: { resourceName: `customers/${tree.customerId}/campaigns/mock-${draft.id}` } },
          ],
    };
    const names = extractResourceNames(response);
    await persistResult({
      response,
      source: "mock",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getSearchDraft(draft.id),
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
    const names = extractResourceNames(response);
    await persistResult({
      response,
      source: "live",
      success: true,
      resourceName: names.campaign ?? null,
    });
    return {
      draft: await getSearchDraft(draft.id),
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
