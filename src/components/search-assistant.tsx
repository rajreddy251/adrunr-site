"use client";

import { useEffect, useState, type FormEvent, type RefObject } from "react";

import type { DemandGenWizardHandle } from "@/components/demand-gen-wizard";
import type { DisplayWizardHandle } from "@/components/display-wizard";
import type { PmaxWizardHandle } from "@/components/pmax-wizard";
import type { SearchWizardHandle } from "@/components/search-wizard";
import type { AppWizardHandle } from "@/components/app-wizard";
import type { HotelWizardHandle } from "@/components/hotel-wizard";
import type { LocalServicesWizardHandle } from "@/components/local-services-wizard";
import type { LocalWizardHandle } from "@/components/local-wizard";
import type { ShoppingWizardHandle } from "@/components/shopping-wizard";
import type { VideoWizardHandle } from "@/components/video-wizard";
import {
  CAMPAIGN_CHAT_DID_NOT_APPLY,
  CAMPAIGN_CHAT_PROMPTS,
  CAMPAIGN_CHAT_PROPOSED_MARK,
  CAMPAIGN_CHAT_SUBTITLE,
  campaignChatScopeKey,
  refusedActionBanner,
} from "@/lib/campaign-chat";
import type {
  AssistantCampaignKind,
  AssistantMessageView,
  AssistantQuestion,
  AssistantThreadView,
  DemandGenDraftClientView,
  DisplayDraftClientView,
  PmaxDraftClientView,
  SearchDraftClientView,
  AppDraftClientView,
  HotelDraftClientView,
  LocalDraftClientView,
  LocalServicesDraftClientView,
  ShoppingDraftClientView,
  VideoDraftClientView,
} from "@/lib/types";

type WizardHandle = RefObject<
  | SearchWizardHandle
  | DisplayWizardHandle
  | PmaxWizardHandle
  | DemandGenWizardHandle
  | VideoWizardHandle
  | ShoppingWizardHandle
  | AppWizardHandle
  | HotelWizardHandle
  | LocalWizardHandle
  | LocalServicesWizardHandle
  | null
>;

type TurnResponse = {
  ok: boolean;
  thread?: AssistantThreadView;
  draft?:
    | SearchDraftClientView
    | DisplayDraftClientView
    | PmaxDraftClientView
    | DemandGenDraftClientView
    | VideoDraftClientView
    | ShoppingDraftClientView
    | AppDraftClientView
    | HotelDraftClientView
    | LocalDraftClientView
    | LocalServicesDraftClientView
    | null;
  questions?: AssistantQuestion[];
  patchedFields?: string[];
  source?: "mock" | "llm";
  refusedAction?: string | null;
  error?: string;
  hint?: string;
  safety?: { note?: string };
};

