"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { OPS_CUSTOMER_STORAGE_KEY } from "@/lib/ops-shell";
import type { AdsAccountView, AuditEventView, ConnectionStatusView } from "@/lib/types";

type AccountsResponse = {
  ok: boolean;
  accounts?: AdsAccountView[];
  warnings?: string[];
  source?: string;
  error?: string;
  hint?: string;
  kind?: string;
};

export type Ga4Response = {
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

type OpsSessionValue = {
  status: ConnectionStatusView;
  accounts: AdsAccountView[];
  accountWarnings: string[];
  accountError: string | null;
  selectedId: string;
  setSelectedId: (customerId: string) => void;
  ga4: Ga4Response | null;
  audit: AuditEventView[];
  busy: string | null;
  banner: string | null;
  loadStatus: () => Promise<ConnectionStatusView>;
  loadAccounts: (connected: boolean) => Promise<void>;
  loadGa4: () => Promise<void>;
  refreshAudit: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const OpsSessionContext = createContext<OpsSessionValue | null>(null);

function readStoredCustomerId(): string {
  try {
    return window.sessionStorage.getItem(OPS_CUSTOMER_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredCustomerId(customerId: string) {
  try {
    if (customerId) {
      window.sessionStorage.setItem(OPS_CUSTOMER_STORAGE_KEY, customerId);
    } else {
      window.sessionStorage.removeItem(OPS_CUSTOMER_STORAGE_KEY);
    }
  } catch {
    // sessionStorage can throw in locked / private contexts
  }
}

export function OpsSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatusView>(emptyStatus);
  const [accounts, setAccounts] = useState<AdsAccountView[]>([]);
  const [accountWarnings, setAccountWarnings] = useState<string[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [selectedId, setSelectedIdState] = useState("");
  const [ga4, setGa4] = useState<Ga4Response | null>(null);
  const [audit, setAudit] = useState<AuditEventView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const setSelectedId = useCallback((customerId: string) => {
    setSelectedIdState(customerId);
    writeStoredCustomerId(customerId);
  }, []);

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
    const nextAccounts = json.accounts ?? [];
    setAccounts(nextAccounts);
    setAccountWarnings(json.warnings ?? []);
    setSelectedIdState((current) => {
      const stored = current || readStoredCustomerId();
      const usable =
        nextAccounts.find((account) => account.customerId === stored && !account.warning) ??
        nextAccounts.find((account) => !account.manager && !account.warning);
      const nextId = usable?.customerId || stored || "";
      writeStoredCustomerId(nextId);
      return nextId;
    });
  }, []);

  const loadGa4 = useCallback(async () => {
    const res = await fetch("/api/ga4/report", { cache: "no-store" });
    setGa4((await res.json()) as Ga4Response);
  }, []);

  const refreshAudit = useCallback(async () => {
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
      await Promise.all([loadAccounts(next.connected), loadGa4(), refreshAudit()]);
    })();
  }, [loadAccounts, loadGa4, loadStatus, refreshAudit]);

  const disconnect = useCallback(async () => {
    setBusy("disconnect");
    await fetch("/api/auth/disconnect", { method: "POST" });
    setBanner("Disconnected. OAuth connections revoked in Postgres.");
    const next = await loadStatus();
    await Promise.all([loadAccounts(next.connected), refreshAudit()]);
    setBusy(null);
  }, [loadAccounts, loadStatus, refreshAudit]);

  const value = useMemo<OpsSessionValue>(
    () => ({
      status,
      accounts,
      accountWarnings,
      accountError,
      selectedId,
      setSelectedId,
      ga4,
      audit,
      busy,
      banner,
      loadStatus,
      loadAccounts,
      loadGa4,
      refreshAudit,
      disconnect,
    }),
    [
      accountError,
      accountWarnings,
      accounts,
      audit,
      banner,
      busy,
      disconnect,
      ga4,
      loadAccounts,
      loadGa4,
      loadStatus,
      refreshAudit,
      selectedId,
      setSelectedId,
      status,
    ],
  );

  return <OpsSessionContext.Provider value={value}>{children}</OpsSessionContext.Provider>;
}

export function useOpsSession(): OpsSessionValue {
  const value = useContext(OpsSessionContext);
  if (!value) {
    throw new Error("useOpsSession must be used within OpsSessionProvider");
  }
  return value;
}
