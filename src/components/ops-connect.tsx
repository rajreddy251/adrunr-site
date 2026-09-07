"use client";

import Link from "next/link";

import { Ga4Panel } from "@/components/ga4-panel";
import { useOpsSession } from "@/components/ops-session";
import { formatCustomerId, PLATFORM_MCC_DISPLAY } from "@/lib/ids";
import type { ProviderView } from "@/lib/types";

export function OpsConnect() {
  const { status, busy, banner, disconnect } = useOpsSession();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-medium text-paper-50">Connect</h1>
        <p className="mt-1 text-sm text-moss-400">
          Google Ads + GA4 on one OAuth client. Tokens stay encrypted in Neon. The GA4 property
          picker, bind, and sessions report also live on{" "}
          <Link href="/ops/analytics" className="text-lime-400 hover:underline">
            Analytics
          </Link>
          .
        </p>
      </header>

      {banner ? (
        <p className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-moss-300">{banner}</p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-connect-google">
          <h2 className="text-lg text-paper-50">Google Ads connection</h2>
          <p className="mt-1 text-sm text-moss-400">
            OAuth 2.0 web flow for Ads + Analytics readonly/edit. Refresh/access tokens are encrypted
            in Neon <code className="font-mono text-moss-300">oauth_connections</code> columns. There
            is no <code className="font-mono text-moss-300">.data/tokens.json</code> path.
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
                className="ops-btn-danger"
              >
                Disconnect
              </button>
            ) : (
              <a href="/api/auth/google" className="ops-btn-primary">
                Connect Google Ads
              </a>
            )}
            <a
              href="https://ads.google.com"
              target="_blank"
              rel="noreferrer"
              className="self-center font-mono text-xs text-brand-500 hover:underline"
            >
              Google Ads
            </a>
            {!status.oauthConfigured && !status.mockMode ? (
              <p className="self-center text-xs text-moss-500">
                Set GOOGLE_CLIENT_ID / SECRET in .env.local, or ADRUNR_MOCK=1 for a local demo.
              </p>
            ) : null}
          </div>
        </article>

        <Ga4Panel compact />
      </section>

      <ProvidersPanel
        providers={status.providers}
        connected={status.connected}
        busy={busy}
        onDisconnect={() => void disconnect()}
      />
    </div>
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
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5" data-testid="ops-connect-providers">
      <h2 className="text-lg text-paper-50">Integration providers</h2>
      <p className="mt-1 text-sm text-moss-400">
        Seeded registry rows. Google Ads and Google Analytics (GA4) Connect are implemented. Clarity,
        Meta, TikTok, LinkedIn, Heartza, and Custom are schema-ready stubs.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {providers.map((provider) => (
          <article key={provider.slug} className="rounded-xl border border-ink-700 bg-ink-800 p-3">
            <p className="text-sm text-paper-50">{provider.name}</p>
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
                <a
                  href={
                    provider.slug === "google_analytics"
                      ? "/api/auth/google?next=/ops/analytics"
                      : "/api/auth/google"
                  }
                  className="mt-3 inline-block text-xs text-lime-400 hover:underline"
                >
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
