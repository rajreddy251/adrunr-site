import "server-only";

import type { AssistantMessageRole } from "@prisma/client";

import {
  detectForbiddenAssistantIntent,
  diffDemandGenDraftFields,
  diffDisplayDraftFields,
  diffDraftFields,
  diffPmaxDraftFields,
  diffVideoDraftFields,
  type AssistantContextPack,
  type AssistantTurnPlan,
} from "./assistant";
import { planAssistantTurn } from "./assistant-llm";
import { writeAudit } from "./audit";
import {
  createDisplayDraft,
  displayDraftViewToTree,
  getDisplayDraft,
  patchDisplayDraft,
  type DisplayDraftView,
} from "./display-ops";
import {
  createDemandGenDraft,
  demandGenDraftViewToTree,
  getDemandGenDraft,
  patchDemandGenDraft,
  type DemandGenDraftView,
} from "./demand-gen-ops";
import {
  createPmaxDraft,
  getPmaxDraft,
  patchPmaxDraft,
  pmaxDraftViewToTree,
  type PmaxDraftView,
} from "./pmax-ops";
import {
  createVideoDraft,
  getVideoDraft,
  patchVideoDraft,
  videoDraftViewToTree,
  type VideoDraftView,
} from "./video-ops";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG } from "./providers";
import {
  createSearchDraft,
  getSearchDraft,
  patchSearchDraft,
  searchDraftViewToTree,
  type SearchDraftView,
} from "./search-ops";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type {
  AssistantCampaignKind,
  AssistantMessageView,
  AssistantQuestion,
  AssistantThreadView,
  ClientMemoryFact,
} from "./types";

export type AssistantTurnResult = {
  thread: AssistantThreadView;
  draft: SearchDraftView | DisplayDraftView | PmaxDraftView | DemandGenDraftView | VideoDraftView | null;
  questions: AssistantQuestion[];
  patchedFields: string[];
  source: "mock" | "llm";
  refusedAction: string | null;
};

function threadKind(row: {
  draftId: string | null;
  displayDraftId: string | null;
  pmaxDraftId: string | null;
  demandGenDraftId: string | null;
  videoDraftId: string | null;
}): AssistantCampaignKind {
  if (row.videoDraftId) return "VIDEO";
  if (row.demandGenDraftId) return "DEMAND_GEN";
  if (row.pmaxDraftId) return "PMAX";
  if (row.displayDraftId) return "DISPLAY";
  return "SEARCH";
}

function assistantTitle(kind: AssistantCampaignKind): string {
  if (kind === "DISPLAY") return "Display wizard assistant";
  if (kind === "PMAX") return "Performance Max wizard assistant";
  if (kind === "DEMAND_GEN") return "Demand Gen wizard assistant";
  if (kind === "VIDEO") return "Video wizard assistant";
  return "Search wizard assistant";
}

function draftResourceType(kind: AssistantCampaignKind): string {
  if (kind === "DISPLAY") return "DISPLAY_CAMPAIGN_DRAFT";
  if (kind === "PMAX") return "PERFORMANCE_MAX_CAMPAIGN_DRAFT";
  if (kind === "DEMAND_GEN") return "DEMAND_GEN_CAMPAIGN_DRAFT";
  if (kind === "VIDEO") return "VIDEO_CAMPAIGN_DRAFT";
  return "SEARCH_CAMPAIGN_DRAFT";
}

function boundDraftId(
  row: {
    draftId: string | null;
    displayDraftId: string | null;
    pmaxDraftId: string | null;
    demandGenDraftId: string | null;
    videoDraftId: string | null;
  },
  kind: AssistantCampaignKind,
): string | null {
  if (kind === "DISPLAY") return row.displayDraftId;
  if (kind === "PMAX") return row.pmaxDraftId;
  if (kind === "DEMAND_GEN") return row.demandGenDraftId;
  if (kind === "VIDEO") return row.videoDraftId;
  return row.draftId;
}

function scopedClientError(): Error {
  return Object.assign(new Error("That client is outside this tenant scope."), {
    status: 403,
    info: { kind: "rbac", hint: "Assistant context is limited to the selected client." },
  });
}

