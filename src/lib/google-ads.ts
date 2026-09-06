import "server-only";

import { upsertExternalAccount, upsertGoogleAdsAccounts, toAccountView } from "./accounts";
import { AdsApiError } from "./ads-errors";
import { writeAudit } from "./audit";
import { buildPausedSearchCampaignMutate, parseCampaignInput } from "./campaign";
import { adsConfigured, getEnv } from "./env";
import { toJsonText } from "./http";
import {
  digitsOnly,
  formatCustomerId,
  isKnownNotEnabledCustomer,
  parseCustomerResourceName,
  PLATFORM_MCC_ID,
} from "./ids";
import { loadActiveConnection } from "./connections";
import { mockAccounts } from "./mock-data";
import { getAccessToken } from "./oauth";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG } from "./providers";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { AdsAccountView } from "./types";

const CUSTOMER_CLIENT_QUERY = `
  SELECT
    customer_client.client_customer,
    customer_client.descriptive_name,
    customer_client.id,
    customer_client.manager,
    customer_client.status,
    customer_client.level,
    customer_client.test_account
  FROM customer_client
  WHERE customer_client.level <= 1
`.trim();

async function adsFetch(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    customerId?: string;
    accessToken: string;
  },
): Promise<unknown> {
  const env = getEnv();
  const url = `https://googleads.googleapis.com/${env.adsApiVersion}/${path.replace(/^\//, "")}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${init.accessToken}`,
    "developer-token": env.adsDeveloperToken,
    "content-type": "application/json",
    "login-customer-id": env.loginCustomerId || PLATFORM_MCC_ID,
  };

  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }
  }

  if (!response.ok) {
    throw new AdsApiError(response.status, json ?? { message: text }, init.customerId);
  }
  return json;
}

async function requireLiveContext() {
  const env = getEnv();
  const loaded = await loadActiveConnection(GOOGLE_ADS_SLUG);
  if (!loaded) {
    throw Object.assign(new Error("Google Ads is not connected."), {
      status: 401,
      info: {
        kind: "not_connected",
        hint: "Click Connect Google Ads, or set GOOGLE_ADS_REFRESH_TOKEN / ADRUNR_MOCK=1.",
      },
    });
  }
  if (!adsConfigured(env)) {
    throw Object.assign(new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not set."), {
      status: 400,
      info: {
        kind: "developer_token",
        hint: "Add the Test Account developer token to .env.local. Production MCC access needs Basic Access approval.",
      },
    });
  }
  const accessToken = await getAccessToken();
  return { env, loaded, accessToken };
}

function rowToAccount(row: Record<string, unknown>): AdsAccountView {
  const client = (row.customerClient ?? row.customer ?? {}) as Record<string, unknown>;
  const customerId = digitsOnly(
    String(client.id ?? parseCustomerResourceName(String(client.clientCustomer ?? ""))),
  );
  const warning = isKnownNotEnabledCustomer(customerId)
    ? "CUSTOMER_NOT_ENABLED — known for 485-651-7690. Listed for visibility; mutations are blocked."
    : null;

  return {
    customerId,
    descriptiveName: String(client.descriptiveName ?? "Untitled customer"),
    formattedId: formatCustomerId(customerId),
    manager: Boolean(client.manager),
    status: warning ? "NOT_ENABLED" : String(client.status ?? "UNKNOWN"),
    testAccount: Boolean(client.testAccount),
    level: typeof client.level === "number" ? client.level : client.level ? Number(client.level) : null,
    warning,
  };
}

