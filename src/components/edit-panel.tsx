"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CONFIRM_EDIT_PHRASE, CAMPAIGN_EDIT_NOTE } from "@/lib/safety";
import { GEO_PRESETS, LANGUAGE_PRESETS } from "@/lib/search-draft";
import { formatMoneyMicros } from "@/lib/metrics";
import type {
  CampaignEditDraftView,
  CampaignMetricSnapshotView,
  SyncedCampaignView,
} from "@/lib/types";

type ListingsResponse = {
  ok: boolean;
  campaigns?: SyncedCampaignView[];
  error?: string;
  hint?: string;
};

type MetricsResponse = {
  ok: boolean;
  snapshots?: CampaignMetricSnapshotView[];
};

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

function dollarsFromMicros(micros: string | null | undefined): string {
  if (!micros) return "";
  const n = Number(micros) / 1_000_000;
  return Number.isFinite(n) ? String(n) : "";
}

function microsFromDollars(value: string): number | null {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n)) return null;
  return Math.round(n * 1_000_000);
}

export function EditPanel({
  customerId,
  connected,
  onFinished,
}: {
  customerId: string;
  connected: boolean;
  onFinished: () => Promise<void> | void;
}) {
  const [campaigns, setCampaigns] = useState<SyncedCampaignView[]>([]);
  const [snapshots, setSnapshots] = useState<CampaignMetricSnapshotView[]>([]);
  const [selectedId, setSelectedId] = useState("");
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
  const confirmRef = useRef<HTMLInputElement>(null);

  const selected = campaigns.find((row) => row.externalId === selectedId) ?? null;
  const snapshot = snapshots.find((row) => row.externalCampaignId === selectedId) ?? null;
  const firstGroup = selected?.adGroups[0] ?? null;

  const loadSources = useCallback(async () => {
    if (!connected || !customerId) {
      setCampaigns([]);
      setSnapshots([]);
      setSelectedId("");
      return;
    }
    const [listingsRes, metricsRes] = await Promise.all([
      fetch(`/api/ads/listings?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }),
      fetch(`/api/ads/metrics?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }),
    ]);
    const listings = (await listingsRes.json()) as ListingsResponse;
    const metrics = (await metricsRes.json()) as MetricsResponse;
    if (!listings.ok) {
      setError([listings.error, listings.hint].filter(Boolean).join(" — ") || "Unable to load cached campaigns.");
      return;
    }
    setError(null);
    const next = listings.campaigns ?? [];
    setCampaigns(next);
    setSnapshots(metrics.snapshots ?? []);
    setSelectedId((current) => current || next[0]?.externalId || "");
  }, [connected, customerId]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (!selected) return;
    setProposedName(selected.name);
    setProposedBudget(dollarsFromMicros(snapshot?.budgetAmountMicros ?? null));
    setProposedBid("");
    setGeo("");
    setLanguage("");
    setDraft(null);
    setNote(null);
  }, [selected, snapshot?.budgetAmountMicros]);

  function buildPayload() {
    if (!selected) return null;
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
      syncedCampaignId: selected.id || undefined,
      campaignExternalId: selected.externalId,
      googleCampaignResourceName: selected.resourceName,
      budgetResourceName: snapshot?.budgetResourceName ?? null,
      advertisingChannelType: selected.advertisingChannelType,
      currentName: selected.name,
      proposedName: proposedName.trim() || selected.name,
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
    if (!payload) throw new Error("Select a synced campaign first.");
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
    if (!selected) return;
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
          <h2 className="text-lg text-white">Safe campaign edit</h2>
          <p className="mt-1 text-sm text-moss-400">
            Edit synced / cached campaigns. Validate first (dry-run default). Apply requires{" "}
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
      {error ? <p className="mt-3 text-sm text-coral-400">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-amber-400">{note}</p> : null}

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
                  Select an accessible customer, then sync listings (and optionally metrics).
                </td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-moss-500">
                  {connected
                    ? "No cached campaigns. Preview or cache listings above first."
                    : "Connect Google Ads to edit cached campaigns."}
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => {
                const metric = snapshots.find((row) => row.externalCampaignId === campaign.externalId);
                return (
                  <tr key={campaign.externalId} className="border-t border-ink-700">
                    <td className="py-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="radio"
                          name="edit-campaign"
                          className="mt-1 accent-lime-400"
                          checked={selectedId === campaign.externalId}
                          onChange={() => setSelectedId(campaign.externalId)}
                          data-testid={`ops-edit-select-${campaign.externalId}`}
                        />
                        <span>
                          <span className="block text-white">{campaign.name}</span>
                          <span className="mt-1 block font-mono text-xs text-moss-500">
                            {campaign.externalId}
                          </span>
                        </span>
                      </label>
                    </td>
                    <td className="py-3 font-mono text-xs text-moss-300">
                      {campaign.advertisingChannelType ?? "—"}
                    </td>
                    <td className="py-3 font-mono text-xs">{campaign.status ?? "—"}</td>
                    <td className="py-3 font-mono text-xs text-moss-300">
                      {formatMoneyMicros(metric?.budgetAmountMicros)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-moss-400">
          Proposed name
          <input
            data-testid="ops-edit-name"
            value={proposedName}
            onChange={(event) => setProposedName(event.target.value)}
            className="input mt-1"
          />
        </label>
        <label className="block text-sm text-moss-400">
          Proposed daily budget (USD)
          <input
            data-testid="ops-edit-budget"
            value={proposedBudget}
            onChange={(event) => setProposedBudget(event.target.value)}
            className="input mt-1 font-mono"
            inputMode="decimal"
          />
        </label>
        <label className="block text-sm text-moss-400">
          Proposed ad group bid (USD){firstGroup ? ` · ${firstGroup.name}` : ""}
          <input
            data-testid="ops-edit-bid"
            value={proposedBid}
            onChange={(event) => setProposedBid(event.target.value)}
            className="input mt-1 font-mono"
            inputMode="decimal"
            placeholder="optional"
          />
        </label>
        <label className="block text-sm text-moss-400">
          Targeting-safe geo
          <select
            data-testid="ops-edit-geo"
            value={geo}
            onChange={(event) => setGeo(event.target.value)}
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
          <select
            data-testid="ops-edit-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
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
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="ops-edit-validate"
          onClick={() => void runAction("validate")}
          disabled={!connected || !selected || busy !== null}
          className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-50"
        >
          {busy === "validate" ? "Validating…" : "Validate (dry-run)"}
        </button>
        <button
          type="button"
          data-testid="ops-edit-apply"
          onClick={() => void runAction("apply")}
          disabled={!connected || !selected || busy !== null || dryRun}
          className="rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-400 hover:bg-amber-400/10 disabled:opacity-50"
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
