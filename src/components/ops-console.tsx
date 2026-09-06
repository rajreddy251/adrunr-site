"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { DemandGenWizard, type DemandGenWizardHandle } from "@/components/demand-gen-wizard";
import { DisplayWizard, type DisplayWizardHandle } from "@/components/display-wizard";
import { ListingsPanel } from "@/components/listings-panel";
import { MetricsPanel } from "@/components/metrics-panel";
import { PmaxWizard, type PmaxWizardHandle } from "@/components/pmax-wizard";
import { SearchAssistant } from "@/components/search-assistant";
import { SearchWizard, type SearchWizardHandle } from "@/components/search-wizard";
import { AppWizard, type AppWizardHandle } from "@/components/app-wizard";
import { HotelWizard, type HotelWizardHandle } from "@/components/hotel-wizard";
import { LocalServicesWizard, type LocalServicesWizardHandle } from "@/components/local-services-wizard";
import { LocalWizard, type LocalWizardHandle } from "@/components/local-wizard";
import { ShoppingWizard, type ShoppingWizardHandle } from "@/components/shopping-wizard";
import { VideoWizard, type VideoWizardHandle } from "@/components/video-wizard";
import { SAFETY_COPY } from "@/lib/safety";
import { formatCustomerId, PLATFORM_MCC_DISPLAY } from "@/lib/ids";
import type {
  AdsAccountView,
  AssistantCampaignKind,
  AuditEventView,
  ConnectionStatusView,
  ProviderView,
} from "@/lib/types";

type AccountsResponse = {
  ok: boolean;
  accounts?: AdsAccountView[];
  warnings?: string[];
  source?: string;
  error?: string;
  hint?: string;
  kind?: string;
};

type Ga4Response = {
  ok: boolean;
  softFail: boolean;
  source: string;
  reason?: string;
  report?: {
    propertyId: string;
    note?: string;
    rows?: Array<{ date: string; sessions: number; conversions: number }>;
    totals?: { sessions: number; conversions: number };
  };
};

const emptyStatus: ConnectionStatusView = {
  connected: false,
  mockMode: false,
  email: null,
  source: null,
  oauthConfigured: false,
  adsConfigured: false,
  loginCustomerId: "",
  ga4PropertyId: null,
  scopes: [],
  databaseConfigured: false,
  organizationSlug: null,
  providers: [],
};

