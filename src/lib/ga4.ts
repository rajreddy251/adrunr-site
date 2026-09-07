import "server-only";

import { google } from "googleapis";

import { toGa4PropertyView, upsertExternalAccount, upsertGa4Properties } from "./accounts";
import { writeAudit } from "./audit";
import { loadActiveConnection } from "./connections";
import { TokenDecryptError, decryptOAuthTokenFields, isOpaqueCryptoDecryptError } from "./crypto";
import { getEnv } from "./env";
import {
  GA4_BIND_JOB_TYPE,
  GA4_BOUND_ENTITY_STATUS,
  GA4_CONNECT_NOTE,
  GA4_KEY_EVENTS_NOTE,
  GA4_LISTED_ENTITY_STATUS,
  GA4_LIST_PROPERTIES_JOB_TYPE,
  GA4_REPORT_JOB_TYPE,
  findAccessibleGa4Property,
  formatGa4PropertyResource,
  hasGa4Scopes,
  normalizeGa4PropertyId,
  type Ga4PropertyView,
} from "./ga4-shared";
import { toJsonText } from "./http";
import { mockGa4Properties, mockGa4Report } from "./mock-data";
import { createOAuthClient } from "./oauth";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG, GOOGLE_ANALYTICS_SLUG } from "./providers";
import { ensurePlatformContext, requireProvider } from "./tenant";

export {
  GA4_BIND_JOB_TYPE,
  GA4_CONNECT_NOTE,
  GA4_KEY_EVENTS_NOTE,
  GA4_LIST_PROPERTIES_JOB_TYPE,
  GA4_REPORT_JOB_TYPE,
  findAccessibleGa4Property,
  formatGa4PropertyResource,
  hasGa4Scopes,
  normalizeGa4PropertyId,
} from "./ga4-shared";
export type { Ga4PropertyView } from "./ga4-shared";

export type Ga4ReportResult = {
  ok: boolean;
  softFail: boolean;
  source: "live" | "mock" | "stub";
  reason?: string;
  keyEvents: typeof GA4_KEY_EVENTS_NOTE;
  report?: ReturnType<typeof mockGa4Report> & {
    rows?: Array<{ date: string; sessions: number; conversions: number }>;
  };
};

export type Ga4ListResult = {
  properties: Ga4PropertyView[];
  boundPropertyId: string | null;
  source: "live" | "mock";
  warnings: string[];
};

export type Ga4BindResult = {
  property: Ga4PropertyView;
  source: "live" | "mock";
};

async function loadGa4Connection() {
  return (
    (await loadActiveConnection(GOOGLE_ANALYTICS_SLUG)) ??
    (await loadActiveConnection(GOOGLE_ADS_SLUG))
  );
}

async function createGa4AuthClient() {
  const loaded = await loadGa4Connection();
  if (!loaded) {
    throw Object.assign(new Error("Connect Google (Ads + Analytics) first."), {
      status: 401,
      info: {
        kind: "not_connected",
        hint: "Click Connect GA4. The callback stays /api/auth/google/callback on the same OAuth client.",
      },
    });
  }

  const scopes = loaded.connection.scopes ?? "";
  if (loaded.source !== "mock" && scopes && !hasGa4Scopes(scopes)) {
    throw Object.assign(
      new Error("Connected token is missing Analytics scopes. Disconnect and Connect again."),
      {
        status: 403,
        info: {
          kind: "missing_scope",
          hint: "Grant analytics.readonly and analytics.edit on the same Google OAuth client.",
        },
      },
    );
  }

  const env = getEnv();
  if (env.mockMode || loaded.source === "mock") {
    return { loaded, client: null as ReturnType<typeof createOAuthClient> | null };
  }

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
  return { loaded, client };
}

function stub(reason: string, propertyId: string): Ga4ReportResult {
  return {
    ok: false,
    softFail: true,
    source: "stub",
    reason,
    keyEvents: GA4_KEY_EVENTS_NOTE,
    report: {
      ...mockGa4Report(propertyId),
      source: "stub",
      note: reason,
    },
  };
}

async function persistGa4Property(
  property: Pick<Ga4PropertyView, "propertyId" | "displayName" | "accountId" | "timeZone" | "currencyCode">,
) {
  const id = normalizeGa4PropertyId(property.propertyId);
  if (!id) return null;
  const loaded = await loadGa4Connection();
  return upsertExternalAccount({
    providerSlug: GOOGLE_ANALYTICS_SLUG,
    externalId: id,
    displayName: property.displayName || `GA4 ${id}`,
    parentExternalId: property.accountId,
    timeZone: property.timeZone,
    currencyCode: property.currencyCode,
    oauthConnectionId: loaded?.connection.id,
    status: "ENABLED",
  });
}

