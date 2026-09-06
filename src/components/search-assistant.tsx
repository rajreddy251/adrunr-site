"use client";

import { useState, type FormEvent, type RefObject } from "react";

import type { DisplayWizardHandle } from "@/components/display-wizard";
import type { PmaxWizardHandle } from "@/components/pmax-wizard";
import type { SearchWizardHandle } from "@/components/search-wizard";
import type {
  AssistantCampaignKind,
  AssistantMessageView,
  AssistantQuestion,
  AssistantThreadView,
  DisplayDraftClientView,
  PmaxDraftClientView,
  SearchDraftClientView,
} from "@/lib/types";

type TurnResponse = {
  ok: boolean;
  thread?: AssistantThreadView;
  draft?: SearchDraftClientView | DisplayDraftClientView | PmaxDraftClientView | null;
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
}: {
  wizard: RefObject<SearchWizardHandle | DisplayWizardHandle | PmaxWizardHandle | null>;
  connected: boolean;
  kind?: AssistantCampaignKind;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<AssistantThreadView | null>(null);
  const [questions, setQuestions] = useState<AssistantQuestion[]>([]);
  const [patched, setPatched] = useState<string[]>([]);
  const [source, setSource] = useState<"mock" | "llm" | null>(null);

  const messages = thread?.messages.filter((message) => message.role !== "SYSTEM") ?? [];

  async function submit(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const message = (preset ?? input).trim();
    if (!message || busy) return;
    if (!connected) {
      setError("Connect Google Ads (or ADRUNR_MOCK=1) before filling a draft.");
      return;
    }
    const handle = wizard.current;
    const customerId = handle?.getCustomerId() ?? "";
    if (!customerId) {
      setError("Pick an enabled customer in S0 so I can attach the draft to this client.");
      return;
    }

    setBusy(true);
    setError(null);
    let draftId = handle?.getDraftId() ?? null;
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
        customerId,
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
    if (json.draft) {
      handle?.applyDraft(json.draft as SearchDraftClientView & DisplayDraftClientView & PmaxDraftClientView);
    }
    setInput("");
    setBusy(false);
  }

  return (
    <aside
      className="flex min-h-[32rem] flex-col rounded-2xl border border-ink-700 bg-ink-900 p-5"
      data-testid={kind === "DISPLAY" ? "display-assistant" : kind === "PMAX" ? "pmax-assistant" : "search-assistant"}
    >
      <h2 className="text-lg text-white">
        {kind === "DISPLAY" ? "Display" : kind === "PMAX" ? "Performance Max" : "Search"} assistant
      </h2>
      <p className="mt-1 text-sm text-moss-400">
        Paste a URL or brief. I fill the draft first, then ask only for gaps. Chat cannot Validate,
        Create PAUSED, or enable.
        {kind === "DISPLAY" ? " Remarketing is a Display audience, not a campaign type." : ""}
        {kind === "PMAX" ? " Asset groups and search-theme signals — listings are optional storage only." : ""}
      </p>
      {source ? (
        <p className="mt-2 font-mono text-xs text-moss-500">
          {source === "mock" ? "ADRUNR_MOCK heuristic fill" : "live model"}
          {patched.length ? ` · patched ${patched.join(", ")}` : ""}
        </p>
      ) : null}

      <ol className="mt-4 flex-1 space-y-3 overflow-auto pr-1">
        {messages.length === 0 ? (
          <li className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-moss-500">
            Example: <span className="font-mono text-moss-300">https://acmeboots.com/hiking</span> or
            “organic coffee in Canada, $25/day”.
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
          placeholder="Landing URL or brief…"
          className="input resize-y"
        />
        <button
          type="submit"
          data-testid="assistant-send"
          disabled={busy || !connected}
          className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-40"
        >
          {busy ? "Filling draft…" : "Fill draft"}
        </button>
      </form>
    </aside>
  );
}

function ChatBubble({ message }: { message: AssistantMessageView }) {
  const assistant = message.role === "ASSISTANT";
  return (
    <li
      className={`rounded-xl px-3 py-2 text-sm ${
        assistant ? "border border-lime-400/20 bg-ink-950 text-moss-300" : "border border-ink-700 text-white"
      }`}
    >
      <p className="font-mono text-[10px] uppercase tracking-wide text-moss-500">
        {assistant ? "Assistant" : "You"}
      </p>
      <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
    </li>
  );
}
