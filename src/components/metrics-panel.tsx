"use client";

import { useCallback, useEffect, useState } from "react";

import { formatMoneyMicros } from "@/lib/metrics";
import type { CampaignMetricSnapshotView, MetricSyncCounts, SyncJobView } from "@/lib/types";

type MetricsResponse = {
  ok: boolean;
  snapshots?: CampaignMetricSnapshotView[];
  lastJob?: SyncJobView | null;
  source?: string;
  error?: string;
  hint?: string;
  warnings?: string[];
  dryRun?: boolean;
  persisted?: boolean;
  job?: SyncJobView;
  counts?: MetricSyncCounts;
  dateFrom?: string | null;
  dateTo?: string | null;
};

function countSnapshots(snapshots: CampaignMetricSnapshotView[]): MetricSyncCounts {
  return {
    campaigns: snapshots.length,
    withSpend: snapshots.filter((row) => Number(row.costMicros ?? 0) > 0).length,
  };
}

function sumMicros(snapshots: CampaignMetricSnapshotView[], key: "budgetAmountMicros" | "costMicros"): string {
  let total = 0n;
  for (const row of snapshots) {
    const value = row[key];
    if (!value) continue;
    try {
      total += BigInt(value);
    } catch {
      // skip malformed fixture values
    }
  }
  return total.toString();
}