async function listBoundEntityIds(organizationId: string, providerId: string): Promise<Set<string>> {
  const rows = await prisma().externalEntity.findMany({
    where: {
      organizationId,
      providerId,
      entityType: "PROPERTY",
      status: GA4_BOUND_ENTITY_STATUS,
    },
    select: { externalId: true },
  });
  return new Set(rows.map((row) => row.externalId));
}

async function markPropertyEntities(
  properties: Ga4PropertyView[],
  accounts: Ga4PropertyView[],
  boundPropertyId: string | null,
) {
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ANALYTICS_SLUG);
  const byId = new Map(accounts.map((account) => [account.propertyId, account]));
  for (const property of properties) {
    const account = byId.get(property.propertyId);
    if (!account?.externalAccountId) continue;
    const bound = boundPropertyId === property.propertyId;
    await prisma().externalEntity.upsert({
      where: {
        providerId_externalAccountId_entityType_externalId: {
          providerId: provider.id,
          externalAccountId: account.externalAccountId,
          entityType: "PROPERTY",
          externalId: property.propertyId,
        },
      },
      create: {
        organizationId: ctx.org.id,
        providerId: provider.id,
        externalAccountId: account.externalAccountId,
        entityType: "PROPERTY",
        externalId: property.propertyId,
        displayName: property.displayName,
        status: bound ? GA4_BOUND_ENTITY_STATUS : GA4_LISTED_ENTITY_STATUS,
        attributesText: toJsonText({
          accountId: property.accountId,
          accountName: property.accountName,
          bound,
        }),
        lastSyncedAt: new Date(),
      },
      update: {
        displayName: property.displayName,
        status: bound ? GA4_BOUND_ENTITY_STATUS : undefined,
        attributesText: toJsonText({
          accountId: property.accountId,
          accountName: property.accountName,
          bound,
        }),
        lastSyncedAt: new Date(),
      },
    });
  }
}

export async function getBoundGa4Property(): Promise<Ga4PropertyView | null> {
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ANALYTICS_SLUG);
  const entity = await prisma().externalEntity.findFirst({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      entityType: "PROPERTY",
      status: GA4_BOUND_ENTITY_STATUS,
    },
    include: { externalAccount: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!entity) return null;
  let accountName: string | null = null;
  if (entity.attributesText) {
    try {
      const parsed = JSON.parse(entity.attributesText) as { accountName?: string | null };
      accountName = parsed.accountName ?? null;
    } catch {
      accountName = null;
    }
  }
  return toGa4PropertyView(entity.externalAccount, { bound: true, accountName });
}

async function fetchLiveGa4Properties(): Promise<Ga4PropertyView[]> {
  const { client } = await createGa4AuthClient();
  if (!client) return mockGa4Properties();

  const admin = google.analyticsadmin({ version: "v1beta", auth: client });
  const properties: Ga4PropertyView[] = [];
  let pageToken: string | undefined;

  do {
    const response = await admin.accountSummaries.list({ pageSize: 200, pageToken });
    for (const account of response.data.accountSummaries ?? []) {
      const accountId = (account.account ?? "").replace(/^accounts\//, "") || null;
      for (const summary of account.propertySummaries ?? []) {
        const propertyType = String(summary.propertyType ?? "");
        if (propertyType.includes("UNIVERSAL")) continue;
        const propertyId = normalizeGa4PropertyId(summary.property ?? "");
        if (!propertyId) continue;
        properties.push({
          propertyId,
          resourceName: formatGa4PropertyResource(propertyId),
          displayName: summary.displayName ?? `GA4 ${propertyId}`,
          accountId,
          accountName: account.displayName ?? null,
          timeZone: null,
          currencyCode: null,
          bound: false,
        });
      }
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return properties;
}

export async function listGa4Properties(): Promise<Ga4ListResult> {
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ANALYTICS_SLUG);
  const loaded = await loadGa4Connection();
  if (!loaded) {
    throw Object.assign(new Error("Connect Google (Ads + Analytics) first."), {
      status: 401,
      info: {
        kind: "not_connected",
        hint: "Use Connect GA4 on /ops/analytics or /ops/connect. Same OAuth client as Ads.",
      },
    });
  }

  const startedAt = new Date();
  const warnings: string[] = [];
  let properties: Ga4PropertyView[] = [];
  let source: "live" | "mock" = env.mockMode ? "mock" : "live";

  try {
    properties = env.mockMode ? mockGa4Properties() : await fetchLiveGa4Properties();
  } catch (error) {
    if (error instanceof TokenDecryptError || isOpaqueCryptoDecryptError(error)) {
      throw error instanceof TokenDecryptError ? error : new TokenDecryptError();
    }
    await prisma().syncJob.create({
      data: {
        organizationId: ctx.org.id,
        providerId: provider.id,
        status: "FAILED",
        jobType: GA4_LIST_PROPERTIES_JOB_TYPE,
        readOnly: true,
        dryRun: false,
        errorMessage: error instanceof Error ? error.message : "GA4 Admin accountSummaries failed",
        startedAt,
        finishedAt: new Date(),
      },
    });
    throw error;
  }

  const persisted = await upsertGa4Properties(properties, loaded.connection.id);
  const bound = await getBoundGa4Property();
  const boundIds = bound ? new Set([bound.propertyId]) : await listBoundEntityIds(ctx.org.id, provider.id);
  const withBound = persisted.map((property) => ({
    ...property,
    bound: boundIds.has(property.propertyId),
  }));
  await markPropertyEntities(withBound, withBound, bound?.propertyId ?? null);

  await prisma().syncJob.create({
    data: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      status: "SUCCEEDED",
      jobType: GA4_LIST_PROPERTIES_JOB_TYPE,
      readOnly: true,
      dryRun: false,
      requestBody: toJsonText({ source }),
      responseBody: toJsonText({ count: withBound.length }),
      startedAt,
      finishedAt: new Date(),
    },
  });
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    providerId: provider.id,
    action: "external_account.ga4_listed",
    resourceType: "EXTERNAL_ACCOUNT",
    metadata: { source, count: withBound.length, note: GA4_CONNECT_NOTE },
  });

  if (env.mockMode) {
    warnings.push("ADRUNR_MOCK is on. These GA4 properties are fixtures, not the live Admin API.");
    source = "mock";
  }

  return {
    properties: withBound,
    boundPropertyId: bound?.propertyId ?? null,
    source,
    warnings,
  };
}