export async function listAccounts(): Promise<{
  accounts: AdsAccountView[];
  source: "live" | "mock";
  loginCustomerId: string;
  warnings: string[];
}> {
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (env.mockMode) {
    const loaded = await loadActiveConnection(GOOGLE_ADS_SLUG);
    const accounts = await upsertGoogleAdsAccounts(mockAccounts(), loaded?.connection.id);
    const sync = await prisma().syncJob.create({
      data: {
        organizationId: ctx.org.id,
        providerId: provider.id,
        status: "SUCCEEDED",
        jobType: "list_accounts",
        requestBody: toJsonText({ source: "mock" }),
        responseBody: toJsonText({ count: accounts.length }),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "external_account.listed",
      resourceType: "EXTERNAL_ACCOUNT",
      resourceId: sync.id,
      metadata: { source: "mock", count: accounts.length },
    });
    return {
      accounts,
      source: "mock",
      loginCustomerId: env.loginCustomerId,
      warnings: [
        "ADRUNR_MOCK is on. These accounts are fixtures, including known CUSTOMER_NOT_ENABLED 485-651-7690.",
      ],
    };
  }

  const { accessToken, loaded } = await requireLiveContext();
  const warnings: string[] = [];
  const loginCustomerId = env.loginCustomerId;
  let accounts: AdsAccountView[] = [];
  const startedAt = new Date();

  try {
    const search = (await adsFetch(`customers/${loginCustomerId}/googleAds:search`, {
      method: "POST",
      accessToken,
      customerId: loginCustomerId,
      body: { query: CUSTOMER_CLIENT_QUERY },
    })) as { results?: Array<Record<string, unknown>> };

    accounts = (search.results ?? []).map(rowToAccount);
  } catch (error) {
    if (error instanceof AdsApiError) {
      warnings.push(`${error.info.code}: ${error.info.message} — ${error.info.hint}`);
    } else {
      warnings.push(error instanceof Error ? error.message : "MCC customer_client search failed.");
    }
  }

  if (accounts.length === 0) {
    try {
      const listed = (await adsFetch("customers:listAccessibleCustomers", {
        accessToken,
      })) as { resourceNames?: string[] };

      const ids = (listed.resourceNames ?? []).map(parseCustomerResourceName);
      const enriched: AdsAccountView[] = [];
      for (const id of ids) {
        try {
          const search = (await adsFetch(`customers/${id}/googleAds:search`, {
            method: "POST",
            accessToken,
            customerId: id,
            body: {
              query:
                "SELECT customer.id, customer.descriptive_name, customer.manager, customer.test_account, customer.status FROM customer LIMIT 1",
            },
          })) as { results?: Array<Record<string, unknown>> };
          const row = search.results?.[0];
          enriched.push(
            row
              ? rowToAccount(row)
              : {
                  customerId: id,
                  descriptiveName: "Accessible customer",
                  formattedId: formatCustomerId(id),
                  manager: false,
                  status: "UNKNOWN",
                  testAccount: false,
                  level: null,
                  warning: isKnownNotEnabledCustomer(id)
                    ? "CUSTOMER_NOT_ENABLED — known for 485-651-7690."
                    : null,
                },
          );
        } catch (error) {
          const info = error instanceof AdsApiError ? error.info : null;
          enriched.push({
            customerId: id,
            descriptiveName: info?.kind === "customer_not_enabled" ? "Not enabled" : "Unreadable customer",
            formattedId: formatCustomerId(id),
            manager: false,
            status: info?.kind === "customer_not_enabled" ? "NOT_ENABLED" : "ERROR",
            testAccount: false,
            level: null,
            warning: info ? `${info.code}: ${info.hint}` : error instanceof Error ? error.message : "Lookup failed",
          });
        }
      }
      accounts = enriched;
    } catch (error) {
      await prisma().syncJob.create({
        data: {
          organizationId: ctx.org.id,
          providerId: provider.id,
          status: "FAILED",
          jobType: "list_accounts",
          errorMessage: error instanceof Error ? error.message : "listAccessibleCustomers failed",
          startedAt,
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  const persisted = await upsertGoogleAdsAccounts(accounts, loaded.connection.id);
  await prisma().syncJob.create({
    data: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      status: "SUCCEEDED",
      jobType: "list_accounts",
      requestBody: toJsonText({ loginCustomerId }),
      responseBody: toJsonText({ count: persisted.length, warnings }),
      startedAt,
      finishedAt: new Date(),
    },
  });
  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    providerId: provider.id,
    action: "external_account.listed",
    resourceType: "EXTERNAL_ACCOUNT",
    metadata: { source: "live", count: persisted.length },
  });

  return { accounts: persisted, source: "live", loginCustomerId, warnings };
}

export async function createPausedSearchCampaign(body: unknown): Promise<{
  dryRun: boolean;
  applied: boolean;
  status: "PAUSED";
  request: ReturnType<typeof buildPausedSearchCampaignMutate>;
  response: unknown;
  source: "live" | "mock";
  campaignOpId: string;
}> {
  const input = parseCampaignInput(body);
  const request = buildPausedSearchCampaignMutate(input);
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);

  if (isKnownNotEnabledCustomer(input.customerId)) {
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: "campaign_op.blocked",
      resourceType: "CAMPAIGN_OP",
      resourceId: input.customerId,
      metadata: { reason: "CUSTOMER_NOT_ENABLED", customerId: input.customerId },
    });
    throw Object.assign(
      new Error("Refusing mutate on known CUSTOMER_NOT_ENABLED account 485-651-7690."),
      {
        status: 400,
        info: {
          kind: "customer_not_enabled",
          hint: "Pick an enabled customer under MCC 857-080-5596.",
        },
      },
    );
  }

  let external = await prisma().externalAccount.findFirst({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      externalId: input.customerId,
    },
  });
  if (!external) {
    const loaded = await loadActiveConnection(GOOGLE_ADS_SLUG);
    external = await upsertExternalAccount({
      providerSlug: GOOGLE_ADS_SLUG,
      externalId: input.customerId,
      displayName: input.customerId,
      oauthConnectionId: loaded?.connection.id,
    });
  }

  const campaignOp = await prisma().campaignOp.create({
    data: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      workspaceId: ctx.workspace.id,
      providerId: provider.id,
      externalAccountId: external.id,
      requestedById: ctx.user.id,
      kind: input.kind ?? "SEARCH_CREATE",
      status: "DRAFT",
      name: input.name,
      dailyBudgetMicros: BigInt(input.dailyBudgetMicros),
      dryRun: request.validateOnly,
      confirmPhrase: input.confirmPhrase ?? null,
      requestPayload: toJsonText(request),
      googleValidateOnly: request.validateOnly,
    },
  });

  async function persistResult(result: {
    dryRun: boolean;
    applied: boolean;
    response: unknown;
    source: "live" | "mock";
    success: boolean;
    errorMessage?: string;
  }) {
    await prisma().dryRunJob.create({
      data: {
        organizationId: ctx.org.id,
        providerId: provider.id,
        campaignOpId: campaignOp.id,
        externalAccountId: external!.id,
        validateOnly: request.validateOnly,
        requestBody: toJsonText(request),
        responseBody: toJsonText(result.response),
        success: result.success,
      },
    });

    await prisma().campaignOp.update({
      where: { id: campaignOp.id },
      data: {
        status: result.success
          ? request.validateOnly
            ? "DRY_RUN_VALIDATED"
            : "APPLIED_PAUSED"
          : "FAILED",
        responsePayload: toJsonText(result.response),
        errorMessage: result.errorMessage ?? null,
        appliedAt: result.applied ? new Date() : null,
      },
    });

    if (result.applied && result.success) {
      await prisma().changeRequest.create({
        data: {
          organizationId: ctx.org.id,
          providerId: provider.id,
          campaignOpId: campaignOp.id,
          requestedById: ctx.user.id,
          summary: `Apply PAUSED Search campaign ${input.name}`,
          approved: true,
          reviewedAt: new Date(),
        },
      });
      await prisma().externalEntity.upsert({
        where: {
          providerId_externalAccountId_entityType_externalId: {
            providerId: provider.id,
            externalAccountId: external!.id,
            entityType: "CAMPAIGN",
            externalId: campaignOp.id,
          },
        },
        create: {
          organizationId: ctx.org.id,
          providerId: provider.id,
          externalAccountId: external!.id,
          entityType: "CAMPAIGN",
          externalId: campaignOp.id,
          displayName: input.name,
          status: "PAUSED",
          attributesText: toJsonText({ dailyBudgetMicros: input.dailyBudgetMicros, dryRun: false }),
          lastSyncedAt: new Date(),
        },
        update: {
          displayName: input.name,
          status: "PAUSED",
          lastSyncedAt: new Date(),
        },
      });
    }

    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: provider.id,
      action: result.success
        ? request.validateOnly
          ? "campaign_op.dry_run"
          : "campaign_op.applied_paused"
        : "campaign_op.failed",
      resourceType: "CAMPAIGN_OP",
      resourceId: campaignOp.id,
      metadata: {
        customerId: input.customerId,
        dryRun: request.validateOnly,
        source: result.source,
      },
    });
  }

  if (env.mockMode) {
    const response = {
      validateOnly: request.validateOnly,
      mock: true,
      note: request.validateOnly
        ? "Dry-run: mutate payload validated locally. Nothing was sent to Google Ads."
        : "Mock apply: would create a PAUSED Search campaign. No live mutate executed.",
    };
    await persistResult({
      dryRun: request.validateOnly,
      applied: !request.validateOnly,
      response,
      source: "mock",
      success: true,
    });
    return {
      dryRun: request.validateOnly,
      applied: !request.validateOnly,
      status: "PAUSED",
      request,
      response,
      source: "mock",
      campaignOpId: campaignOp.id,
    };
  }

  try {
    const { accessToken } = await requireLiveContext();
    const response = await adsFetch(`customers/${request.customerId}/googleAds:mutate`, {
      method: "POST",
      accessToken,
      customerId: request.customerId,
      body: {
        mutateOperations: request.mutateOperations,
        validateOnly: request.validateOnly,
        responseContentType: request.responseContentType,
      },
    });
    await persistResult({
      dryRun: request.validateOnly,
      applied: !request.validateOnly,
      response,
      source: "live",
      success: true,
    });
    return {
      dryRun: request.validateOnly,
      applied: !request.validateOnly,
      status: "PAUSED",
      request,
      response,
      source: "live",
      campaignOpId: campaignOp.id,
    };
  } catch (error) {
    await persistResult({
      dryRun: request.validateOnly,
      applied: false,
      response: { error: error instanceof Error ? error.message : String(error) },
      source: "live",
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function searchGoogleAds(
  customerId: string,
  query: string,
): Promise<Array<Record<string, unknown>>> {
  const { accessToken } = await requireLiveContext();
  const results: Array<Record<string, unknown>> = [];
  let pageToken: string | undefined;
  do {
    const body: Record<string, unknown> = { query };
    if (pageToken) body.pageToken = pageToken;
    const page = (await adsFetch(`customers/${customerId}/googleAds:search`, {
      method: "POST",
      accessToken,
      customerId,
      body,
    })) as { results?: Array<Record<string, unknown>>; nextPageToken?: string };
    results.push(...(page.results ?? []));
    pageToken = page.nextPageToken || undefined;
  } while (pageToken);
  return results;
}

export async function mutateGoogleAds(input: {
  customerId: string;
  mutateOperations: Array<Record<string, unknown>>;
  validateOnly: boolean;
  responseContentType?: string;
}): Promise<unknown> {
  const { accessToken } = await requireLiveContext();
  return adsFetch(`customers/${input.customerId}/googleAds:mutate`, {
    method: "POST",
    accessToken,
    customerId: input.customerId,
    body: {
      mutateOperations: input.mutateOperations,
      validateOnly: input.validateOnly,
      responseContentType: input.responseContentType ?? "MUTABLE_RESOURCE",
    },
  });
}

export async function getPersistedGoogleAdsAccounts(): Promise<AdsAccountView[]> {
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(GOOGLE_ADS_SLUG);
  const rows = await prisma().externalAccount.findMany({
    where: { organizationId: ctx.org.id, providerId: provider.id },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => toAccountView(row));
}
