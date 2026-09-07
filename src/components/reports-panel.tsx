"use client";

import { useCallback, useEffect, useState } from "react";

import { defaultMetricWindow, formatMoneyMicros } from "@/lib/metrics";
import { CAMPAIGN_REPORTS_NOTE } from "@/lib/safety";
import type { CampaignReportJobView } from "@/lib/types";

type ReportsResponse = {
  ok: boolean;
  reports?: CampaignReportJobView[];
  report?: CampaignReportJobView;
  dryRun?: boolean;
  persisted?: boolean;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  warnings?: string[];
  error?: string;
  hint?: string;
  safety?: { note?: string };
};

function formatCount(value: string | null | undefined): string {
  if (value == null || value === "") return "0";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric);
}

export function ReportsPanel({
  customerId,
  connected,
  onFinished,
}: {
  customerId: string;
  connected: boolean;
  onFinished: () => Promise<void> | void;
}) {
  const defaults = defaultMetricWindow();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [jobs, setJobs] = useState<CampaignReportJobView[]>([]);
  const [current, setCurrent] = useState<CampaignReportJobView | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<"preview" | "generate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!connected || !customerId) {
      setJobs([]);
      setCurrent(null);
      setPreview(false);
      return;
    }
    const res = await fetch(`/api/ads/reports?customerId=${encodeURIComponent(customerId)}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as ReportsResponse;
    if (!json.ok) {
      setError([json.error, json.hint].filter(Boolean).join(" — ") || "Unable to load reports.");
      return;
    }
    setError(null);
    setJobs(json.reports ?? []);
    setCurrent((existing) => existing ?? json.reports?.[0] ?? null);
    setPreview(false);
  }, [connected, customerId]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  async function runReport(dryRun: boolean) {
    if (!customerId) return;
    setBusy(dryRun ? "preview" : "generate");
    setError(null);
    try {
      const res = await fetch("/api/ads/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId, dryRun, dateFrom, dateTo }),
      });
      const json = (await res.json()) as ReportsResponse;
      if (!json.ok) {
        setError([json.error, json.hint].filter(Boolean).join(" — ") || "Report failed.");
        return;
      }
      const report = json.report ?? null;
      setCurrent(report);
      setPreview(Boolean(json.dryRun));
      setNote(
        json.dryRun
          ? `Dry-run preview: ${report?.summary.campaignCount ?? 0} campaigns. Neon was not written.`
          : `Generated report for ${report?.summary.campaignCount ?? 0} campaigns. Read-only — live Ads status and spend were not changed.`,
      );
      if (json.warnings?.length) {
        setNote((existing) => [existing, ...json.warnings!].filter(Boolean).join(" "));
      }
      if (!json.dryRun) {
        await loadJobs();
      }
      await onFinished();
    } finally {
      setBusy(null);
    }
  }

  const summary = current?.summary;
  const currency = summary?.currencyCode ?? "USD";
  const windowLabel = `${dateFrom} → ${dateTo}`;

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-reports">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg text-white">Performance reports</h2>
          <p className="mt-1 text-sm text-moss-400">
            Read-only rollup from Neon{" "}
            <code className="font-mono text-moss-300">CampaignMetricSnapshot</code> or{" "}
            <code className="font-mono text-moss-300">googleAds:search</code>. Never enables,
            unpauses, or spends. Cached ENABLED is a snapshot only.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 font-mono text-xs text-moss-400">
            From
            <input
              type="date"
              data-testid="ops-reports-date-from"
              className="input py-1"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 font-mono text-xs text-moss-400">
            To
            <input
              type="date"
              data-testid="ops-reports-date-to"
              className="input py-1"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <button
            type="button"
            data-testid="ops-reports-preview"
            onClick={() => void runReport(true)}
            disabled={!connected || !customerId || busy !== null}
            className="ops-btn-primary"
          >
            {busy === "preview" ? "Previewing…" : "Preview"}
          </button>
          <button
            type="button"
            data-testid="ops-reports-generate"
            onClick={() => void runReport(false)}
            disabled={!connected || !customerId || busy !== null}
            className="ops-btn-secondary"
          >
            {busy === "generate" ? "Generating…" : "Generate report"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-amber-400/90">{CAMPAIGN_REPORTS_NOTE}</p>
      {error ? <p className="mt-3 text-sm text-coral-400">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-amber-400">{note}</p> : null}
      {preview ? (
        <p className="mt-2 font-mono text-xs text-lime-400">Preview only — not written to Neon.</p>
      ) : null}
      <p className="mt-2 font-mono text-xs text-moss-500">
        Window {windowLabel}
        {current
          ? ` · ${current.source} · ${current.dryRun ? "dry-run" : "persisted"} · neverEnable yes`
          : ""}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Spend" value={formatMoneyMicros(summary?.spendMicros, currency)} />
        <Stat label="Clicks" value={formatCount(summary?.clicks)} />
        <Stat label="Impressions" value={formatCount(summary?.impressions)} />
        <Stat label="Conversions" value={formatCount(summary?.conversionsText)} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm" data-testid="ops-reports-table">
          <thead className="text-moss-500">
            <tr>
              <th className="pb-2 font-medium">Campaign</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Spend</th>
              <th className="pb-2 font-medium">Clicks</th>
              <th className="pb-2 font-medium">Impr.</th>
              <th className="pb-2 font-medium">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {!customerId ? (
              <tr>
                <td colSpan={7} className="py-6 text-moss-500">
                  Select a customer in the top bar, then preview or generate a report.
                </td>
              </tr>
            ) : !current || current.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-moss-500">
                  {connected
                    ? "No report rows yet. Preview is the default — it uses the metrics cache or a read-only search."
                    : "Connect Google Ads to build a performance report."}
                </td>
              </tr>
            ) : (
              current.rows.map((row) => {
                const enabled = String(row.campaignStatus ?? "").toUpperCase() === "ENABLED";
                return (
                  <tr key={`${row.externalCampaignId}-${row.campaignName}`} className="border-t border-ink-700">
                    <td className="py-3">
                      <span className="text-white">{row.campaignName}</span>
                      <span className="mt-1 block font-mono text-xs text-moss-500">
                        {row.externalCampaignId}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-xs text-moss-300">
                      {row.advertisingChannelType ?? "—"}
                    </td>
                    <td className="py-3 font-mono text-xs">
                      {row.campaignStatus ?? "—"}
                      {enabled ? (
                        <span className="mt-1 block text-amber-400">snapshot only</span>
                      ) : null}
                    </td>
                    <td className="py-3 font-mono text-xs text-white">
                      {formatMoneyMicros(row.spendMicros, currency)}
                    </td>
                    <td className="py-3 font-mono text-xs text-moss-300">{formatCount(row.clicks)}</td>
                    <td className="py-3 font-mono text-xs text-moss-300">{formatCount(row.impressions)}</td>
                    <td className="py-3 font-mono text-xs text-moss-300">
                      {formatCount(row.conversionsText)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {jobs.length > 0 ? (
        <ol className="mt-4 space-y-2 font-mono text-xs text-moss-400" data-testid="ops-reports-history">
          {jobs.map((job) => (
            <li key={job.id ?? job.createdAt}>
              {job.dateFrom} → {job.dateTo} · {job.source} · {job.summary.campaignCount}c · spend{" "}
              {formatMoneyMicros(job.summary.spendMicros, job.summary.currencyCode ?? currency)}
              {job.summary.enabledSnapshotCount
                ? ` · ${job.summary.enabledSnapshotCount} ENABLED snapshot-only`
                : ""}
            </li>
          ))}
        </ol>
      ) : null}
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