export async function bindGa4Property(rawPropertyId: string): Promise<Ga4BindResult> {
  const listed = await listGa4Properties();
  const match = findAccessibleGa4Property(rawPropertyId, listed.properties);
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ANALYTICS_SLUG);
  const account = await persistGa4Property(match);
  if (!account) {
    throw Object.assign(new Error("Unable to persist the selected GA4 property."), {
      status: 400,
      info: { kind: "validation", hint: "Pick a property from the list." },
    });
  }

  await prisma().externalEntity.updateMany({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      entityType: "PROPERTY",
      status: GA4_BOUND_ENTITY_STATUS,
      NOT: { externalId: match.propertyId },
    },
    data: { status: GA4_LISTED_ENTITY_STATUS },
  });

  await prisma().externalEntity.upsert({
    where: {
      providerId_externalAccountId_entityType_externalId: {
        providerId: provider.id,
        externalAccountId: account.id,
        entityType: "PROPERTY",
        externalId: match.propertyId,
      },
    },
    create: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      externalAccountId: account.id,
      entityType: "PROPERTY",
      externalId: match.propertyId,
      displayName: match.displayName,
      status: GA4_BOUND_ENTITY_STATUS,
      attributesText: toJsonText({
        accountId: match.accountId,
        accountName: match.accountName,
        bound: true,
      }),
      lastSyncedAt: new Date(),
    },
    update: {
      displayName: match.displayName,
      status: GA4_BOUND_ENTITY_STATUS,
      attributesText: toJsonText({
        accountId: match.accountId,
        accountName: match.accountName,
        bound: true,
      }),
      lastSyncedAt: new Date(),
    },
  });

  await prisma().syncJob.create({
    data: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      externalAccountId: account.id,
      status: "SUCCEEDED",
      jobType: GA4_BIND_JOB_TYPE,
      readOnly: true,
      dryRun: false,
      requestBody: toJsonText({ propertyId: match.propertyId }),
      responseBody: toJsonText({ bound: true, keyEvents: GA4_KEY_EVENTS_NOTE }),
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    providerId: provider.id,
    action: "external_account.ga4_bound",
    resourceType: "EXTERNAL_ACCOUNT",
    resourceId: account.id,
    metadata: { propertyId: match.propertyId, displayName: match.displayName },
  });

  return {
    property: toGa4PropertyView(account, { bound: true, accountName: match.accountName }),
    source: listed.source,
  };
}

