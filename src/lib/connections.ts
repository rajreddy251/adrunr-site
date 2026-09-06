import "server-only";

import type { ConnectionStatus, OAuthConnection } from "@prisma/client";

import { encryptSecret } from "./crypto";
import { getEnv } from "./env";
import { prisma } from "./prisma";
import { GOOGLE_ADS_SLUG, GOOGLE_ANALYTICS_SLUG, GOOGLE_OAUTH_SCOPES } from "./providers";
import { ensurePlatformContext, requireProvider } from "./tenant";
import { writeAudit } from "./audit";

export type TokenBundle = {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  email?: string;
  scope?: string;
  source: "oauth" | "env" | "mock";
};

export async function upsertOAuthConnection(
  providerSlug: string,
  tokens: TokenBundle,
): Promise<OAuthConnection> {
  const provider = await requireProvider(providerSlug);
  const ctx = await ensurePlatformContext(tokens.email, tokens.email);
  const db = prisma();

  const existing = await db.oAuthConnection.findFirst({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });

  const data = {
    organizationId: ctx.org.id,
    userId: ctx.user.id,
    providerId: provider.id,
    providerAccountEmail: tokens.email ?? null,
    scopes: tokens.scope ?? GOOGLE_OAUTH_SCOPES.join(" "),
    accessTokenEncrypted: tokens.accessToken ? encryptSecret(tokens.accessToken) : null,
    refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
    accessTokenExpiresAt: tokens.expiryDate ? new Date(tokens.expiryDate) : null,
    tokenType: "Bearer",
    status: "ACTIVE" as ConnectionStatus,
    revokedAt: null,
  };

  const row = existing
    ? await db.oAuthConnection.update({ where: { id: existing.id }, data })
    : await db.oAuthConnection.create({ data });

  await writeAudit({
    organizationId: ctx.org.id,
    actorUserId: ctx.user.id,
    providerId: provider.id,
    action: existing ? "oauth.connection.updated" : "oauth.connection.created",
    resourceType: "OAUTH_CONNECTION",
    resourceId: row.id,
    metadata: { provider: providerSlug, source: tokens.source, email: tokens.email ?? null },
  });

  return row;
}

export async function saveGoogleTokens(tokens: TokenBundle): Promise<OAuthConnection> {
  const ads = await upsertOAuthConnection(GOOGLE_ADS_SLUG, tokens);
  const scopes = tokens.scope ?? "";
  if (!scopes || scopes.includes("analytics") || tokens.source === "mock") {
    await upsertOAuthConnection(GOOGLE_ANALYTICS_SLUG, tokens);
  }
  return ads;
}

export async function loadActiveConnection(providerSlug = GOOGLE_ADS_SLUG): Promise<{
  connection: OAuthConnection;
  source: "oauth" | "env" | "mock";
} | null> {
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const provider = await requireProvider(providerSlug);
  const db = prisma();

  const connection = await db.oAuthConnection.findFirst({
    where: {
      organizationId: ctx.org.id,
      providerId: provider.id,
      status: "ACTIVE",
      revokedAt: null,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (connection) {
    const source: "oauth" | "env" | "mock" = env.mockMode
      ? "mock"
      : connection.providerAccountEmail
        ? "oauth"
        : env.adsRefreshToken
          ? "env"
          : "oauth";
    return { connection, source };
  }

  if (providerSlug === GOOGLE_ADS_SLUG && env.adsRefreshToken && !env.mockMode) {
    const created = await saveGoogleTokens({
      refreshToken: env.adsRefreshToken,
      source: "env",
    });
    return { connection: created, source: "env" };
  }

  return null;
}

export async function revokeActiveConnections(): Promise<void> {
  const ctx = await ensurePlatformContext();
  const db = prisma();
  const active = await db.oAuthConnection.findMany({
    where: { organizationId: ctx.org.id, status: "ACTIVE" },
  });

  for (const row of active) {
    await db.oAuthConnection.update({
      where: { id: row.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await writeAudit({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      providerId: row.providerId,
      action: "oauth.connection.revoked",
      resourceType: "OAUTH_CONNECTION",
      resourceId: row.id,
    });
  }
}

export async function isGoogleAdsConnected(): Promise<boolean> {
  return Boolean(await loadActiveConnection(GOOGLE_ADS_SLUG));
}