export function MetricsPanel({
  customerId,
  connected,
  onFinished,
}: {
  customerId: string;
  connected: boolean;
  onFinished: () => Promise<void> | void;
}) {
  const [snapshots, setSnapshots] = useState<CampaignMetricSnapshotView[]>([]);
  const [lastJob, setLastJob] = useState<SyncJobView | null>(null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadCache = useCallback(async () => {
    if (!connected || !customerId) {
      setSnapshots([]);
      setLastJob(null);
      setDateFrom(null);
      setDateTo(null);
      setPreview(false);
      return;
    }
    const res = await fetch(`/api/ads/metrics?customerId=${encodeURIComponent(customerId)}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as MetricsResponse;
    if (!json.ok) {
      setError([json.error, json.hint].filter(Boolean).join(" — ") || "Unable to load metric snapshots.");
      return;
    }
    setError(null);
    setSnapshots(json.snapshots ?? []);
    setLastJob(json.lastJob ?? null);
    setDateFrom(json.dateFrom ?? null);
    setDateTo(json.dateTo ?? null);
    setPreview(false);
  }, [connected, customerId]);

  useEffect(() => {
    void loadCache();
  }, [loadCache]);

  async function runSync() {
    if (!customerId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ads/metrics/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId, dryRun }),
      });
      const json = (await res.json()) as MetricsResponse;
      if (!json.ok) {
        setError([json.error, json.hint].filter(Boolean).join(" — ") || "Metrics sync failed.");
        return;
      }
      setSnapshots(json.snapshots ?? []);
      setLastJob(json.job ?? json.lastJob ?? null);
      setDateFrom(json.dateFrom ?? null);
      setDateTo(json.dateTo ?? null);
      setPreview(Boolean(json.dryRun));
      const counts = json.counts ?? countSnapshots(json.snapshots ?? []);
      setNote(
        json.dryRun
          ? `Dry-run preview: ${counts.campaigns} campaigns (${counts.withSpend} with spend). Neon cache was not written.`
          : `Cached ${counts.campaigns} campaign snapshots. Read-only — live Ads status and spend were not changed.`,
      );
      await onFinished();
    } finally {
      setBusy(false);
    }
  }

  const counts = countSnapshots(snapshots);
  const currency = snapshots[0]?.currencyCode ?? "USD";
  const windowLabel = dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : "last 7 days (default)";

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-metrics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg text-white">Budget & spend snapshots</h2>
          <p className="mt-1 text-sm text-moss-400">
            Read-only Google Ads pull into Neon{" "}
            <code className="font-mono text-moss-300">CampaignMetricSnapshot</code>. Reuses{" "}
            <code className="font-mono text-moss-300">SyncJob</code>. Never enables, unpauses, or
            spends.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-mono text-xs text-moss-400">
            <input
              type="checkbox"
              className="accent-lime-400"
              checked={dryRun}
              onChange={(event) => setDryRun(event.target.checked)}
              data-testid="ops-metrics-dry-run"
            />
            Dry-run (default)
          </label>
          <button
            type="button"
            data-testid="ops-metrics-sync"
            onClick={() => void runSync()}
            disabled={!connected || !customerId || busy}
            className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-50"
          >
            {busy ? "Syncing…" : dryRun ? "Preview metrics" : "Sync metrics to cache"}
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-coral-400">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-amber-400">{note}</p> : null}
      {preview ? (
        <p className="mt-2 font-mono text-xs text-lime-400">Preview only — not written to Neon.</p>
      ) : null}
      {lastJob ? (
        <p className="mt-2 font-mono text-xs text-moss-500">
          Last SyncJob {lastJob.status.toLowerCase()} · {lastJob.dryRun ? "dry-run" : "cached"} ·
          read-only {lastJob.readOnly ? "yes" : "no"} · {windowLabel} · {lastJob.createdAt}
          {lastJob.counts
            ? ` · ${lastJob.counts.campaigns}c / ${lastJob.counts.withSpend ?? 0} spend`
            : ""}
        </p>
      ) : (
        <p className="mt-2 font-mono text-xs text-moss-500">Window {windowLabel}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Campaigns" value={String(counts.campaigns)} />
        <Stat label="With spend" value={String(counts.withSpend)} />
        <Stat label="Daily budgets" value={formatMoneyMicros(sumMicros(snapshots, "budgetAmountMicros"), currency)} />
        <Stat label="Spend in window" value={formatMoneyMicros(sumMicros(snapshots, "costMicros"), currency)} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm" data-testid="ops-metrics-table">
          <thead className="text-moss-500">
            <tr>
              <th className="pb-2 font-medium">Campaign</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Daily budget</th>
              <th className="pb-2 font-medium">Spend</th>
              <th className="pb-2 font-medium">Clicks / impr.</th>
            </tr>
          </thead>
          <tbody>
            {!customerId ? (
              <tr>
                <td colSpan={6} className="py-6 text-moss-500">
                  Select an accessible customer above, then preview or cache budget and spend.
                </td>
              </tr>
            ) : snapshots.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-moss-500">
                  {connected
                    ? "No cached metric snapshots yet. Preview metrics (dry-run) is the default."
                    : "Connect Google Ads to sync budget and spend."}
                </td>
              </tr>
            ) : (
              snapshots.map((snapshot) => (
                <tr key={`${snapshot.externalCampaignId}-${snapshot.dateFrom}-${snapshot.dateTo}`} className="border-t border-ink-700">
                  <td className="py-3">
                    <span className="text-white">{snapshot.campaignName}</span>
                    <span className="mt-1 block font-mono text-xs text-moss-500">
                      {snapshot.externalCampaignId}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-xs text-moss-300">
                    {snapshot.advertisingChannelType ?? "—"}
                  </td>
                  <td className="py-3 font-mono text-xs">{snapshot.campaignStatus ?? "—"}</td>
                  <td className="py-3 font-mono text-xs text-moss-300">
                    {formatMoneyMicros(snapshot.budgetAmountMicros, snapshot.currencyCode ?? currency)}
                    {snapshot.budgetPeriod ? (
                      <span className="mt-1 block text-moss-500">{snapshot.budgetPeriod.toLowerCase()}</span>
                    ) : null}
                  </td>
                  <td className="py-3 font-mono text-xs text-white">
                    {formatMoneyMicros(snapshot.costMicros, snapshot.currencyCode ?? currency)}
                    {snapshot.averageCpcMicros ? (
                      <span className="mt-1 block text-moss-500">
                        CPC {formatMoneyMicros(snapshot.averageCpcMicros, snapshot.currencyCode ?? currency)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 font-mono text-xs text-moss-400">
                    {snapshot.clicks ?? "0"} / {snapshot.impressions ?? "0"}
                    {snapshot.conversionsText ? (
                      <span className="mt-1 block text-moss-500">{snapshot.conversionsText} conv.</span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2">
      <p className="text-xs text-moss-500">{label}</p>
      <p className="font-mono text-xl text-white">{value}</p>
    </div>
  );
}