async function resolveReportPropertyId(requested?: string | null): Promise<{
  propertyId: string;
  listed: Ga4PropertyView[];
} | { propertyId: ""; listed: Ga4PropertyView[]; reason: string }> {
  const loaded = await loadGa4Connection();
  if (!loaded) {
    return { propertyId: "", listed: [], reason: "Connect Google first. GA4 uses the same OAuth grant as Ads." };
  }

  let listed: Ga4PropertyView[] = [];
  try {
    listed = (await listGa4Properties()).properties;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list GA4 properties.";
    return { propertyId: "", listed: [], reason: message };
  }

  const bound = listed.find((property) => property.bound) ?? (await getBoundGa4Property());
  const requestedId = normalizeGa4PropertyId(requested);
  if (requestedId) {
    try {
      findAccessibleGa4Property(requestedId, listed);
      return { propertyId: requestedId, listed };
    } catch (error) {
      return {
        propertyId: "",
        listed,
        reason: error instanceof Error ? error.message : "That GA4 property is not accessible.",
      };
    }
  }
  if (bound) {
    return { propertyId: bound.propertyId, listed };
  }

  const envId = normalizeGa4PropertyId(getEnv().ga4PropertyId);
  if (envId) {
    try {
      findAccessibleGa4Property(envId, listed);
      return { propertyId: envId, listed };
    } catch {
      return {
        propertyId: "",
        listed,
        reason:
          "GA4_PROPERTY_ID is set but that property is not in the connected user's accessible list. Pick a property from the picker.",
      };
    }
  }

  return {
    propertyId: "",
    listed,
    reason: "Bind a GA4 property to run the 7-day sessions report.",
  };
}

export async function runGa4SampleReport(input?: { propertyId?: string | null }): Promise<Ga4ReportResult> {
  const env = getEnv();
  const resolved = await resolveReportPropertyId(input?.propertyId);

  if (!resolved.propertyId) {
    return stub(
      "reason" in resolved ? resolved.reason : "Bind a GA4 property to run the 7-day sessions report.",
      "",
    );
  }

  const propertyId = resolved.propertyId;
  const displayName =
    resolved.listed.find((property) => property.propertyId === propertyId)?.displayName ?? `GA4 ${propertyId}`;

  if (env.mockMode) {
    await persistGa4Property({
      propertyId,
      displayName,
      accountId: null,
      timeZone: null,
      currencyCode: null,
    });
    return {
      ok: true,
      softFail: false,
      source: "mock",
      keyEvents: GA4_KEY_EVENTS_NOTE,
      report: mockGa4Report(propertyId),
    };
  }

  const loaded = await loadGa4Connection();
  if (!loaded) {
    return stub("Connect Google Ads/Analytics first. GA4 uses the same OAuth grant.", propertyId);
  }

  const scopes = loaded.connection.scopes ?? "";
  if (loaded.source !== "mock" && scopes && !hasGa4Scopes(scopes)) {
    return stub(
      "Connected token is missing analytics.readonly / analytics.edit. Disconnect and Connect again.",
      propertyId,
    );
  }

  try {
    const { client } = await createGa4AuthClient();
    if (!client) {
      return {
        ok: true,
        softFail: false,
        source: "mock",
        keyEvents: GA4_KEY_EVENTS_NOTE,
        report: mockGa4Report(propertyId),
      };
    }

    const analyticsdata = google.analyticsdata({ version: "v1beta", auth: client });
    const result = await analyticsdata.properties.runReport({
      property: formatGa4PropertyResource(propertyId),
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

    await persistGa4Property({
      propertyId,
      displayName,
      accountId: null,
      timeZone: null,
      currencyCode: null,
    });

    const ctx = await ensurePlatformContext();
    const provider = await requireProvider(GOOGLE_ANALYTICS_SLUG);
    await prisma().syncJob.create({
      data: {
        organizationId: ctx.org.id,
        providerId: provider.id,
        status: "SUCCEEDED",
        jobType: GA4_REPORT_JOB_TYPE,
        readOnly: true,
        dryRun: false,
        requestBody: toJsonText({ propertyId, dateRange: { startDate: "7daysAgo", endDate: "today" } }),
        responseBody: toJsonText({ sessions: totals.sessions, keyEvents: GA4_KEY_EVENTS_NOTE }),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });

    return {
      ok: true,
      softFail: false,
      source: "live",
      keyEvents: GA4_KEY_EVENTS_NOTE,
      report: {
        propertyId,
        stub: false,
        source: "live",
        dateRange: { startDate: "7daysAgo", endDate: "today" },
        metrics: ["sessions"],
        rows,
        totals,
        note: "GA4 Data API read-only smoke (sessions last 7 days). Key events stay Coming soon.",
      },
    };
  } catch (error) {
    if (error instanceof TokenDecryptError || isOpaqueCryptoDecryptError(error)) {
      const mapped = error instanceof TokenDecryptError ? error : new TokenDecryptError();
      return stub(`${mapped.message} ${mapped.info.hint}`, propertyId);
    }
    if ((error as { status?: number }).status === 403) {
      return stub(
        error instanceof Error ? error.message : "That GA4 property is not accessible to the connected user.",
        propertyId,
      );
    }
    const message = error instanceof Error ? error.message : "GA4 Data API request failed.";
    return stub(`GA4 soft-fail: ${message}`, propertyId);
  }
}
