"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { OPS_CUSTOMER_STORAGE_KEY, OPS_GA4_PROPERTY_STORAGE_KEY } from "@/lib/ops-shell";
import type { AdsAccountView, AuditEventView, ConnectionStatusView, Ga4PropertyView } from "@/lib/types";

type AccountsResponse = {
  ok: boolean;
  accounts?: AdsAccountView[];
  warnings?: string[];
  source?: string;
  error?: string;
  hint?: string;
  kind?: string;
};

type PropertiesResponse = {
  ok: boolean;
  properties?: Ga4PropertyView[];
  boundPropertyId?: string | null;
  warnings?: string[];
  source?: string;
  error?: string;
  hint?: string;
};

export type Ga4Response = {
  ok: boolean;
  softFail: boolean;
  source: string;
  reason?: string;
  keyEvents?: string;
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
  ga4Connected: false,
  ga4PropertyId: null,
  ga4BoundPropertyId: null,
  ga4BoundDisplayName: null,
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
  ga4Properties: Ga4PropertyView[];
  ga4Warnings: string[];
  ga4Error: string | null;
  selectedGa4PropertyId: string;
  setSelectedGa4PropertyId: (propertyId: string) => void;
  ga4: Ga4Response | null;
  audit: AuditEventView[];
  busy: string | null;
  banner: string | null;
  loadStatus: () => Promise<ConnectionStatusView>;
  loadAccounts: (connected: boolean) => Promise<void>;
  loadGa4Properties: (connected: boolean) => Promise<Ga4PropertyView[]>;
  loadGa4: (propertyId?: string) => Promise<void>;
  bindGa4Property: (propertyId: string) => Promise<boolean>;
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

function readStoredGa4PropertyId(): string {
  try {
    return window.sessionStorage.getItem(OPS_GA4_PROPERTY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredGa4PropertyId(propertyId: string) {
  try {
    if (propertyId) {
      window.sessionStorage.setItem(OPS_GA4_PROPERTY_STORAGE_KEY, propertyId);
    } else {
      window.sessionStorage.removeItem(OPS_GA4_PROPERTY_STORAGE_KEY);
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
  const [ga4Properties, setGa4Properties] = useState<Ga4PropertyView[]>([]);
  const [ga4Warnings, setGa4Warnings] = useState<string[]>([]);
  const [ga4Error, setGa4Error] = useState<string | null>(null);
  const [selectedGa4PropertyId, setSelectedGa4PropertyIdState] = useState("");
  const [ga4, setGa4] = useState<Ga4Response | null>(null);
  const [audit, setAudit] = useState<AuditEventView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const setSelectedId = useCallback((customerId: string) => {
    setSelectedIdState(customerId);
    writeStoredCustomerId(customerId);
  }, []);

  const setSelectedGa4PropertyId = useCallback((propertyId: string) => {
    setSelectedGa4PropertyIdState(propertyId);
    writeStoredGa4PropertyId(propertyId);
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

  const loadGa4Properties = useCallback(async (connected: boolean) => {
    if (!connected) {
      setGa4Properties([]);
      setGa4Warnings([]);
      setGa4Error(null);
      return [];
    }
    const res = await fetch("/api/ga4/properties", { cache: "no-store" });
    const json = (await res.json()) as PropertiesResponse;
    if (!json.ok) {
      setGa4Properties([]);
      setGa4Error([json.error, json.hint].filter(Boolean).join(" — "));
      setGa4Warnings([]);
      return [];
    }
    const nextProperties = json.properties ?? [];
    setGa4Error(null);
    setGa4Properties(nextProperties);
    setGa4Warnings(json.warnings ?? []);
    const boundId = json.boundPropertyId || nextProperties.find((property) => property.bound)?.propertyId || "";
    setSelectedGa4PropertyIdState((current) => {
      const stored = current || readStoredGa4PropertyId();
      const usable =
        nextProperties.find((property) => property.propertyId === boundId) ??
        nextProperties.find((property) => property.propertyId === stored) ??
        nextProperties[0];
      const nextId = usable?.propertyId || stored || "";
      writeStoredGa4PropertyId(nextId);
      return nextId;
    });
    return nextProperties;
  }, []);

  const loadGa4 = useCallback(async (propertyId?: string) => {
    const id = propertyId || readStoredGa4PropertyId();
    const suffix = id ? `?propertyId=${encodeURIComponent(id)}` : "";
    const res = await fetch(`/api/ga4/report${suffix}`, { cache: "no-store" });
    const json = (await res.json()) as Ga4Response & { error?: string; hint?: string };
    if (!res.ok) {
      setGa4({
        ok: false,
        softFail: true,
        source: "stub",
        reason: [json.error, json.hint].filter(Boolean).join(" — ") || "Unable to load the GA4 report.",
        keyEvents: "Key events — Coming soon",
      });
      return;
    }
    setGa4(json);
  }, []);

  const refreshAudit = useCallback(async () => {
    const res = await fetch("/api/audit", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { audit?: AuditEventView[] };
    setAudit(json.audit ?? []);
  }, []);

  const bindGa4Property = useCallback(
    async (propertyId: string) => {
      setBusy("ga4-bind");
      const res = await fetch("/api/ga4/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; hint?: string; property?: Ga4PropertyView };
      if (!res.ok || !json.ok) {
        setBanner([json.error, json.hint].filter(Boolean).join(" — ") || "Unable to bind that GA4 property.");
        setBusy(null);
        return false;
      }
      setSelectedGa4PropertyId(propertyId);
      setBanner(`Bound GA4 property ${json.property?.displayName ?? propertyId}. Sessions report is read-only.`);
      await Promise.all([loadStatus(), loadGa4Properties(true), loadGa4(propertyId), refreshAudit()]);
      setBusy(null);
      return true;
    },
    [loadGa4, loadGa4Properties, loadStatus, refreshAudit, setSelectedGa4PropertyId],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      setBanner("Google connected. Tokens stored encrypted in Neon (oauth_connections), never in a file.");
    }
    if (params.get("disconnected")) setBanner("Disconnected. OAuth connections revoked in Postgres.");
    if (params.get("error")) setBanner(`OAuth: ${params.get("error")}`);
    void (async () => {
      const next = await loadStatus();
      const ga4Ready = next.ga4Connected || next.connected;
      const [properties] = await Promise.all([
        loadGa4Properties(ga4Ready),
        loadAccounts(next.connected),
        refreshAudit(),
      ]);
      const stored = readStoredGa4PropertyId();
      const usable =
        next.ga4BoundPropertyId ||
        properties.find((property) => property.bound)?.propertyId ||
        properties.find((property) => property.propertyId === stored)?.propertyId ||
        properties[0]?.propertyId;
      await loadGa4(usable);
    })();
  }, [loadAccounts, loadGa4, loadGa4Properties, loadStatus, refreshAudit]);

  const disconnect = useCallback(async () => {
    setBusy("disconnect");
    await fetch("/api/auth/disconnect", { method: "POST" });
    setBanner("Disconnected. OAuth connections revoked in Postgres.");
    writeStoredGa4PropertyId("");
    setSelectedGa4PropertyIdState("");
    setGa4Properties([]);
    setGa4(null);
    const next = await loadStatus();
    await Promise.all([loadAccounts(next.connected), loadGa4Properties(false), refreshAudit()]);
    setBusy(null);
  }, [loadAccounts, loadGa4Properties, loadStatus, refreshAudit]);

  const value = useMemo<OpsSessionValue>(
    () => ({
      status,
      accounts,
      accountWarnings,
      accountError,
      selectedId,
      setSelectedId,
      ga4Properties,
      ga4Warnings,
      ga4Error,
      selectedGa4PropertyId,
      setSelectedGa4PropertyId,
      ga4,
      audit,
      busy,
      banner,
      loadStatus,
      loadAccounts,
      loadGa4Properties,
      loadGa4,
      bindGa4Property,
      refreshAudit,
      disconnect,
    }),
    [
      accountError,
      accountWarnings,
      accounts,
      audit,
      banner,
      bindGa4Property,
      busy,
      disconnect,
      ga4,
      ga4Error,
      ga4Properties,
      ga4Warnings,
      loadAccounts,
      loadGa4,
      loadGa4Properties,
      loadStatus,
      refreshAudit,
      selectedGa4PropertyId,
      selectedId,
      setSelectedGa4PropertyId,
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
