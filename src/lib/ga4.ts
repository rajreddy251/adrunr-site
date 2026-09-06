import "server-only";

import { google } from "googleapis";

import { upsertExternalAccount } from "./accounts";
import { writeAudit } from "./audit";
import { TokenDecryptError, decryptOAuthTokenFields, isOpaqueCryptoDecryptError } from "./crypto";
import { getEnv } from "./env";
import { loadActiveConnection } from "./connections";
import { mockGa4Report } from "./mock-data";
import { createOAuthClient, GA4_SCOPE } from "./oauth";
import { GOOGLE_ADS_SLUG, GOOGLE_ANALYTICS_SLUG } from "./providers";
import { ensurePlatformContext, requireProvider } from "./tenant";

export type Ga4ReportResult = {
  ok: boolean;
  softFail: boolean;
  source: "live" | "mock" | "stub";
  reason?: string;
  report?: ReturnType<typeof mockGa4Report> & {
    rows?: Array<{ date: string; sessions: number; conversions: number }>;
  };
};

function stub(reason: string, propertyId: string): Ga4ReportResult {
  return {
    ok: false,
    softFail: true,
    source: "stub",
    reason,
    report: {
      ...mockGa4Report(propertyId),
      source: "stub",
      note: reason,
    },
  };
}

async function persistGa4Property(propertyId: string) {
  if (!propertyId) return;
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ANALYTICS_SLUG);
  const loaded =
    (await loadActiveConnection(GOOGLE_ANALYTICS_SLUG)) ??
    (await loadActiveConnection(GOOGLE_ADS_SLUG));
  const account = await upsertExternalAccount({
    providerSlug: GOOGLE_ANALYTICS_SLUG,
    externalId: propertyId,
    displayName: `GA4 ${propertyId}`,
    oauthConnectionId: loaded?.connection.id,
    status: "ENABLED",
  });
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    providerId: provider.id,
    action: "external_account.ga4_sample",
    resourceType: "EXTERNAL_ACCOUNT",
    resourceId: account.id,
    metadata: { propertyId },
  });
}

export async function runGa4SampleReport(): Promise<Ga4ReportResult> {
  const env = getEnv();
  if (env.mockMode) {
    const propertyId = env.ga4PropertyId || "properties/mock";
    await persistGa4Property(propertyId);
    return {
      ok: true,
      softFail: false,
      source: "mock",
      report: mockGa4Report(propertyId),
    };
  }

  if (!env.ga4PropertyId) {
    return stub(
      "GA4_PROPERTY_ID is not set. Readonly stub is idle — add a property id to .env.local to query the Data API.",
      "",
    );
  }

  const loaded =
    (await loadActiveConnection(GOOGLE_ANALYTICS_SLUG)) ??
    (await loadActiveConnection(GOOGLE_ADS_SLUG));
  if (!loaded) {
    return stub(
      "Connect Google Ads/Analytics first. GA4 uses the same OAuth grant (analytics.readonly).",
      env.ga4PropertyId,
    );
  }

  const scopes = loaded.connection.scopes ?? "";
  if (
    loaded.source !== "mock" &&
    scopes &&
    !scopes.includes(GA4_SCOPE) &&
    !scopes.includes("analytics.readonly")
  ) {
    return stub(
      "Connected token is missing analytics.readonly. Disconnect and Connect again to grant the GA4 scope.",
      env.ga4PropertyId,
    );
  }

  try {
    const { refreshToken: refreshPlain, accessToken: accessPlain } = decryptOAuthTokenFields(
      loaded.connection,
    );
    const client = createOAuthClient();
    const refreshToken = refreshPlain.startsWith("access-only:") ? undefined : refreshPlain;
    client.setCredentials({
      refresh_token: refreshToken,
      access_token: accessPlain,
      expiry_date: loaded.connection.accessTokenExpiresAt?.getTime(),
    });

    const analyticsdata = google.analyticsdata({ version: "v1beta", auth: client });
    const result = await analyticsdata.properties.runReport({
      property: `properties/${env.ga4PropertyId.replace(/^properties\//, "")}`,
      requestBody: {
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
      },
    });

    const rows = (result.data.rows ?? []).map((row) => ({
      date: row.dimensionValues?.[0]?.value ?? "",
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
      conversions: Number(row.metricValues?.[1]?.value ?? 0),
    }));

    const totals = rows.reduce(
      (acc, row) => {
        acc.sessions += row.sessions;
        acc.conversions += row.conversions;
        return acc;
      },
      { sessions: 0, conversions: 0 },
    );

    await persistGa4Property(env.ga4PropertyId);

    return {
      ok: true,
      softFail: false,
      source: "live",
      report: {
        propertyId: env.ga4PropertyId,
        stub: false,
        source: "live",
        dateRange: { startDate: "7daysAgo", endDate: "today" },
        metrics: ["sessions", "conversions"],
        rows,
        totals,
        note: "GA4 Data API readonly sample (sessions + conversions by date).",
      },
    };
  } catch (error) {
    if (error instanceof TokenDecryptError || isOpaqueCryptoDecryptError(error)) {
      const mapped = error instanceof TokenDecryptError ? error : new TokenDecryptError();
      return stub(`${mapped.message} ${mapped.info.hint}`, env.ga4PropertyId);
    }
    const message = error instanceof Error ? error.message : "GA4 Data API request failed.";
    return stub(`GA4 soft-fail: ${message}`, env.ga4PropertyId);
  }
}
