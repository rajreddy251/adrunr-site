export const GA4_READONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const GA4_EDIT_SCOPE = "https://www.googleapis.com/auth/analytics.edit";

export const GA4_LIST_PROPERTIES_JOB_TYPE = "list_properties";
export const GA4_BIND_JOB_TYPE = "bind_property";
export const GA4_REPORT_JOB_TYPE = "ga4_sessions_report";

export const GA4_BOUND_ENTITY_STATUS = "BOUND";
export const GA4_LISTED_ENTITY_STATUS = "LISTED";

export const GA4_KEY_EVENTS_NOTE = "Key events — Coming soon";

export const GA4_CONNECT_NOTE =
  "GA4 Connect lists properties the connected advertiser can access, binds one ExternalAccount, and runs a read-only sessions report. Adrunr never spends, never enables Ads, and does not write key events.";

export type Ga4PropertyView = {
  propertyId: string;
  resourceName: string;
  displayName: string;
  accountId: string | null;
  accountName: string | null;
  timeZone: string | null;
  currencyCode: string | null;
  bound: boolean;
  externalAccountId?: string;
};

export function normalizeGa4PropertyId(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const withoutPrefix = trimmed.replace(/^properties\//i, "");
  const digits = withoutPrefix.replace(/\D/g, "");
  return digits;
}

export function formatGa4PropertyResource(propertyId: string): string {
  const id = normalizeGa4PropertyId(propertyId);
  return id ? `properties/${id}` : "";
}

export function hasGa4ReadonlyScope(scopes: string | null | undefined): boolean {
  const value = scopes ?? "";
  return value.includes(GA4_READONLY_SCOPE) || value.includes("analytics.readonly");
}

export function hasGa4EditScope(scopes: string | null | undefined): boolean {
  const value = scopes ?? "";
  return value.includes(GA4_EDIT_SCOPE) || /\banalytics\.edit\b/.test(value);
}

export function hasGa4Scopes(scopes: string | null | undefined): boolean {
  return hasGa4ReadonlyScope(scopes) || hasGa4EditScope(scopes);
}

export function findAccessibleGa4Property(
  propertyId: string,
  listed: Ga4PropertyView[],
): Ga4PropertyView {
  const id = normalizeGa4PropertyId(propertyId);
  if (!id) {
    throw Object.assign(new Error("A GA4 property id is required."), {
      status: 400,
      info: { kind: "validation", hint: "Pick a property from the connected user's list." },
    });
  }
  const match = listed.find((property) => property.propertyId === id);
  if (!match) {
    throw Object.assign(
      new Error("That GA4 property is not in the connected user's accessible list."),
      {
        status: 403,
        info: {
          kind: "forbidden",
          hint: "Reconnect Google and list properties again. Adrunr only binds properties the advertiser OAuth grant can see.",
        },
      },
    );
  }
  return match;
}

export function safeOpsRedirectPath(raw: string | null | undefined): string {
  if (!raw) return "/ops";
  const trimmed = raw.trim();
  if (trimmed.startsWith("//") || trimmed.includes("://") || trimmed.includes("\\") || /[\r\n]/.test(trimmed)) {
    return "/ops";
  }
  const path = trimmed.split("?")[0]?.split("#")[0] ?? "/ops";
  if (path === "/ops" || path.startsWith("/ops/")) return path;
  return "/ops";
}
