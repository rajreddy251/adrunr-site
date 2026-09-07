"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CAMPAIGN_CHAT_PROPOSED_MARK, chatProposalMarks, type CampaignChatProposal } from "@/lib/campaign-chat";
import {
  dollarsFromMicros,
  isEditApplyReady,
  microsFromDollars,
  validateCampaignEditForm,
  type CampaignEditFieldErrors,
} from "@/lib/ops-campaign";
import { CONFIRM_EDIT_PHRASE, CAMPAIGN_EDIT_NOTE } from "@/lib/safety";
import { GEO_PRESETS, LANGUAGE_PRESETS } from "@/lib/search-draft";
import { formatMoneyMicros } from "@/lib/metrics";
import type {
  CampaignEditDraftView,
  CampaignMetricSnapshotView,
  SyncedCampaignView,
} from "@/lib/types";

type EditResponse = {
  ok: boolean;
  draft?: CampaignEditDraftView;
  dryRun?: boolean;
  applied?: boolean;
  source?: string;
  error?: string;
  hint?: string;
  safety?: { note?: string };
};

export function EditPanel({
  customerId,
  connected,
  onFinished,
  campaignId,
  campaign,
  snapshot,
  sourceError,
  chatProposal,
}: {
  customerId: string;
  connected: boolean;
  onFinished: () => Promise<void> | void;
  campaignId: string;
  campaign: SyncedCampaignView | null;
  snapshot: CampaignMetricSnapshotView | null;
  sourceError?: string | null;
  chatProposal?: CampaignChatProposal | null;
}) {
  const [proposedName, setProposedName] = useState("");
  const [proposedBudget, setProposedBudget] = useState("");
  const [proposedBid, setProposedBid] = useState("");
  const [geo, setGeo] = useState("");
  const [language, setLanguage] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<CampaignEditDraftView | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [chatMarks, setChatMarks] = useState<string[]>([]);
  const confirmRef = useRef<HTMLInputElement>(null);
  const hydratedCampaignId = useRef<string>("");
  const budgetTouched = useRef(false);
  const appliedProposalId = useRef<string>("");

  const firstGroup = campaign?.adGroups[0] ?? null;
  const currentBudget = dollarsFromMicros(snapshot?.budgetAmountMicros ?? null);

  useEffect(() => {
    if (!campaign) return;
    if (hydratedCampaignId.current === campaign.externalId) {
      if (!budgetTouched.current && snapshot?.budgetAmountMicros) {
        setProposedBudget(dollarsFromMicros(snapshot.budgetAmountMicros));
      }
      return;
    }
    hydratedCampaignId.current = campaign.externalId;
    budgetTouched.current = false;
    setProposedName(campaign.name);
    setProposedBudget(dollarsFromMicros(snapshot?.budgetAmountMicros ?? null));
    setProposedBid("");
    setGeo("");
    setLanguage("");
    setDraft(null);
    setNote(null);
    setError(null);
    setShowErrors(false);
    setConfirmPhrase("");
    setChatMarks([]);
    appliedProposalId.current = "";
  }, [campaign, snapshot?.budgetAmountMicros]);

  useEffect(() => {
    if (!chatProposal || appliedProposalId.current === chatProposal.id) return;
    appliedProposalId.current = chatProposal.id;
    if (chatProposal.proposedName) setProposedName(chatProposal.proposedName);
    if (chatProposal.proposedBudget) {
      budgetTouched.current = true;
      setProposedBudget(chatProposal.proposedBudget);
    }
    if (chatProposal.proposedBid) setProposedBid(chatProposal.proposedBid);
    if (chatProposal.geo) setGeo(chatProposal.geo);
    if (chatProposal.language) setLanguage(chatProposal.language);
    setChatMarks(chatProposalMarks(chatProposal));
  }, [chatProposal]);

  const fieldErrors = useMemo(
    () =>
      validateCampaignEditForm({
        proposedName,
        proposedBudget,
        proposedBid,
        geo,
        language,
        currentName: campaign?.name ?? "",
        currentBudget,
        confirmPhrase,
        dryRun,
      }),
    [campaign?.name, confirmPhrase, currentBudget, dryRun, geo, language, proposedBid, proposedBudget, proposedName],
  );

  const applyReady = isEditApplyReady({
    connected: connected && Boolean(campaign),
    dryRun,
    confirmPhrase,
    errors: fieldErrors,
  });

  function visibleError(key: keyof CampaignEditFieldErrors): string | undefined {
    if (!showErrors) {
      if (key === "confirmPhrase" && fieldErrors.confirmPhrase) return fieldErrors.confirmPhrase;
      return undefined;
    }
    return fieldErrors[key];
  }

  function buildPayload() {
    if (!campaign) return null;
    const budgetMicros = microsFromDollars(proposedBudget);
    const bidMicros = microsFromDollars(proposedBid);
    const targets = [
      ...GEO_PRESETS.filter((row) => row.criterionText === geo).map((row) => ({
        type: "GEO" as const,
        valueText: row.valueText,
        criterionText: row.criterionText,
        included: true,
      })),
      ...LANGUAGE_PRESETS.filter((row) => row.criterionText === language).map((row) => ({
        type: "LANGUAGE" as const,
        valueText: row.valueText,
        criterionText: row.criterionText,
        included: true,
      })),
    ];
    return {
      customerId,
      syncedCampaignId: campaign.id || undefined,
      campaignExternalId: campaign.externalId,
      googleCampaignResourceName: campaign.resourceName,
      budgetResourceName: snapshot?.budgetResourceName ?? null,
      advertisingChannelType: campaign.advertisingChannelType,
      currentName: campaign.name,
      proposedName: proposedName.trim() || campaign.name,
      currentDailyBudgetMicros: snapshot?.budgetAmountMicros ?? null,
      proposedDailyBudgetMicros: budgetMicros,
      bids:
        bidMicros != null && firstGroup
          ? [
              {
                adGroupExternalId: firstGroup.externalId,
                googleAdGroupResourceName: firstGroup.resourceName,
                adGroupName: firstGroup.name,
                proposedBidMicros: bidMicros,
              },
            ]
          : [],
      targets,
    };
  }

  async function upsertDraft() {
    const payload = buildPayload();
    if (!payload) throw new Error("Open a cached campaign first.");
    if (draft?.id) {
      const res = await fetch(`/api/ads/edits/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as EditResponse;
      if (!json.ok || !json.draft) {
        throw Object.assign(new Error(json.error || "Unable to update edit draft."), { hint: json.hint });
      }
      setDraft(json.draft);
      return json.draft;
    }
    const res = await fetch("/api/ads/edits/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as EditResponse;
    if (!json.ok || !json.draft) {
      throw Object.assign(new Error(json.error || "Unable to create edit draft."), { hint: json.hint });
    }
    setDraft(json.draft);
    return json.draft;
  }

  async function runAction(kind: "validate" | "apply") {
    if (!campaign) return;
    setShowErrors(true);
    if (kind === "apply" && !applyReady) return;
    if (kind === "validate" && (fieldErrors.proposedName || fieldErrors.proposedBudget || fieldErrors.proposedBid || fieldErrors.change)) {
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      const saved = await upsertDraft();
      const typedPhrase = (confirmRef.current?.value ?? confirmPhrase).trim();
      const res = await fetch(`/api/ads/edits/drafts/${saved.id}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmPhrase: kind === "apply" ? typedPhrase : undefined,
        }),
      });
      const json = (await res.json()) as EditResponse;
      if (!json.ok) {
        setError([json.error, json.hint].filter(Boolean).join(" — ") || "Edit failed.");
        return;
      }
      if (json.draft) setDraft(json.draft);
      setNote(
        json.safety?.note ||
          (json.dryRun
            ? "validateOnly — safe edit checked, not applied."
            : "Safe edit applied. Campaign status was not enabled."),
      );
      await onFinished();
    } catch (err) {
      const failure = err as { message?: string; hint?: string };
      setError([failure.message, failure.hint].filter(Boolean).join(" — ") || "Edit failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-edit">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg text-paper-50">Safe campaign edit</h2>
          <p className="mt-1 text-sm text-moss-400">
            EDIT SAFE workspace for this campaign. Validate first (dry-run default). Apply requires{" "}
            <code className="font-mono text-moss-300">{CONFIRM_EDIT_PHRASE}</code>. Name, budget, bids,
            and GEO/LANGUAGE only — never enable or unpause.
          </p>
        </div>
        <label className="flex items-center gap-2 font-mono text-xs text-moss-400">
          <input
            type="checkbox"
            className="accent-lime-400"
            checked={dryRun}
            onChange={(event) => setDryRun(event.target.checked)}
            data-testid="ops-edit-dry-run"
          />
          Dry-run (default)
        </label>
      </div>

      <p className="mt-3 text-xs text-amber-400/90">{CAMPAIGN_EDIT_NOTE}</p>
      {sourceError ? <p className="mt-3 text-sm text-coral-400">{sourceError}</p> : null}
      {error ? <p className="mt-3 text-sm text-coral-400">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-amber-400">{note}</p> : null}
      {visibleError("change") ? (
        <p data-testid="ops-edit-change-error" className="mt-3 text-sm text-coral-400">
          {visibleError("change")}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm" data-testid="ops-edit-table">
          <thead className="text-moss-500">
            <tr>
              <th className="pb-2 font-medium">Campaign</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Cached status</th>
              <th className="pb-2 font-medium">Budget</th>
            </tr>
          </thead>
          <tbody>
            {!customerId ? (
              <tr>
                <td colSpan={4} className="py-6 text-moss-500">
                  Select a customer in the top bar, then sync listings (and optionally metrics).
                </td>
              </tr>
            ) : !campaign ? (
              <tr>
                <td colSpan={4} className="py-6 text-moss-500">
                  {connected
                    ? `Known id ${campaignId} is not in the listings cache. Preview or cache listings first.`
                    : "Connect Google Ads to edit cached campaigns."}
                </td>
              </tr>
            ) : (
              <tr className="border-t border-ink-700">
                <td className="py-3">
                  <span className="block text-paper-50">{campaign.name}</span>
                  <span className="mt-1 block font-mono text-xs text-moss-500">{campaign.externalId}</span>
                </td>
                <td className="py-3 font-mono text-xs text-moss-300">
                  {campaign.advertisingChannelType ?? "—"}
                </td>
                <td className="py-3 font-mono text-xs">{campaign.status ?? "—"}</td>
                <td className="py-3 font-mono text-xs text-moss-300">
                  {formatMoneyMicros(snapshot?.budgetAmountMicros)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-moss-400">
          Proposed name
          {chatMarks.includes("proposedName") ? (
            <span data-testid="ops-edit-chat-mark-name" className="ml-2 font-mono text-[10px] uppercase tracking-wide text-lime-400">
              {CAMPAIGN_CHAT_PROPOSED_MARK}
            </span>
          ) : null}
          <input
            data-testid="ops-edit-name"
            value={proposedName}
            onChange={(event) => {
              setProposedName(event.target.value);
              setChatMarks((marks) => marks.filter((mark) => mark !== "proposedName"));
            }}
            className="input mt-1"
            aria-invalid={Boolean(visibleError("proposedName"))}
          />
          {visibleError("proposedName") ? (
            <span data-testid="ops-edit-name-error" className="mt-1 block text-xs text-coral-400">
              {visibleError("proposedName")}
            </span>
          ) : null}
        </label>
        <label className="block text-sm text-moss-400">
          Proposed daily budget (USD)
          {chatMarks.includes("proposedBudget") ? (
            <span data-testid="ops-edit-chat-mark-budget" className="ml-2 font-mono text-[10px] uppercase tracking-wide text-lime-400">
              {CAMPAIGN_CHAT_PROPOSED_MARK}
            </span>
          ) : null}
          <input
            data-testid="ops-edit-budget"
            value={proposedBudget}
            onChange={(event) => {
              budgetTouched.current = true;
              setProposedBudget(event.target.value);
              setChatMarks((marks) => marks.filter((mark) => mark !== "proposedBudget"));
            }}
            className="input mt-1 font-mono"
            inputMode="decimal"
            aria-invalid={Boolean(visibleError("proposedBudget"))}
          />
          {visibleError("proposedBudget") ? (
            <span data-testid="ops-edit-budget-error" className="mt-1 block text-xs text-coral-400">
              {visibleError("proposedBudget")}
            </span>
          ) : null}
        </label>
        <label className="block text-sm text-moss-400">
          Proposed ad group bid (USD){firstGroup ? ` · ${firstGroup.name}` : ""}
          {chatMarks.includes("proposedBid") ? (
            <span data-testid="ops-edit-chat-mark-bid" className="ml-2 font-mono text-[10px] uppercase tracking-wide text-lime-400">
              {CAMPAIGN_CHAT_PROPOSED_MARK}
            </span>
          ) : null}
          <input
            data-testid="ops-edit-bid"
            value={proposedBid}
            onChange={(event) => {
              setProposedBid(event.target.value);
              setChatMarks((marks) => marks.filter((mark) => mark !== "proposedBid"));
            }}
            className="input mt-1 font-mono"
            inputMode="decimal"
            placeholder="optional"
            aria-invalid={Boolean(visibleError("proposedBid"))}
          />
          {visibleError("proposedBid") ? (
            <span data-testid="ops-edit-bid-error" className="mt-1 block text-xs text-coral-400">
              {visibleError("proposedBid")}
            </span>
          ) : null}
        </label>
        <label className="block text-sm text-moss-400">
          Targeting-safe geo
          {chatMarks.includes("geo") ? (
            <span data-testid="ops-edit-chat-mark-geo" className="ml-2 font-mono text-[10px] uppercase tracking-wide text-lime-400">
              {CAMPAIGN_CHAT_PROPOSED_MARK}
            </span>
          ) : null}
          <select
            data-testid="ops-edit-geo"
            value={geo}
            onChange={(event) => {
              setGeo(event.target.value);
              setChatMarks((marks) => marks.filter((mark) => mark !== "geo"));
            }}
            className="input mt-1"
          >
            <option value="">No geo change</option>
            {GEO_PRESETS.map((row) => (
              <option key={row.criterionText} value={row.criterionText}>
                {row.valueText}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-moss-400">
          Targeting-safe language
          {chatMarks.includes("language") ? (
            <span data-testid="ops-edit-chat-mark-language" className="ml-2 font-mono text-[10px] uppercase tracking-wide text-lime-400">
              {CAMPAIGN_CHAT_PROPOSED_MARK}
            </span>
          ) : null}
          <select
            data-testid="ops-edit-language"
            value={language}
            onChange={(event) => {
              setLanguage(event.target.value);
              setChatMarks((marks) => marks.filter((mark) => mark !== "language"));
            }}
            className="input mt-1"
          >
            <option value="">No language change</option>
            {LANGUAGE_PRESETS.map((row) => (
              <option key={row.criterionText} value={row.criterionText}>
                {row.valueText}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-moss-400">
          Confirm phrase for apply
          <input
            ref={confirmRef}
            data-testid="ops-edit-confirm"
            value={confirmPhrase}
            onChange={(event) => setConfirmPhrase(event.target.value)}
            className="input mt-1 font-mono"
            placeholder={CONFIRM_EDIT_PHRASE}
            aria-invalid={Boolean(visibleError("confirmPhrase"))}
          />
          {visibleError("confirmPhrase") ? (
            <span data-testid="ops-edit-confirm-error" className="mt-1 block text-xs text-coral-400">
              {visibleError("confirmPhrase")}
            </span>
          ) : null}
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="ops-edit-validate"
          onClick={() => void runAction("validate")}
          disabled={!connected || !campaign || busy !== null}
          className={dryRun ? "ops-btn-primary" : "ops-btn-secondary"}
        >
          {busy === "validate" ? "Validating…" : "Validate (dry-run)"}
        </button>
        <button
          type="button"
          data-testid="ops-edit-apply"
          onClick={() => void runAction("apply")}
          disabled={!applyReady || busy !== null}
          className="ops-btn-amber"
          data-armed={applyReady ? "true" : "false"}
        >
          {busy === "apply" ? "Applying edit…" : `Apply ${CONFIRM_EDIT_PHRASE}`}
        </button>
      </div>
      {dryRun ? (
        <p className="mt-2 font-mono text-xs text-lime-400">
          Dry-run is on — Apply is locked. Uncheck to type {CONFIRM_EDIT_PHRASE} and mutate safely.
        </p>
      ) : null}
      {draft ? (
        <p className="mt-2 font-mono text-xs text-moss-500">
          Draft {draft.id} · {draft.statusDraft} · fields {draft.fieldKinds.join(", ") || "none"}
        </p>
      ) : null}
    </section>
  );
}
