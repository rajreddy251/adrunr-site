"use client";

import { useCallback, useEffect, useState } from "react";

import { formatMoneyMicros } from "@/lib/metrics";
import { CAMPAIGN_IMPORT_NOTE } from "@/lib/safety";
import type {
  CampaignImportJobView,
  CampaignImportPreviewView,
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

type ImportResponse = {
  ok: boolean;
  dryRun?: boolean;
  persisted?: boolean;
  job?: CampaignImportJobView;
  preview?: CampaignImportPreviewView;
  draftId?: string | null;
  warnings?: string[];
  error?: string;
  hint?: string;
  safety?: { note?: string };
};

type JobsResponse = {
  ok: boolean;
  jobs?: CampaignImportJobView[];
};

export function ImportPanel({
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
  const [jobs, setJobs] = useState<CampaignImportJobView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<CampaignImportPreviewView | null>(null);
  const [job, setJob] = useState<CampaignImportJobView | null>(null);

  const selected = campaigns.find((row) => row.externalId === selectedId || row.id === selectedId) ?? null;
  const snapshot = snapshots.find((row) => row.externalCampaignId === selected?.externalId) ?? null;

  const loadSources = useCallback(async () => {
    if (!connected || !customerId) {
      setCampaigns([]);
      setSnapshots([]);
      setJobs([]);
      setSelectedId("");
      return;
    }
    const [listingsRes, metricsRes, jobsRes] = await Promise.all([
      fetch(`/api/ads/listings?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }),
      fetch(`/api/ads/metrics?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }),
      fetch(`/api/ads/imports?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }),
    ]);
    const listings = (await listingsRes.json()) as ListingsResponse;
    const metrics = (await metricsRes.json()) as MetricsResponse;
    const importJobs = (await jobsRes.json()) as JobsResponse;
    if (!listings.ok) {
      setError([listings.error, listings.hint].filter(Boolean).join(" — ") || "Unable to load cached campaigns.");
      return;
    }
    setError(null);
    const next = listings.campaigns ?? [];
    setCampaigns(next);
    setSnapshots(metrics.snapshots ?? []);
    setJobs(importJobs.jobs ?? []);
    setSelectedId((current) => current || next[0]?.externalId || "");
  }, [connected, customerId]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    setPreview(null);
    setJob(null);
    setNote(null);
  }, [selectedId]);

  async function runImport() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ads/imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId,
          syncedCampaignId: selected.id || undefined,
          campaignExternalId: selected.externalId,
          dryRun,
        }),
      });
      const json = (await res.json()) as ImportResponse;
      if (!json.ok) {
        setError([json.error, json.hint].filter(Boolean).join(" — ") || "Import failed.");
        return;
      }
      setPreview(json.preview ?? json.job?.preview ?? null);
      setJob(json.job ?? null);
      setNote(
        json.dryRun
          ? `Preview only — ${json.preview?.draftKind ?? "draft"} "${json.preview?.name ?? ""}" was not written. Import never enables spend.`
          : `Imported ${json.preview?.draftKind ?? "draft"} ${json.draftId ?? json.job?.draftId ?? ""}. ${json.job?.wizardHint ?? "Open the matching wizard to CREATE PAUSED."}`,
      );
      if (json.warnings?.length) {
        setNote((current) => [current, ...json.warnings!].filter(Boolean).join(" "));
      }
      await loadSources();
      await onFinished();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-import">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg text-white">Import to draft</h2>
          <p className="mt-1 text-sm text-moss-400">
            Pick a cached <code className="font-mono text-moss-300">SyncedCampaign</code>, preview the
            create-type mapping, then import. Dry-run is the default. Imported drafts stay on the{" "}
            <span className="text-moss-300">PAUSED</span> create path — never enable / unpause.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-mono text-xs text-moss-400">
            <input
              type="checkbox"
              className="accent-lime-400"
              checked={dryRun}
              onChange={(event) => setDryRun(event.target.checked)}
              data-testid="ops-import-dry-run"
            />
            Dry-run (default)
          </label>
          <button
            type="button"
            data-testid="ops-import-run"
            onClick={() => void runImport()}
            disabled={!connected || !customerId || !selected || busy}
            className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-50"
          >
            {busy ? "Working…" : dryRun ? "Preview import" : "Import to draft"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-amber-400/90">{CAMPAIGN_IMPORT_NOTE}</p>
      {error ? <p className="mt-3 text-sm text-coral-400">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-amber-400">{note}</p> : null}

      {!campaigns.length ? (
        <p className="mt-4 text-sm text-moss-500">
          No cached campaigns. Run Synced listings with dry-run off first, then return here.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-moss-500">
                  <th className="pb-2 font-medium">Cached campaign</th>
                  <th className="pb-2 font-medium">Channel</th>
                  <th className="pb-2 font-medium">Snapshot status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.externalId} className="border-t border-ink-700">
                    <td className="py-2">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="radio"
                          name="import-campaign"
                          className="mt-1 accent-lime-400"
                          checked={selectedId === campaign.externalId}
                          onChange={() => setSelectedId(campaign.externalId)}
                          data-testid={`ops-import-pick-${campaign.externalId}`}
                        />
                        <span>
                          <span className="block text-white">{campaign.name}</span>
                          <span className="font-mono text-xs text-moss-500">{campaign.externalId}</span>
                        </span>
                      </label>
                    </td>
                    <td className="py-2 font-mono text-xs text-moss-300">
                      {campaign.advertisingChannelType ?? "—"}
                    </td>
                    <td className="py-2 font-mono text-xs">
                      {campaign.status ?? "—"}
                      {campaign.status === "ENABLED" ? (
                        <span className="ml-2 text-amber-400">snapshot only</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="rounded-xl border border-ink-700 bg-ink-950 p-3 text-sm text-moss-400">
            <p className="text-xs uppercase tracking-wide text-moss-500">Selected</p>
            {selected ? (
              <>
                <p className="mt-2 text-white">{selected.name}</p>
                <p className="font-mono text-xs text-moss-500">
                  {selected.advertisingChannelType} · {selected.adGroups.length} ad groups
                </p>
                <p className="mt-2 font-mono text-xs">
                  Snapshot budget {formatMoneyMicros(snapshot?.budgetAmountMicros ?? null)}
                </p>
                <p className="mt-2 text-xs text-amber-400/90">
                  Cached ENABLED never becomes an enable path. Import creates a new draft named
                  &quot;(import)&quot;.
                </p>
              </>
            ) : (
              <p className="mt-2">Pick a cached campaign.</p>
            )}
          </aside>
        </div>
      )}

      {preview ? (
        <div className="mt-4 rounded-xl border border-ink-700 bg-ink-950 p-4" data-testid="ops-import-preview">
          <p className="text-sm text-white">
            {preview.draftKind} → {preview.name}
          </p>
          <dl className="mt-3 grid gap-2 text-xs text-moss-400 sm:grid-cols-2">
            <div>
              <dt className="text-moss-500">Source status</dt>
              <dd className="font-mono text-moss-300">{preview.sourceStatus ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-moss-500">Apply path</dt>
              <dd className="font-mono text-lime-400">{preview.applyPath}</dd>
            </div>
            <div>
              <dt className="text-moss-500">Budget micros</dt>
              <dd className="font-mono text-moss-300">{preview.dailyBudgetMicros}</dd>
            </div>
            <div>
              <dt className="text-moss-500">Safe defaults</dt>
              <dd className="font-mono text-moss-300">
                {preview.usedSafeDefaults.length ? preview.usedSafeDefaults.join(", ") : "none"}
              </dd>
            </div>
          </dl>
          {preview.warnings.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-400">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {job?.draftId ? (
            <p className="mt-3 font-mono text-xs text-lime-400">
              Draft {job.draftId} · {job.wizardHint}
            </p>
          ) : null}
        </div>
      ) : null}

      {jobs.length ? (
        <ol className="mt-4 space-y-2 font-mono text-xs text-moss-400">
          {jobs.slice(0, 5).map((row) => (
            <li key={row.id} className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2">
              <span className="text-moss-500">{row.createdAt}</span>{" "}
              <span className="text-lime-400">{row.dryRun ? "preview" : "imported"}</span> · {row.draftKind} ·{" "}
              {row.sourceCampaignName}
              {row.draftId ? ` · draft ${row.draftId}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
