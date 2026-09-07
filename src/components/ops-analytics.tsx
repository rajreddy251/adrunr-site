"use client";

import Link from "next/link";

import { Ga4Panel } from "@/components/ga4-panel";
import { useOpsSession } from "@/components/ops-session";

export function OpsAnalytics() {
  const { banner, status } = useOpsSession();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-medium text-paper-50">Analytics</h1>
        <p className="mt-1 text-sm text-moss-400">
          Connect GA4 on the same Google OAuth client as Ads. Pick a property the connected user can
          access, bind it to a{" "}
          <code className="font-mono text-moss-300">google_analytics</code> ExternalAccount, then
          read sessions for the last 7 days. No Enable or spend CTAs.
        </p>
      </header>

      {banner ? (
        <p className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-moss-300">{banner}</p>
      ) : null}

      <Ga4Panel />

      <p className="text-sm text-moss-500">
        OAuth callback stays{" "}
        <code className="font-mono text-moss-300">/api/auth/google/callback</code>. Provider registry
        and Ads connect live on{" "}
        <Link href="/ops/connect" className="text-lime-400 hover:underline">
          Connect
        </Link>
        {status.email ? (
          <span className="font-mono text-moss-400"> · {status.email}</span>
        ) : null}
        .
      </p>
    </div>
  );
}
