import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONNECTABLE_PROVIDER_SLUGS,
  GA4_EDIT_SCOPE,
  GA4_SCOPE,
  GOOGLE_ANALYTICS_SLUG,
  GOOGLE_OAUTH_SCOPES,
  SEED_PROVIDERS,
} from "@/lib/providers";
import {
  findAccessibleGa4Property,
  formatGa4PropertyResource,
  GA4_CONNECT_NOTE,
  GA4_EDIT_SCOPE as SHARED_EDIT_SCOPE,
  GA4_KEY_EVENTS_NOTE,
  GA4_READONLY_SCOPE,
  hasGa4EditScope,
  hasGa4ReadonlyScope,
  hasGa4Scopes,
  normalizeGa4PropertyId,
  safeOpsRedirectPath,
} from "@/lib/ga4-shared";
import { mockGa4Properties, mockGa4Report } from "@/lib/mock-data";
import { GA4_CONNECT_SAFETY_NOTE } from "@/lib/safety";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("GA4 Connect", () => {
  it("seeds google_analytics and requests Ads plus both Analytics scopes", () => {
    expect(SEED_PROVIDERS.some((provider) => provider.slug === GOOGLE_ANALYTICS_SLUG)).toBe(true);
    expect(SEED_PROVIDERS.some((provider) => provider.slug === "ga4")).toBe(false);
    expect(CONNECTABLE_PROVIDER_SLUGS).toEqual(["google_ads", "google_analytics"]);
    expect(GOOGLE_OAUTH_SCOPES).toContain(GA4_SCOPE);
    expect(GOOGLE_OAUTH_SCOPES).toContain(GA4_EDIT_SCOPE);
    expect(GA4_SCOPE).toBe(GA4_READONLY_SCOPE);
    expect(GA4_EDIT_SCOPE).toBe(SHARED_EDIT_SCOPE);
    expect(hasGa4ReadonlyScope(GOOGLE_OAUTH_SCOPES.join(" "))).toBe(true);
    expect(hasGa4EditScope(GOOGLE_OAUTH_SCOPES.join(" "))).toBe(true);
    expect(hasGa4Scopes("openid email")).toBe(false);
  });

  it("normalizes property ids and refuses properties outside the connected list", () => {
    expect(normalizeGa4PropertyId("properties/123456789")).toBe("123456789");
    expect(normalizeGa4PropertyId("123-456")).toBe("123456");
    expect(formatGa4PropertyResource("properties/123456789")).toBe("properties/123456789");
    const listed = mockGa4Properties();
    expect(findAccessibleGa4Property("properties/123456789", listed).displayName).toBe("Adrunr demo site");
    expect(() => findAccessibleGa4Property("000000000", listed)).toThrow(/accessible list/);
    expect(mockGa4Report("123456789").totals.sessions).toBe(388);
    expect(GA4_KEY_EVENTS_NOTE).toBe("Key events — Coming soon");
    expect(GA4_CONNECT_NOTE).toMatch(/never spends/i);
    expect(GA4_CONNECT_SAFETY_NOTE).toMatch(/will not spend/i);
  });

  it("keeps OAuth return paths on /ops", () => {
    expect(safeOpsRedirectPath("/ops/analytics")).toBe("/ops/analytics");
    expect(safeOpsRedirectPath("/ops/connect")).toBe("/ops/connect");
    expect(safeOpsRedirectPath("https://evil.example/ops")).toBe("/ops");
    expect(safeOpsRedirectPath("//evil.example")).toBe("/ops");
    expect(safeOpsRedirectPath("/login")).toBe("/ops");
  });

  it("does not add a first-class Ga4Property model or file-token store", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("model IntegrationProvider");
    expect(schema).toContain("model OAuthConnection");
    expect(schema).toContain("model ExternalAccount");
    expect(schema).toContain("model ExternalEntity");
    expect(schema).toContain("model SyncJob");
    expect(schema).toContain("PROPERTY");
    expect(schema).not.toMatch(/model Ga4Property/);
    expect(schema).not.toMatch(/model AdsAccount/);
    expect(read("src/lib/ga4.ts")).not.toContain("tokens.json");
    expect(read("src/lib/crypto.ts")).toContain("TOKEN_ENCRYPTION_KEY");
    expect(read("src/lib/connections.ts")).toContain("encryptSecret");
  });

  it("ships list, bind, and sessions report routes without Enable/spend CTAs", () => {
    expect(existsSync(resolve(root, "src/app/api/ga4/properties/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/ga4/bind/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/api/ga4/report/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/ops/analytics/page.tsx"))).toBe(true);
    const ga4 = read("src/lib/ga4.ts");
    expect(ga4).toContain("accountSummaries");
    expect(ga4).toContain("runReport");
    expect(ga4).toContain("7daysAgo");
    expect(ga4).toContain("sessions");
    expect(ga4).toContain("GA4_KEY_EVENTS_NOTE");
    expect(ga4).not.toMatch(/googleAds:mutate/);
    const panel = read("src/components/ga4-panel.tsx");
    expect(panel).toContain("Connect GA4");
    expect(panel).toContain("Bind property");
    expect(panel).toContain("Sessions last 7 days");
    expect(panel).not.toMatch(/>\s*Enable\s*</);
    expect(panel).not.toMatch(/go-live/i);
    expect(read("src/lib/env.ts")).toContain("/api/auth/google/callback");
    expect(read("src/app/api/auth/google/callback/route.ts")).toContain("exchangeCode");
  });
});
