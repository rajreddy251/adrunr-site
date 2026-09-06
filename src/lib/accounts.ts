import "server-only";

import type { ExternalAccount, ExternalAccountStatus } from "@prisma/client";

import { formatCustomerId, isKnownNotEnabledCustomer } from "./ids";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG } from "./providers";
import { ensurePlatformContext, requireProvider } from "./tenant";
import type { AdsAccountView } from "./types";

export function mapAdsStatus(status: string | undefined, customerId: string): ExternalAccountStatus {
  if (isKnownNotEnabledCustomer(customerId)) return "NOT_ENABLED";
  const upper = (status ?? "").toUpperCase();
  if (upper === "ENABLED") return "ENABLED";
  if (upper === "CANCELED" || upper === "CANCELLED") return "CANCELED";
  if (upper === "SUSPENDED") return "SUSPENDED";
  if (upper.includes("NOT_ENABLED") || upper.includes("CUSTOMER_NOT_ENABLED")) return "NOT_ENABLED";
  if (upper === "DISCONNECTED") return "DISCONNECTED";
  return "UNKNOWN";
}

export function toAccountView(row: ExternalAccount, warning?: string | null): AdsAccountView {
  const customerId = row.externalId;
  const knownWarning = isKnownNotEnabledCustomer(customerId)
    ? "CUSTOMER_NOT_ENABLED — known for 485-651-7690. Listed for visibility; mutations are blocked."
    : null;
  return {
    customerId,
    descriptiveName: row.displayName ?? "Untitled customer",
    formattedId: formatCustomerId(customerId),
    manager: row.isManager,
    status: row.status,
    testAccount: row.isTest,
    level: row.parentExternalId ? 1 : row.isManager ? 0 : 1,
    warning: warning ?? knownWarning,
    externalAccountId: row.id,
  };
}

export async function upsertExternalAccount(input: {
  providerSlug: string;
  externalId: string;
  displayName?: string | null;
  currencyCode?: string | null;
  timeZone?: string | null;
  isManager?: boolean;
  isTest?: boolean;
  status?: ExternalAccountStatus;
  parentExternalId?: string | null;
  oauthConnectionId?: string | null;
}): Promise<ExternalAccount> {
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(input.providerSlug);
  return prisma().externalAccount.upsert({
    where: {
      organizationId_providerId_externalId: {
        organizationId: ctx.org.id,
        providerId: provider.id,
        externalId: input.externalId,
      },
    },
    create: {
      organizationId: ctx.org.id,
      clientId: ctx.client.id,
      providerId: provider.id,
      oauthConnectionId: input.oauthConnectionId ?? null,
      externalId: input.externalId,
      displayName: input.displayName ?? null,
      currencyCode: input.currencyCode ?? null,
      timeZone: input.timeZone ?? null,
      isManager: input.isManager ?? false,
      isTest: input.isTest ?? false,
      status: input.status ?? "UNKNOWN",
      parentExternalId: input.parentExternalId ?? null,
    },
    update: {
      displayName: input.displayName ?? undefined,
      currencyCode: input.currencyCode ?? undefined,
      timeZone: input.timeZone ?? undefined,
      isManager: input.isManager ?? undefined,
      isTest: input.isTest ?? undefined,
      status: input.status,
      parentExternalId: input.parentExternalId ?? undefined,
      oauthConnectionId: input.oauthConnectionId ?? undefined,
    },
  });
}

export async function upsertGoogleAdsAccounts(
  accounts: AdsAccountView[],
  oauthConnectionId?: string | null,
): Promise<AdsAccountView[]> {
  const persisted: AdsAccountView[] = [];
  for (const account of accounts) {
    const row = await upsertExternalAccount({
      providerSlug: GOOGLE_ADS_SLUG,
      externalId: account.customerId,
      displayName: account.descriptiveName,
      isManager: account.manager,
      isTest: account.testAccount,
      status: mapAdsStatus(account.status, account.customerId),
      parentExternalId: account.manager ? null : undefined,
      oauthConnectionId,
    });
    persisted.push(toAccountView(row, account.warning));
  }
  return persisted;
}
