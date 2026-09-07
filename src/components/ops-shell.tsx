"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useOpsSession } from "@/components/ops-session";
import { formatCustomerId } from "@/lib/ids";
import { isOpsNavActive, OPS_NAV, SHELL_SAFETY_STRIP } from "@/lib/ops-shell";

export function OpsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, accounts, selectedId, setSelectedId } = useOpsSession();
  const selected = accounts.find((account) => account.customerId === selectedId);
  const connectionLabel = status.mockMode ? "mock mode" : status.connected ? "connected" : "disconnected";

  return (
    <div className="flex min-h-screen flex-col bg-ink-950 lg:h-screen lg:overflow-hidden">
      <header
        data-testid="ops-topbar"
        className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-ink-700 bg-ink-900 px-4"
      >
        <Link href="/ops" className="shrink-0 font-medium tracking-tight text-paper-50">
          Adrunr
          <span className="ml-2 font-mono text-xs uppercase tracking-[0.18em] text-lime-400">ops</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <div className="hidden min-w-0 sm:block">
            <p className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-moss-500">
              {status.organizationSlug ?? "platform"}
            </p>
            <label className="sr-only" htmlFor="ops-topbar-customer">
              Customer
            </label>
            <select
              id="ops-topbar-customer"
              data-testid="ops-topbar-customer"
              className="input h-8 max-w-[16rem] py-1 text-xs"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={!status.connected || accounts.length === 0}
            >
              {accounts.length === 0 ? (
                <option value="">No customer</option>
              ) : (
                accounts.map((account) => (
                  <option key={account.customerId} value={account.customerId} disabled={Boolean(account.warning)}>
                    {account.descriptiveName} · {account.formattedId}
                  </option>
                ))
              )}
            </select>
          </div>
          <div
            data-testid="ops-connection-pill"
            className="rounded-full border border-ink-700 bg-ink-800 px-3 py-1 font-mono text-xs text-moss-300"
          >
            {connectionLabel}
            {selected ? (
              <span className="ml-2 hidden text-moss-500 md:inline">
                {formatCustomerId(selected.customerId)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div
        data-testid="ops-safety-strip"
        className="shrink-0 border-b border-amber-400/40 bg-amber-400/15 px-4 py-2 text-amber-400"
      >
        <p className="text-sm font-medium">{SHELL_SAFETY_STRIP.headline}</p>
        <p className="mt-0.5 text-xs text-amber-400/90">{SHELL_SAFETY_STRIP.detail}</p>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav
          data-testid="ops-nav"
          aria-label="Ops"
          className="w-[220px] shrink-0 overflow-y-auto border-r border-ink-700 bg-ink-900 px-3 py-4"
        >
          <p className="px-2 font-mono text-[11px] uppercase tracking-[0.16em] text-moss-500">Workspace</p>
          <ul className="mt-3 space-y-1">
            {OPS_NAV.map((item) => {
              const active = isOpsNavActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-testid={`ops-nav-${item.label.toLowerCase()}`}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm ${
                      active
                        ? "bg-ink-800 text-paper-50"
                        : "text-moss-300 hover:bg-ink-800 hover:text-paper-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/" className="mt-6 block px-3 font-mono text-xs text-lime-400 hover:underline">
            Marketing site
          </Link>
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
