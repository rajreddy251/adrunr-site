import "server-only";

import { listAuditEvents } from "./audit";
import { loadActiveConnection } from "./connections";
import { adsConfigured, getEnv, oauthConfigured } from "./env";
import { getBoundGa4Property } from "./ga4";
import { hasGa4Scopes } from "./ga4-shared";
import { OAUTH_SCOPES } from "./oauth";
import { prisma } from "./prisma";
import { GOOGLE_ANALYTICS_SLUG, isConnectEnabled } from "./providers";
import { ensurePlatformContext, seedIntegrationProviders } from "./tenant";
import type { ConnectionStatusView, ProviderView } from "./types";

export async function getConnectionStatus(): Promise<ConnectionStatusView> {
  const env = getEnv();
  const ctx = await ensurePlatformContext();
  const providers = await seedIntegrationProviders();
  const ads = await loadActiveConnection();
  const ga4 = await loadActiveConnection(GOOGLE_ANALYTICS_SLUG);
  const bound = await getBoundGa4Property();
  const ga4Connected = Boolean(ga4) || (Boolean(ads) && hasGa4Scopes(ads?.connection.scopes));

  const views: ProviderView[] = [];
  for (const provider of providers) {
    const connection = await prisma().oAuthConnection.findFirst({
      where: {
        organizationId: ctx.org.id,
        providerId: provider.id,
        status: "ACTIVE",
        revokedAt: null,
      },
    });
    views.push({
      slug: provider.slug,
      name: provider.name,
      category: provider.category,
      isActive: provider.isActive,
      connectEnabled: isConnectEnabled(provider.slug),
      connected: Boolean(connection),
      accountEmail: connection?.providerAccountEmail ?? null,
    });
  }

  return {
    connected: Boolean(ads),
    mockMode: env.mockMode,
    email: ads?.connection.providerAccountEmail ?? (ads?.source === "env" ? "env refresh token" : null),
    source: ads?.source ?? null,
    oauthConfigured: oauthConfigured(env),
    adsConfigured: adsConfigured(env),
    loginCustomerId: env.loginCustomerId,
    ga4Connected,
    ga4PropertyId: bound?.propertyId ?? (env.ga4PropertyId || null),
    ga4BoundPropertyId: bound?.propertyId ?? null,
    ga4BoundDisplayName: bound?.displayName ?? null,
    scopes: [...OAUTH_SCOPES],
    databaseConfigured: Boolean(env.databaseUrl),
    organizationSlug: ctx.org.slug,
    providers: views,
  };
}

export async function getOpsSnapshot() {
  const status = await getConnectionStatus();
  const ctx = await ensurePlatformContext();
  const audit = await listAuditEvents(ctx.org.id);
  return { status, audit, context: { organization: ctx.org.slug, client: ctx.client.slug } };
}