async function requireScopedContext(clientId?: string | null) {
  const ctx = await ensurePlatformContext();
  if (clientId && clientId !== ctx.client.id) {
    throw scopedClientError();
  }
  return ctx;
}

function toMessageView(row: {
  id: string;
  threadId: string;
  role: AssistantMessageRole;
  content: string;
  metadataText: string | null;
  createdAt: Date;
}): AssistantMessageView {
  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    content: row.content,
    metadataText: row.metadataText,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadThreadOrThrow(id: string): Promise<AssistantThreadView> {
  const ctx = await requireScopedContext();
  const row = await prisma().assistantThread.findFirst({
    where: { id, organizationId: ctx.org.id, clientId: ctx.client.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) {
    throw Object.assign(new Error("Assistant thread not found."), {
      status: 404,
      info: { kind: "validation", hint: "Start a thread from the Search, Display, Performance Max, Demand Gen, or Video wizard assistant." },
    });
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    draftId: row.draftId,
    displayDraftId: row.displayDraftId,
    pmaxDraftId: row.pmaxDraftId,
    demandGenDraftId: row.demandGenDraftId,
    videoDraftId: row.videoDraftId,
    kind: threadKind(row),
    createdById: row.createdById,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messages: row.messages.map(toMessageView),
  };
}

async function assertDraftInScope(draftId: string, kind: AssistantCampaignKind = "SEARCH") {
  const ctx = await requireScopedContext();
  if (kind === "DISPLAY") {
    const draft = await prisma().displayCampaignDraft.findFirst({
      where: { id: draftId, organizationId: ctx.org.id, clientId: ctx.client.id },
      select: { id: true, name: true },
    });
    if (!draft) {
      throw Object.assign(new Error("Display campaign draft not found for this client."), {
        status: 404,
        info: { kind: "rbac", hint: "Assistant threads cannot read another client's drafts." },
      });
    }
    return draft;
  }
  if (kind === "PMAX") {
    const draft = await prisma().performanceMaxCampaignDraft.findFirst({
      where: { id: draftId, organizationId: ctx.org.id, clientId: ctx.client.id },
      select: { id: true, name: true },
    });
    if (!draft) {
      throw Object.assign(new Error("Performance Max campaign draft not found for this client."), {
        status: 404,
        info: { kind: "rbac", hint: "Assistant threads cannot read another client's drafts." },
      });
    }
    return draft;
  }
  if (kind === "DEMAND_GEN") {
    const draft = await prisma().demandGenCampaignDraft.findFirst({
      where: { id: draftId, organizationId: ctx.org.id, clientId: ctx.client.id },
      select: { id: true, name: true },
    });
    if (!draft) {
      throw Object.assign(new Error("Demand Gen campaign draft not found for this client."), {
        status: 404,
        info: { kind: "rbac", hint: "Assistant threads cannot read another client's drafts." },
      });
    }
    return draft;
  }
  if (kind === "VIDEO") {
    const draft = await prisma().videoCampaignDraft.findFirst({
      where: { id: draftId, organizationId: ctx.org.id, clientId: ctx.client.id },
      select: { id: true, name: true },
    });
    if (!draft) {
      throw Object.assign(new Error("Video campaign draft not found for this client."), {
        status: 404,
        info: { kind: "rbac", hint: "Assistant threads cannot read another client's drafts." },
      });
    }
    return draft;
  }
  const draft = await prisma().searchCampaignDraft.findFirst({
    where: { id: draftId, organizationId: ctx.org.id, clientId: ctx.client.id },
    select: { id: true, name: true },
  });
  if (!draft) {
    throw Object.assign(new Error("Search campaign draft not found for this client."), {
      status: 404,
      info: { kind: "rbac", hint: "Assistant threads cannot read another client's drafts." },
    });
  }
  return draft;
}

export async function listAssistantThreads(input?: {
  draftId?: string | null;
  clientId?: string | null;
  kind?: AssistantCampaignKind | null;
}): Promise<AssistantThreadView[]> {
  const ctx = await requireScopedContext(input?.clientId);
  const kind = input?.kind ?? "SEARCH";
  const rows = await prisma().assistantThread.findMany({
    where: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      ...(input?.draftId
        ? kind === "DISPLAY"
          ? { displayDraftId: input.draftId }
          : kind === "PMAX"
            ? { pmaxDraftId: input.draftId }
            : kind === "DEMAND_GEN"
              ? { demandGenDraftId: input.draftId }
              : kind === "VIDEO"
                ? { videoDraftId: input.draftId }
                : { draftId: input.draftId }
        : {}),
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    draftId: row.draftId,
    displayDraftId: row.displayDraftId,
    pmaxDraftId: row.pmaxDraftId,
    demandGenDraftId: row.demandGenDraftId,
    videoDraftId: row.videoDraftId,
    kind: threadKind(row),
    createdById: row.createdById,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messages: row.messages.map(toMessageView),
  }));
}

export async function getAssistantThread(id: string): Promise<AssistantThreadView> {
  return loadThreadOrThrow(id);
}

export async function createAssistantThread(input: {
  draftId?: string | null;
  clientId?: string | null;
  title?: string | null;
  kind?: AssistantCampaignKind | null;
}): Promise<AssistantThreadView> {
  const ctx = await requireScopedContext(input.clientId);
  const kind = input.kind ?? "SEARCH";
  if (input.draftId) await assertDraftInScope(input.draftId, kind);
  const row = await prisma().assistantThread.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      draftId: kind === "SEARCH" ? input.draftId ?? null : null,
      displayDraftId: kind === "DISPLAY" ? input.draftId ?? null : null,
      pmaxDraftId: kind === "PMAX" ? input.draftId ?? null : null,
      demandGenDraftId: kind === "DEMAND_GEN" ? input.draftId ?? null : null,
      videoDraftId: kind === "VIDEO" ? input.draftId ?? null : null,
      createdById: ctx.user.id,
      title: input.title?.trim() || assistantTitle(kind),
    },
    include: { messages: true },
  });
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "assistant.thread_created",
    resourceType: "ASSISTANT_THREAD",
    resourceId: row.id,
    metadata: { clientId: ctx.client.id, draftId: input.draftId, kind },
  });
  return loadThreadOrThrow(row.id);
}