export function OpsConsole() {
  const [status, setStatus] = useState<ConnectionStatusView>(emptyStatus);
  const [accounts, setAccounts] = useState<AdsAccountView[]>([]);
  const [accountWarnings, setAccountWarnings] = useState<string[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [ga4, setGa4] = useState<Ga4Response | null>(null);
  const [audit, setAudit] = useState<AuditEventView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/auth/status", { cache: "no-store" });
    const json = (await res.json()) as ConnectionStatusView & { error?: string; hint?: string };
    if (!res.ok) {
      setBanner([json.error, json.hint].filter(Boolean).join(" — ") || "Unable to load status.");
      return emptyStatus;
    }
    setStatus(json);
    return json;
  }, []);

  const loadAccounts = useCallback(async (connected: boolean) => {
    if (!connected) {
      setAccounts([]);
      setAccountWarnings([]);
      setAccountError(null);
      return;
    }
    const res = await fetch("/api/ads/accounts", { cache: "no-store" });
    const json = (await res.json()) as AccountsResponse;
    if (!json.ok) {
      setAccounts([]);
      setAccountError([json.error, json.hint].filter(Boolean).join(" — "));
      setAccountWarnings(json.kind ? [`${json.kind}`] : []);
      return;
    }
    setAccountError(null);
    setAccounts(json.accounts ?? []);
    setAccountWarnings(json.warnings ?? []);
    setSelectedId(
      (current) => current || json.accounts?.find((a) => !a.manager && !a.warning)?.customerId || "",
    );
  }, []);

  const loadGa4 = useCallback(async () => {
    const res = await fetch("/api/ga4/report", { cache: "no-store" });
    setGa4((await res.json()) as Ga4Response);
  }, []);

  const loadAudit = useCallback(async () => {
    const res = await fetch("/api/audit", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { audit?: AuditEventView[] };
    setAudit(json.audit ?? []);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      setBanner("Google connected. Tokens stored encrypted in Neon (oauth_connections), never in a file.");
    }
    if (params.get("disconnected")) setBanner("Disconnected. OAuth connections revoked in Postgres.");
    if (params.get("error")) setBanner(`OAuth: ${params.get("error")}`);
    void (async () => {
      const next = await loadStatus();
      await Promise.all([loadAccounts(next.connected), loadGa4(), loadAudit()]);
    })();
  }, [loadAccounts, loadAudit, loadGa4, loadStatus]);

  async function disconnect() {
    setBusy("disconnect");
    await fetch("/api/auth/disconnect", { method: "POST" });
    setBanner("Disconnected. OAuth connections revoked in Postgres.");
    const next = await loadStatus();
    await Promise.all([loadAccounts(next.connected), loadAudit()]);
    setBusy(null);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-lime-400">Adrunr · ads ops</p>
          <h1 className="mt-1 text-3xl font-medium text-white">Campaign tools, not autopilot.</h1>
          <p className="mt-2 max-w-2xl text-sm text-moss-400">
            Provider-agnostic foundation (Schema v1.13). Google Ads Search + Display + Performance Max
            + Demand Gen + Video + Shopping + App + Hotel + Local + Local Services wizards + fill-first assistant + read-only listings and budget/spend sync; other providers are seeded stubs. MCC{" "}
            <span className="font-mono text-moss-300">{PLATFORM_MCC_DISPLAY}</span> · GCP{" "}
            <span className="font-mono text-moss-300">adrunr-ads-ops</span> · Neon + Prisma
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1 font-mono text-xs text-moss-400">
            {status.mockMode ? "mock mode" : status.connected ? "connected" : "disconnected"}
          </div>
          <Link href="/" className="font-mono text-xs text-lime-400 hover:underline">
            Marketing site
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-400">
        <p className="font-medium text-amber-400">{SAFETY_COPY.headline}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-400/90">
          {SAFETY_COPY.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </section>

      {banner ? (
        <p className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-moss-300">{banner}</p>
      ) : null}

      <ProvidersPanel providers={status.providers} connected={status.connected} busy={busy} onDisconnect={disconnect} />

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
          <h2 className="text-lg text-white">Google Ads connection</h2>
          <p className="mt-1 text-sm text-moss-400">
            OAuth 2.0 web flow for Ads + Analytics readonly. Refresh/access tokens are encrypted in
            Neon <code className="font-mono text-moss-300">oauth_connections</code> columns. There is
            no <code className="font-mono text-moss-300">.data/tokens.json</code> path.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-moss-500">Account</dt>
              <dd className="font-mono text-moss-300">{status.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-moss-500">Source</dt>
              <dd className="font-mono text-moss-300">{status.source ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-moss-500">Login customer</dt>
              <dd className="font-mono text-moss-300">
                {status.loginCustomerId ? formatCustomerId(status.loginCustomerId) : PLATFORM_MCC_DISPLAY}
              </dd>
            </div>
            <div>
              <dt className="text-moss-500">OAuth / Ads / DB</dt>
              <dd className="font-mono text-moss-300">
                {status.oauthConfigured ? "oauth yes" : "oauth missing"} ·{" "}
                {status.adsConfigured ? "token yes" : "dev token missing"} ·{" "}
                {status.databaseConfigured ? "neon set" : "DATABASE_URL missing"}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            {status.connected ? (
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={busy === "disconnect"}
                className="rounded-lg border border-coral-400/40 px-4 py-2 text-sm text-coral-400 hover:bg-coral-400/10 disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <a
                href="/api/auth/google"
                className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-lime-500"
              >
                Connect Google Ads
              </a>
            )}
            {!status.oauthConfigured && !status.mockMode ? (
              <p className="self-center text-xs text-moss-500">
                Set GOOGLE_CLIENT_ID / SECRET in .env.local, or ADRUNR_MOCK=1 for a local demo.
              </p>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
          <h2 className="text-lg text-white">GA4 readonly stub</h2>
          <p className="mt-1 text-sm text-moss-400">
            Sample sessions / conversions. Persists a{" "}
            <code className="font-mono text-moss-300">google_analytics</code> ExternalAccount.
            Soft-fails if GA4_PROPERTY_ID or analytics.readonly is missing.
          </p>
          {ga4 ? (
            <div className="mt-4 space-y-3">
              <p className="font-mono text-xs text-moss-500">
                {ga4.source}
                {ga4.softFail ? " · soft-fail" : ""} · property {ga4.report?.propertyId || "unset"}
              </p>
              {ga4.reason ? <p className="text-sm text-amber-400">{ga4.reason}</p> : null}
              {ga4.report?.totals ? (
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Sessions (7d)" value={ga4.report.totals.sessions} />
                  <Stat label="Conversions (7d)" value={ga4.report.totals.conversions} />
                </div>
              ) : null}
              {ga4.report?.rows?.length ? (
                <table className="w-full text-left text-xs">
                  <thead className="text-moss-500">
                    <tr>
                      <th className="py-1 font-medium">Date</th>
                      <th className="py-1 font-medium">Sessions</th>
                      <th className="py-1 font-medium">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ga4.report.rows.slice(-5).map((row) => (
                      <tr key={row.date} className="border-t border-ink-700 font-mono text-moss-300">
                        <td className="py-1">{row.date}</td>
                        <td className="py-1">{row.sessions}</td>
                        <td className="py-1">{row.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-moss-500">Loading stub…</p>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg text-white">Accessible customers</h2>
          <button
            type="button"
            onClick={() => void loadAccounts(status.connected)}
            className="font-mono text-xs text-lime-400 hover:underline"
            disabled={!status.connected}
          >
            Refresh
          </button>
        </div>
        <p className="mt-1 text-sm text-moss-400">
          Listed as ExternalAccount rows under provider <code className="font-mono">google_ads</code>{" "}
          and login-customer-id {PLATFORM_MCC_DISPLAY}. Test Account developer tokens cannot manage
          production accounts until Basic Access.
        </p>
        {accountError ? <p className="mt-3 text-sm text-coral-400">{accountError}</p> : null}
        {accountWarnings.map((warning) => (
          <p key={warning} className="mt-2 text-sm text-amber-400">
            {warning}
          </p>
        ))}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-moss-500">
              <tr>
                <th className="pb-2 font-medium">Customer</th>
                <th className="pb-2 font-medium">ID</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-moss-500">
                    {status.connected
                      ? "No customers returned. Check developer-token access and MCC."
                      : "Connect Google Ads to list customers under the MCC."}
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.customerId} className="border-t border-ink-700">
                    <td className="py-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="radio"
                          name="customer"
                          className="mt-1 accent-lime-400"
                          checked={selectedId === account.customerId}
                          onChange={() => setSelectedId(account.customerId)}
                          disabled={Boolean(account.warning)}
                        />
                        <span>
                          <span className="block text-white">{account.descriptiveName}</span>
                          {account.warning ? (
                            <span className="mt-1 block text-xs text-amber-400">{account.warning}</span>
                          ) : null}
                        </span>
                      </label>
                    </td>
                    <td className="py-3 font-mono text-moss-300">{account.formattedId}</td>
                    <td className="py-3 font-mono text-xs">{account.status}</td>
                    <td className="py-3 text-xs text-moss-400">
                      {account.manager ? "manager" : "client"}
                      {account.testAccount ? " · test" : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ListingsPanel
        customerId={selectedId}
        connected={status.connected}
        onFinished={loadAudit}
      />

      <MetricsPanel
        customerId={selectedId}
        connected={status.connected}
        onFinished={loadAudit}
      />

      <SearchWorkspace accounts={accounts} connected={status.connected} onFinished={loadAudit} />

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h2 className="text-lg text-white">Audit trail</h2>
        <p className="mt-1 text-sm text-moss-400">
          Recent AuditEvent rows for the platform org. Connect, list, dry-run, and blocked mutates
          are recorded as TEXT metadata.
        </p>
        {audit.length === 0 ? (
          <p className="mt-4 text-sm text-moss-500">No events yet. Connect and run a dry-run to populate.</p>
        ) : (
          <ol className="mt-4 space-y-2 font-mono text-xs text-moss-300">
            {audit.map((event) => (
              <li key={event.id} className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2">
                <span className="text-moss-500">{event.createdAt}</span>{" "}
                <span className="text-lime-400">{event.action}</span> · {event.resourceType}
                {event.resourceId ? ` · ${event.resourceId}` : ""}
                {event.metadataText ? (
                  <span className="mt-1 block truncate text-moss-500">{event.metadataText}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="pb-8 text-xs text-moss-500">
        Adrunr · Schema v1.13 · Neon Postgres + Prisma · encrypted OAuth columns · no file tokens · no
        JSONB · listings + metrics sync are read-only · no spend/enable path
      </footer>
    </div>
  );
}

function SearchWorkspace({
  accounts,
  connected,
  onFinished,
}: {
  accounts: AdsAccountView[];
  connected: boolean;
  onFinished: () => Promise<void> | void;
}) {
  const [kind, setKind] = useState<AssistantCampaignKind>("SEARCH");
  const searchRef = useRef<SearchWizardHandle>(null);
  const displayRef = useRef<DisplayWizardHandle>(null);
  const pmaxRef = useRef<PmaxWizardHandle>(null);
  const demandGenRef = useRef<DemandGenWizardHandle>(null);
  const videoRef = useRef<VideoWizardHandle>(null);
  const shoppingRef = useRef<ShoppingWizardHandle>(null);
  const appRef = useRef<AppWizardHandle>(null);
  const hotelRef = useRef<HotelWizardHandle>(null);
  const localRef = useRef<LocalWizardHandle>(null);
  const localServicesRef = useRef<LocalServicesWizardHandle>(null);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Campaign type">
        <button
          type="button"
          role="tab"
          aria-selected={kind === "SEARCH"}
          data-testid="ops-kind-search"
          onClick={() => setKind("SEARCH")}
          className={`rounded-full px-4 py-1.5 font-mono text-xs ${
            kind === "SEARCH" ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
          }`}
        >
          Search
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "DISPLAY"}
          data-testid="ops-kind-display"
          onClick={() => setKind("DISPLAY")}
          className={`rounded-full px-4 py-1.5 font-mono text-xs ${
            kind === "DISPLAY" ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
          }`}
        >
          Display
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "PMAX"}
          data-testid="ops-kind-pmax"
          onClick={() => setKind("PMAX")}
          className={`rounded-full px-4 py-1.5 font-mono text-xs ${
            kind === "PMAX" ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
          }`}
        >
          Performance Max
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "DEMAND_GEN"}
          data-testid="ops-kind-demand-gen"
          onClick={() => setKind("DEMAND_GEN")}
          className={`rounded-full px-4 py-1.5 font-mono text-xs ${
            kind === "DEMAND_GEN" ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
          }`}
        >
          Demand Gen
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "VIDEO"}
          data-testid="ops-kind-video"
          onClick={() => setKind("VIDEO")}
          className={`rounded-full px-4 py-1.5 font-mono text-xs ${
            kind === "VIDEO" ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
          }`}
        >
          Video
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "SHOPPING"}
          data-testid="ops-kind-shopping"
          onClick={() => setKind("SHOPPING")}
          className={`rounded-full px-4 py-1.5 font-mono text-xs ${
            kind === "SHOPPING" ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
          }`}
        >
          Shopping
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "APP"}
          data-testid="ops-kind-app"
          onClick={() => setKind("APP")}
          className={`rounded-full px-4 py-1.5 font-mono text-xs ${
            kind === "APP" ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
          }`}
        >
          App
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "HOTEL"}
          data-testid="ops-kind-hotel"
          onClick={() => setKind("HOTEL")}
          className={`rounded-full px-4 py-1.5 font-mono text-xs ${
            kind === "HOTEL" ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
          }`}
        >
          Hotel
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "LOCAL"}
          data-testid="ops-kind-local"
          onClick={() => setKind("LOCAL")}
          className={`rounded-full px-4 py-1.5 font-mono text-xs ${
            kind === "LOCAL" ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
          }`}
        >
          Local
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "LOCAL_SERVICES"}
          data-testid="ops-kind-local-services"
          onClick={() => setKind("LOCAL_SERVICES")}
          className={`rounded-full px-4 py-1.5 font-mono text-xs ${
            kind === "LOCAL_SERVICES" ? "bg-lime-400 text-ink-950" : "border border-ink-700 text-moss-400"
          }`}
        >
          Local Services
        </button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        {kind === "SEARCH" ? (
          <>
            <SearchWizard ref={searchRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={searchRef} connected={connected} kind="SEARCH" />
          </>
        ) : kind === "DISPLAY" ? (
          <>
            <DisplayWizard ref={displayRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={displayRef} connected={connected} kind="DISPLAY" />
          </>
        ) : kind === "PMAX" ? (
          <>
            <PmaxWizard ref={pmaxRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={pmaxRef} connected={connected} kind="PMAX" />
          </>
        ) : kind === "DEMAND_GEN" ? (
          <>
            <DemandGenWizard ref={demandGenRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={demandGenRef} connected={connected} kind="DEMAND_GEN" />
          </>
        ) : kind === "VIDEO" ? (
          <>
            <VideoWizard ref={videoRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={videoRef} connected={connected} kind="VIDEO" />
          </>
        ) : kind === "SHOPPING" ? (
          <>
            <ShoppingWizard ref={shoppingRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={shoppingRef} connected={connected} kind="SHOPPING" />
          </>
        ) : kind === "APP" ? (
          <>
            <AppWizard ref={appRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={appRef} connected={connected} kind="APP" />
          </>
        ) : kind === "HOTEL" ? (
          <>
            <HotelWizard ref={hotelRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={hotelRef} connected={connected} kind="HOTEL" />
          </>
        ) : kind === "LOCAL" ? (
          <>
            <LocalWizard ref={localRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={localRef} connected={connected} kind="LOCAL" />
          </>
        ) : (
          <>
            <LocalServicesWizard ref={localServicesRef} accounts={accounts} connected={connected} onFinished={onFinished} />
            <SearchAssistant wizard={localServicesRef} connected={connected} kind="LOCAL_SERVICES" />
          </>
        )}
      </div>
    </section>
  );
}

function ProvidersPanel({
  providers,
  connected,
  busy,
  onDisconnect,
}: {
  providers: ProviderView[];
  connected: boolean;
  busy: string | null;
  onDisconnect: () => void;
}) {
  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
      <h2 className="text-lg text-white">Integration providers</h2>
      <p className="mt-1 text-sm text-moss-400">
        Seeded registry rows. Google Ads Connect is implemented. Clarity, Meta, TikTok, LinkedIn,
        Heartza, and Custom are schema-ready stubs.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {providers.map((provider) => (
          <article key={provider.slug} className="rounded-xl border border-ink-700 bg-ink-950 p-3">
            <p className="text-sm text-white">{provider.name}</p>
            <p className="font-mono text-xs text-moss-500">
              {provider.slug} · {provider.category}
            </p>
            <p className="mt-2 font-mono text-xs text-moss-400">
              {provider.connected ? "connected" : "not connected"}
            </p>
            {provider.connectEnabled ? (
              provider.connected || connected ? (
                <button
                  type="button"
                  onClick={onDisconnect}
                  disabled={busy === "disconnect"}
                  className="mt-3 text-xs text-coral-400 hover:underline disabled:opacity-50"
                >
                  Disconnect
                </button>
              ) : (
                <a href="/api/auth/google" className="mt-3 inline-block text-xs text-lime-400 hover:underline">
                  Connect
                </a>
              )
            ) : (
              <button
                type="button"
                disabled
                className="mt-3 cursor-not-allowed text-xs text-moss-500"
                title="Seeded stub — OAuth not implemented yet"
              >
                Connect (coming soon)
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2">
      <p className="text-xs text-moss-500">{label}</p>
      <p className="font-mono text-xl text-white">{value}</p>
    </div>
  );
}
