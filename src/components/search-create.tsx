"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CampaignChat } from "@/components/campaign-chat";
import { useOpsSession } from "@/components/ops-session";
import { SearchWizard, type SearchWizardHandle } from "@/components/search-wizard";
import {
  SEARCH_CREATE_NOTE,
  SEARCH_CREATE_STEPS,
  searchCreateChatVisible,
  searchCreatePath,
} from "@/lib/search-create";

export function SearchCreate() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialDraftId = searchParams.get("draftId");
  const { accounts, status, selectedId, refreshAudit } = useOpsSession();
  const wizardRef = useRef<SearchWizardHandle>(null);
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [customerId, setCustomerId] = useState(selectedId);
  const [chatOpen, setChatOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const showChat = searchCreateChatVisible(step);

  useEffect(() => {
    if (!draftId) return;
    if (searchParams.get("draftId") === draftId) return;
    router.replace(searchCreatePath(draftId));
  }, [draftId, router, searchParams]);

  return (
    <div className="mx-auto w-full max-w-7xl" data-testid="ops-search-create">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start" data-testid="ops-search-create-frame">
        <div className="min-w-0 flex-1 space-y-6">
          <SearchCreateChrome
            step={step}
            draftId={draftId}
            chatOpen={chatOpen && showChat}
            showChatToggle={showChat}
            onChatToggle={() => setChatOpen((open) => !open)}
            onStepSelect={(next) => wizardRef.current?.setStep(next)}
          />
          {toast ? (
            <p
              data-testid="ops-campaign-chat-toast"
              className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-400"
            >
              {toast}
            </p>
          ) : null}
          <SearchWizard
            ref={wizardRef}
            accounts={accounts}
            connected={status.connected}
            onFinished={refreshAudit}
            initialDraftId={initialDraftId}
            onStepChange={setStep}
            onDraftIdChange={setDraftId}
            onCustomerIdChange={setCustomerId}
          />
        </div>
        {showChat ? (
          <CampaignChat
            draftId={draftId}
            customerId={customerId || selectedId}
            connected={status.connected}
            open={chatOpen}
            onOpenChange={setChatOpen}
            wizard={wizardRef}
            onToast={setToast}
          />
        ) : null}
      </div>
    </div>
  );
}

function SearchCreateChrome({
  step,
  draftId,
  chatOpen,
  showChatToggle,
  onChatToggle,
  onStepSelect,
}: {
  step: number;
  draftId: string | null;
  chatOpen: boolean;
  showChatToggle: boolean;
  onChatToggle: () => void;
  onStepSelect: (step: number) => void;
}) {
  return (
    <section data-testid="ops-search-create-chrome" className="ops-focus-chrome rounded-2xl border bg-ink-900 p-5">
      <nav className="font-mono text-xs text-moss-500" aria-label="Create Search">
        <Link href="/ops/campaigns" className="text-lime-400 hover:underline">
          Campaigns
        </Link>
        <span className="mx-2">/</span>
        <span className="text-paper-50">Create Search</span>
      </nav>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-lime-400">
            Search Campaign Create
          </p>
          <h1 className="mt-1 text-2xl font-medium text-paper-50">New Search campaign</h1>
          <p className="mt-1 font-mono text-xs text-moss-500">
            {draftId ? `Draft ${draftId}` : "New draft"} · PAUSED
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-moss-500">Status</p>
          <p className="mt-1 font-mono text-sm text-amber-400">Dry-run default</p>
        </div>
      </header>

      <p className="mt-3 text-xs text-amber-400/90">{SEARCH_CREATE_NOTE}</p>

      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Create steps" data-testid="ops-search-create-steps">
        {SEARCH_CREATE_STEPS.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              data-testid={`ops-search-create-step-${item.id}`}
              onClick={() => {
                if (index <= step || (index === 8 && step === 8)) onStepSelect(index);
              }}
              className={`rounded-full px-3 py-1 font-mono text-xs ${
                index === step
                  ? "bg-lime-400 text-ink-950"
                  : index < step
                    ? "border border-lime-400/40 text-lime-400"
                    : "border border-ink-700 text-moss-500"
              }`}
            >
              {item.id} {item.title}
            </button>
          </li>
        ))}
      </ol>

      {showChatToggle ? (
        <div className="mt-4">
          <button type="button" data-testid="ops-campaign-chat" className="ops-btn-secondary" onClick={onChatToggle}>
            {chatOpen ? "Hide chat" : "Open chat"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