export async function listAssistantMessages(threadId: string): Promise<AssistantMessageView[]> {
  const thread = await loadThreadOrThrow(threadId);
  return thread.messages;
}

export async function addAssistantMessage(input: {
  threadId: string;
  content: string;
  role?: "USER" | "ASSISTANT" | "SYSTEM";
  metadata?: unknown;
}): Promise<AssistantMessageView> {
  await loadThreadOrThrow(input.threadId);
  const content = input.content.trim();
  if (!content) {
    throw Object.assign(new Error("Message content is required."), {
      status: 400,
      info: { kind: "validation" },
    });
  }
  const row = await prisma().assistantMessage.create({
    data: {
      threadId: input.threadId,
      role: input.role ?? "USER",
      content,
      metadataText: input.metadata == null ? null : JSON.stringify(input.metadata),
    },
  });
  await prisma().assistantThread.update({
    where: { id: input.threadId },
    data: { updatedAt: new Date() },
  });
  return toMessageView(row);
}

export async function listClientMemory(clientId?: string | null): Promise<ClientMemoryFact[]> {
  const ctx = await requireScopedContext(clientId);
  const rows = await prisma().clientMemory.findMany({
    where: { clientId: ctx.client.id },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
  return rows.map((row) => ({ key: row.key, value: row.value, source: row.source }));
}

async function upsertClientMemory(facts: AssistantTurnPlan["memory"], clientId: string) {
  const db = prisma();
  for (const fact of facts) {
    await db.clientMemory.upsert({
      where: { clientId_key: { clientId, key: fact.key } },
      create: { clientId, key: fact.key, value: fact.value, source: fact.source },
      update: { value: fact.value, source: fact.source },
    });
  }
}

export async function buildAssistantContextPack(input: {
  draftId?: string | null;
  threadId?: string | null;
  kind?: AssistantCampaignKind | null;
}): Promise<AssistantContextPack> {
  const ctx = await requireScopedContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  const kind = input.kind ?? "SEARCH";
  const [accounts, entities, searchDrafts, displayDrafts, pmaxDrafts, demandGenDrafts, videoDrafts, memory, thread] = await Promise.all([
    prisma().externalAccount.findMany({
      where: { organizationId: ctx.org.id, clientId: ctx.client.id, providerId: provider.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma().externalEntity.findMany({
      where: {
        organizationId: ctx.org.id,
        providerId: provider.id,
        entityType: "CAMPAIGN",
        externalAccount: { clientId: ctx.client.id, organizationId: ctx.org.id },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma().searchCampaignDraft.findMany({
      where: { organizationId: ctx.org.id, clientId: ctx.client.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma().displayCampaignDraft.findMany({
      where: { organizationId: ctx.org.id, clientId: ctx.client.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma().performanceMaxCampaignDraft.findMany({
      where: { organizationId: ctx.org.id, clientId: ctx.client.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma().demandGenCampaignDraft.findMany({
      where: { organizationId: ctx.org.id, clientId: ctx.client.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma().videoCampaignDraft.findMany({
      where: { organizationId: ctx.org.id, clientId: ctx.client.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    listClientMemory(ctx.client.id),
    input.threadId ? loadThreadOrThrow(input.threadId) : Promise.resolve(null),
  ]);

  const campaigns: AssistantContextPack["campaigns"] = [
    ...entities.map((entity) => ({
      name: entity.displayName ?? entity.externalId,
      type: entity.entityType,
      status: entity.status,
      budgetHint: entity.attributesText,
      settings: entity.attributesText,
      source: "external_entity" as const,
    })),
    ...searchDrafts.map((draft) => ({
      name: draft.name,
      type: "SEARCH_DRAFT",
      status: draft.statusDraft,
      budgetHint: draft.dailyBudgetMicros.toString(),
      settings: draft.biddingStrategy,
      source: "search_draft" as const,
    })),
    ...displayDrafts.map((draft) => ({
      name: draft.name,
      type: "DISPLAY_DRAFT",
      status: draft.statusDraft,
      budgetHint: draft.dailyBudgetMicros.toString(),
      settings: draft.biddingStrategy,
      source: "display_draft" as const,
    })),
    ...pmaxDrafts.map((draft) => ({
      name: draft.name,
      type: "PMAX_DRAFT",
      status: draft.statusDraft,
      budgetHint: draft.dailyBudgetMicros.toString(),
      settings: draft.biddingStrategy,
      source: "pmax_draft" as const,
    })),
    ...demandGenDrafts.map((draft) => ({
      name: draft.name,
      type: "DEMAND_GEN_DRAFT",
      status: draft.statusDraft,
      budgetHint: draft.dailyBudgetMicros.toString(),
      settings: draft.biddingStrategy,
      source: "demand_gen_draft" as const,
    })),
    ...videoDrafts.map((draft) => ({
      name: draft.name,
      type: "VIDEO_DRAFT",
      status: draft.statusDraft,
      budgetHint: draft.dailyBudgetMicros.toString(),
      settings: draft.biddingStrategy,
      source: "video_draft" as const,
    })),
  ];

  let draftTree: AssistantContextPack["draft"] = null;
  if (input.draftId) {
    const scoped = await assertDraftInScope(input.draftId, kind);
    draftTree =
      kind === "DISPLAY"
        ? displayDraftViewToTree(await getDisplayDraft(scoped.id))
        : kind === "PMAX"
          ? pmaxDraftViewToTree(await getPmaxDraft(scoped.id))
          : kind === "DEMAND_GEN"
            ? demandGenDraftViewToTree(await getDemandGenDraft(scoped.id))
            : kind === "VIDEO"
              ? videoDraftViewToTree(await getVideoDraft(scoped.id))
              : searchDraftViewToTree(await getSearchDraft(scoped.id));
  }

  return {
    kind,
    org: { id: ctx.org.id, name: ctx.org.name, slug: ctx.org.slug },
    client: { id: ctx.client.id, name: ctx.client.name, slug: ctx.client.slug },
    accounts: accounts.map((account) => ({
      id: account.id,
      externalId: account.externalId,
      displayName: account.displayName,
      status: account.status,
      isManager: account.isManager,
    })),
    campaigns,
    draft: draftTree,
    draftId: input.draftId ?? null,
    messages: thread?.messages.map((message) => ({ role: message.role, content: message.content })) ?? [],
    memory,
  };
}

export async function runAssistantTurn(input: {
  message: string;
  threadId?: string | null;
  draftId?: string | null;
  clientId?: string | null;
  customerId?: string | null;
  kind?: AssistantCampaignKind | null;
}): Promise<AssistantTurnResult> {
  const ctx = await requireScopedContext(input.clientId);
  const kind: AssistantCampaignKind = input.kind ?? "SEARCH";
  const message = input.message.trim();
  if (!message) {
    throw Object.assign(new Error("Message is required."), {
      status: 400,
      info: { kind: "validation", hint: "Paste a landing URL or a short brief." },
    });
  }

  let draftId = input.draftId ?? null;
  if (draftId) await assertDraftInScope(draftId, kind);

  if (!draftId && input.customerId) {
    if (kind === "DISPLAY") {
      const created = await createDisplayDraft({
        customerId: input.customerId,
        name: "Adrunr paused display",
        dailyBudgetMicros: 1_000_000,
        biddingStrategy: "MANUAL_CPC",
        status: "PAUSED",
      });
      draftId = created.id;
    } else if (kind === "PMAX") {
      const created = await createPmaxDraft({
        customerId: input.customerId,
        name: "Adrunr paused Performance Max",
        dailyBudgetMicros: 1_000_000,
        biddingStrategy: "MAXIMIZE_CONVERSIONS",
        status: "PAUSED",
      });
      draftId = created.id;
    } else if (kind === "DEMAND_GEN") {
      const created = await createDemandGenDraft({
        customerId: input.customerId,
        name: "Adrunr paused Demand Gen",
        dailyBudgetMicros: 1_000_000,
        biddingStrategy: "MAXIMIZE_CONVERSIONS",
        status: "PAUSED",
      });
      draftId = created.id;
    } else if (kind === "VIDEO") {
      const created = await createVideoDraft({
        customerId: input.customerId,
        name: "Adrunr paused Video",
        dailyBudgetMicros: 1_000_000,
        biddingStrategy: "MANUAL_CPV",
        status: "PAUSED",
      });
      draftId = created.id;
    } else {
      const created = await createSearchDraft({
        customerId: input.customerId,
        name: "Adrunr paused search",
        dailyBudgetMicros: 1_000_000,
        biddingStrategy: "MANUAL_CPC",
        status: "PAUSED",
      });
      draftId = created.id;
    }
  }

  let threadId = input.threadId ?? null;
  if (threadId) {
    const existing = await loadThreadOrThrow(threadId);
    const boundId = boundDraftId(existing, kind);
    if (draftId && boundId && boundId !== draftId) {
      throw Object.assign(new Error("Thread is bound to a different draft."), {
        status: 400,
        info: { kind: "validation" },
      });
    }
    if (draftId && !boundId) {
      await prisma().assistantThread.update({
        where: { id: threadId },
        data:
          kind === "DISPLAY"
            ? { displayDraftId: draftId }
            : kind === "PMAX"
              ? { pmaxDraftId: draftId }
              : kind === "DEMAND_GEN"
                ? { demandGenDraftId: draftId }
                : kind === "VIDEO"
                  ? { videoDraftId: draftId }
                  : { draftId },
      });
    }
    draftId = draftId ?? boundId;
  } else {
    const created = await createAssistantThread({
      draftId,
      kind,
      title: assistantTitle(kind),
    });
    threadId = created.id;
  }

  await addAssistantMessage({ threadId, content: message, role: "USER" });

  const refused = detectForbiddenAssistantIntent(message);
  const pack = await buildAssistantContextPack({ draftId, threadId, kind });
  const { plan, source } = refused
    ? {
        plan: {
          update_draft_fields: null,
          ask_questions: [],
          memory: [],
          assistant_message:
            refused === "validate"
              ? "I cannot Validate from chat. Use Validate (dry-run) on the wizard review step — that is validateOnly only."
              : refused === "apply"
                ? "I cannot Apply from chat. Create PAUSED lives on the form and requires typing CREATE PAUSED. There is no enable path."
                : "I cannot enable, publish, or go live. Adrunr only drafts PAUSED campaigns; spend requires an action outside this app.",
          refusedAction: refused,
        } satisfies AssistantTurnPlan,
        source: "mock" as const,
      }
    : await planAssistantTurn({ message, pack });

  let draft: SearchDraftView | DisplayDraftView | PmaxDraftView | DemandGenDraftView | VideoDraftView | null = draftId
    ? kind === "DISPLAY"
      ? await getDisplayDraft(draftId)
      : kind === "PMAX"
        ? await getPmaxDraft(draftId)
        : kind === "DEMAND_GEN"
          ? await getDemandGenDraft(draftId)
          : kind === "VIDEO"
            ? await getVideoDraft(draftId)
            : await getSearchDraft(draftId)
    : null;
  let patchedFields: string[] = [];
  if (plan.update_draft_fields && draftId && !refused) {
    if (kind === "DISPLAY") {
      const before = displayDraftViewToTree((draft as DisplayDraftView) ?? (await getDisplayDraft(draftId)));
      draft = await patchDisplayDraft(draftId, plan.update_draft_fields);
      const after = displayDraftViewToTree(draft);
      patchedFields = diffDisplayDraftFields(before, after);
    } else if (kind === "PMAX") {
      const before = pmaxDraftViewToTree((draft as PmaxDraftView) ?? (await getPmaxDraft(draftId)));
      draft = await patchPmaxDraft(draftId, plan.update_draft_fields);
      const after = pmaxDraftViewToTree(draft);
      patchedFields = diffPmaxDraftFields(before, after);
    } else if (kind === "DEMAND_GEN") {
      const before = demandGenDraftViewToTree((draft as DemandGenDraftView) ?? (await getDemandGenDraft(draftId)));
      draft = await patchDemandGenDraft(draftId, plan.update_draft_fields);
      const after = demandGenDraftViewToTree(draft);
      patchedFields = diffDemandGenDraftFields(before, after);
    } else if (kind === "VIDEO") {
      const before = videoDraftViewToTree((draft as VideoDraftView) ?? (await getVideoDraft(draftId)));
      draft = await patchVideoDraft(draftId, plan.update_draft_fields);
      const after = videoDraftViewToTree(draft);
      patchedFields = diffVideoDraftFields(before, after);
    } else {
      const before = searchDraftViewToTree((draft as SearchDraftView) ?? (await getSearchDraft(draftId)));
      draft = await patchSearchDraft(draftId, plan.update_draft_fields);
      const after = searchDraftViewToTree(draft);
      patchedFields = diffDraftFields(before, after);
    }
    if (patchedFields.length) {
      await writeAudit({
        organizationId: ctx.org.id,
        actorUserId: ctx.user.id,
        action: "assistant.draft_patched",
        resourceType: draftResourceType(kind),
        resourceId: draftId,
        metadata: {
          threadId,
          fields: patchedFields,
          source,
          clientId: ctx.client.id,
          kind,
        },
      });
    }
  }

  if (plan.memory.length && !refused) {
    await upsertClientMemory(plan.memory, ctx.client.id);
  }

  await addAssistantMessage({
    threadId,
    role: "ASSISTANT",
    content: plan.assistant_message || "Updated the draft. Review the form — I cannot validate or apply.",
    metadata: {
      questions: plan.ask_questions,
      patchedFields,
      source,
      refusedAction: plan.refusedAction ?? refused,
    },
  });

  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: refused ? "assistant.turn_refused" : "assistant.turn",
    resourceType: "ASSISTANT_THREAD",
    resourceId: threadId,
    metadata: {
      clientId: ctx.client.id,
      draftId,
      source,
      patchedFields,
      refusedAction: refused,
    },
  });

  return {
    thread: await loadThreadOrThrow(threadId),
    draft,
    questions: plan.ask_questions,
    patchedFields,
    source,
    refusedAction: plan.refusedAction ?? refused,
  };
}