export function SearchAssistant({
  wizard,
  connected,
  kind = "SEARCH",
  variant = "wizard",
  customerId,
  campaignId,
  draftId: boundDraftId,
  onPropose,
  onToast,
}: {
  wizard?: WizardHandle;
  connected: boolean;
  kind?: AssistantCampaignKind;
  variant?: "wizard" | "campaign";
  customerId?: string;
  campaignId?: string;
  draftId?: string | null;
  onPropose?: (draft: SearchDraftClientView, patchedFields: string[]) => void;
  onToast?: (message: string) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<AssistantThreadView | null>(null);
  const [questions, setQuestions] = useState<AssistantQuestion[]>([]);
  const [patched, setPatched] = useState<string[]>([]);
  const [source, setSource] = useState<"mock" | "llm" | null>(null);
  const [refusedAction, setRefusedAction] = useState<string | null>(null);
  const [localDraftId, setLocalDraftId] = useState<string | null>(boundDraftId ?? null);
  const [toast, setToast] = useState<string | null>(null);

  const campaign = variant === "campaign";
  const scopeKey = campaignChatScopeKey({
    campaignId,
    draftId: boundDraftId,
    customerId,
    kind,
  });

  useEffect(() => {
    setThread(null);
    setQuestions([]);
    setPatched([]);
    setSource(null);
    setRefusedAction(null);
    setError(null);
    setToast(null);
    setLocalDraftId(boundDraftId ?? null);
    setInput("");
  }, [scopeKey, boundDraftId]);

  const messages = thread?.messages.filter((message) => message.role !== "SYSTEM") ?? [];
  const refusedBanner = refusedActionBanner(refusedAction);

  async function submit(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const message = (preset ?? input).trim();
    if (!message || busy) return;
    if (!connected) {
      setError("Connect Google Ads (or ADRUNR_MOCK=1) before filling a draft.");
      return;
    }
    const handle = wizard?.current;
    const nextCustomerId = customerId || handle?.getCustomerId() || "";
    if (!nextCustomerId) {
      setError(
        campaign
          ? "Select a customer in the top bar so I can scope this campaign thread."
          : "Pick an enabled customer in S0 so I can attach the draft to this client.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    setRefusedAction(null);
    let draftId = localDraftId || boundDraftId || handle?.getDraftId() || null;
    if (!draftId && handle) {
      draftId = await handle.persist();
    }

    const res = await fetch("/api/assistant/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        threadId: thread?.id,
        draftId,
        customerId: nextCustomerId,
        kind,
      }),
    });
    const json = (await res.json()) as TurnResponse;
    if (!json.ok || !json.thread) {
      setError([json.error, json.hint].filter(Boolean).join(" — ") || "Assistant turn failed.");
      setBusy(false);
      return;
    }
    setThread(json.thread);
    setQuestions(json.questions ?? []);
    setPatched(json.patchedFields ?? []);
    setSource(json.source ?? null);
    setRefusedAction(json.refusedAction ?? null);
    if (json.thread.draftId) setLocalDraftId(json.thread.draftId);
    if (json.draft) {
      if (kind === "SEARCH") {
        (handle as SearchWizardHandle | null | undefined)?.applyDraft(json.draft as SearchDraftClientView, {
          patchedFields: json.patchedFields ?? [],
          proposedByChat: true,
        });
        onPropose?.(json.draft as SearchDraftClientView, json.patchedFields ?? []);
      } else {
        handle?.applyDraft(
          json.draft as SearchDraftClientView &
            DisplayDraftClientView &
            PmaxDraftClientView &
            DemandGenDraftClientView &
            VideoDraftClientView &
            ShoppingDraftClientView &
            AppDraftClientView &
            HotelDraftClientView &
            LocalDraftClientView &
            LocalServicesDraftClientView,
        );
      }
    }
    if ((json.patchedFields?.length ?? 0) > 0 && !json.refusedAction) {
      const note = CAMPAIGN_CHAT_DID_NOT_APPLY;
      if (onToast) onToast(note);
      else setToast(note);
    }
    setInput("");
    setBusy(false);
  }

  return (
    <aside
      className="flex min-h-[32rem] flex-col rounded-2xl border border-ink-700 bg-ink-900 p-5"
      data-testid={
        campaign
          ? "campaign-assistant"
          : kind === "DISPLAY"
            ? "display-assistant"
            : kind === "PMAX"
              ? "pmax-assistant"
              : kind === "DEMAND_GEN"
                ? "demand-gen-assistant"
                : kind === "VIDEO"
                  ? "video-assistant"
                  : kind === "SHOPPING"
                    ? "shopping-assistant"
                    : kind === "APP"
                      ? "app-assistant"
                      : kind === "HOTEL"
                        ? "hotel-assistant"
                        : kind === "LOCAL"
                          ? "local-assistant"
                          : kind === "LOCAL_SERVICES"
                            ? "local-services-assistant"
                            : "search-assistant"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg text-white">
          {campaign
            ? "Campaign chat"
            : `${
                kind === "DISPLAY"
                  ? "Display"
                  : kind === "PMAX"
                    ? "Performance Max"
                    : kind === "DEMAND_GEN"
                      ? "Demand Gen"
                      : kind === "VIDEO"
                        ? "Video"
                        : kind === "SHOPPING"
                          ? "Shopping"
                          : kind === "APP"
                            ? "App"
                            : kind === "HOTEL"
                              ? "Hotel"
                              : kind === "LOCAL"
                                ? "Local"
                                : kind === "LOCAL_SERVICES"
                                  ? "Local Services"
                                  : "Search"
              } assistant`}
        </h2>
      </div>
      <p className="mt-1 text-sm text-moss-400">
        {CAMPAIGN_CHAT_SUBTITLE} Fill first, then ask only for gaps.
        {kind === "DISPLAY" && !campaign ? " Remarketing is a Display audience, not a campaign type." : ""}
        {kind === "PMAX" && !campaign
          ? " Asset groups and search-theme signals — listings are optional storage only."
          : ""}
        {kind === "DEMAND_GEN" && !campaign
          ? " Ad groups and Demand Gen multi-asset ads — USER_LIST audiences, not a separate campaign type."
          : ""}
        {kind === "VIDEO" && !campaign
          ? " Ad groups and YouTube video responsive ads — USER_LIST audiences, not a separate campaign type."
          : ""}
        {kind === "SHOPPING" && !campaign
          ? " Merchant Center + ALL_PRODUCTS product groups — listings are optional storage only."
          : ""}
        {kind === "APP" && !campaign
          ? " App id + Android / iOS platforms — install / download goal. Chat cannot Validate or Apply."
          : ""}
        {kind === "HOTEL" && !campaign
          ? " Hotel Center + ALL_HOTELS listings — percent CPC. Chat cannot Validate or Apply."
          : ""}
        {kind === "LOCAL" && !campaign
          ? " Store visits + business location + one local ad. Chat cannot Validate or Apply."
          : ""}
        {kind === "LOCAL_SERVICES" && !campaign
          ? " Primary service category + max lead bid. Chat cannot Validate or Apply."
          : ""}
      </p>
      {source ? (
        <p className="mt-2 font-mono text-xs text-moss-500">
          {source === "mock" ? "ADRUNR_MOCK heuristic fill" : "live model"}
          {patched.length ? ` · ${CAMPAIGN_CHAT_PROPOSED_MARK} ${patched.join(", ")}` : ""}
        </p>
      ) : null}

      <ol className="mt-4 flex-1 space-y-3 overflow-auto pr-1">
        {messages.length === 0 ? (
          <li className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-moss-500">
            {campaign || kind === "SEARCH" ? (
              <div className="space-y-2">
                <p>Suggested prompts — fill first, gap-only.</p>
                <div className="flex flex-wrap gap-2">
                  {CAMPAIGN_CHAT_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.id}
                      type="button"
                      data-testid={`ops-campaign-chat-prompt-${prompt.id}`}
                      className="rounded-full border border-ink-700 px-3 py-1 font-mono text-[11px] text-moss-300 hover:border-lime-400/40"
                      onClick={() => void submit(undefined, prompt.text)}
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                Example: <span className="font-mono text-moss-300">https://acmeboots.com/hiking</span> or
                “organic coffee in Canada, $25/day”.
              </>
            )}
          </li>
        ) : (
          messages.map((message) => <ChatBubble key={message.id} message={message} />)
        )}
      </ol>

      {questions.length ? (
        <ul className="mt-3 space-y-2">
          {questions.map((question) => (
            <li key={question.id}>
              <button
                type="button"
                className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-left text-xs text-moss-300 hover:border-lime-400/40"
                onClick={() => setInput(question.optional ? "" : input)}
              >
                {question.optional ? "Optional · " : ""}
                {question.question}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {refusedBanner ? (
        <p data-testid="ops-campaign-chat-refused" className="ops-chat-refused mt-3 px-3 py-2 text-sm" role="alert">
          {refusedBanner}
        </p>
      ) : null}

      {toast ? (
        <p data-testid="ops-campaign-chat-toast" className="mt-3 text-sm text-amber-400">
          {toast}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-coral-400" role="alert">
          {error}
        </p>
      ) : null}

      <form className="mt-4 space-y-3" onSubmit={(event) => void submit(event)}>
        <textarea
          data-testid="assistant-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          placeholder={campaign ? "Ask about this campaign…" : "Landing URL or brief…"}
          className="input resize-y"
        />
        <button
          type="submit"
          data-testid="assistant-send"
          disabled={busy || !connected}
          className="ops-btn-primary"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </aside>
  );
}

function ChatBubble({ message }: { message: AssistantMessageView }) {
  const assistant = message.role === "ASSISTANT";
  return (
    <li className={`rounded-xl px-3 py-2 text-sm ${assistant ? "ops-chat-bubble-assistant" : "ops-chat-bubble-user"}`}>
      <p className="font-mono text-[10px] uppercase tracking-wide text-moss-500">
        {assistant ? "Assistant" : "You"}
      </p>
      <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
    </li>
  );
}
