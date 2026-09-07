"use client";

import Link from "next/link";

import { useOpsSession } from "@/components/ops-session";
import { formatCustomerId, PLATFORM_MCC_DISPLAY } from "@/lib/ids";
import { OPS_HUB_SHORTCUTS } from "@/lib/ops-shell";

export function OpsHub() {
  const {
    status,
    accounts,
    accountWarnings,
    accountError,
    selectedId,
    setSelectedId,
    busy,
    banner,
    loadAccounts,
    disconnect,
  } = useOpsSession();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-lime-400">Adrunr · ads ops</p>
        <h1 className="mt-1 text-3xl font-medium text-paper-50">Campaign tools, not autopilot.</h1>
        <p className="mt-2 max-w-2xl text-sm text-moss-400">
          Hub for account connect, customer pick, and shortcuts. Create Search lives on{" "}
          <Link href="/ops/campaigns/new/search" className="text-lime-400 hover:underline">
            /ops/campaigns/new/search
          </Link>
          . Overview and Safe edit live on a campaign workspace. Campaign chat is Slice D. MCC{" "}
          <span className="font-mono text-moss-300">{PLATFORM_MCC_DISPLAY}</span> · GCP{" "}
          <span className="font-mono text-moss-300">adrunr-ads-ops</span> · Neon + Prisma
        </p>
      </header>

      {banner ? (
        <p className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-moss-300">{banner}</p>
      ) : null}

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-hub-connect">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg text-paper-50">Account connect</h2>
            <p className="mt-1 text-sm text-moss-400">
              OAuth tokens stay encrypted in Neon. Full provider registry lives on{" "}
              <Link href="/ops/connect" className="text-lime-400 hover:underline">
                Connect
              </Link>
              . GA4 property bind and the 7-day sessions report live on{" "}
              <Link href="/ops/analytics" className="text-lime-400 hover:underline">
                Analytics
              </Link>
              .
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
            </dl>
          </div>
          <div className="flex flex-wrap gap-3">
            {status.connected ? (
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={busy === "disconnect"}
                className="ops-btn-danger"
              >
                Disconnect
              </button>
            ) : (
              <a href="/api/auth/google" className="ops-btn-primary">
                Connect Google Ads
              </a>
            )}
            <Link href="/ops/connect" className="ops-btn-secondary">
              Open Connect
            </Link>
          </div>
        </div>
        {!status.oauthConfigured && !status.mockMode ? (
          <p className="mt-3 text-xs text-moss-500">
            Set GOOGLE_CLIENT_ID / SECRET in .env.local, or ADRUNR_MOCK=1 for a local demo.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-hub-customers">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg text-paper-50">Customer picker</h2>
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
          Selection follows you across Listings, Metrics, Import, Reports, and Campaigns. Test Account
          developer tokens cannot manage production accounts until Basic Access.
        </p>
        {accountError ? <p className="mt-3 text-sm text-coral-400">{accountError}</p> : null}
        {accountWarnings.map((warning) => (
          <p key={warning} className="mt-2 text-sm text-amber-400">
            {warning}
          </p>
        ))}
        <div className="mt-4 overflow-x-auto">
          <table className="ops-table w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr>
                <th>Customer</th>
                <th>ID</th>
                <th>Status</th>
                <th>Type</th>
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
                  <tr key={account.customerId}>
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
                          <span className="block text-paper-50">{account.descriptiveName}</span>
                          {account.warning ? (
                            <span className="mt-1 block text-xs text-amber-400">{account.warning}</span>
                          ) : null}
                        </span>
                      </label>
                    </td>
                    <td className="py-3 font-mono text-moss-300">
                      {account.formattedId || formatCustomerId(account.customerId)}
                    </td>
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

      <section data-testid="ops-hub-shortcuts">
        <h2 className="text-lg text-paper-50">Shortcuts</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OPS_HUB_SHORTCUTS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-ink-700 bg-ink-900 p-4 hover:bg-ink-800"
            >
              <p className="text-sm text-paper-50">{item.label}</p>
              <p className="mt-1 text-xs text-moss-400">{item.detail}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
