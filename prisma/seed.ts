import { PrismaClient } from "@prisma/client";

import { buildClientRolePermissionRows, buildRolePermissionRows } from "../src/lib/permissions";
import { SEED_PROVIDERS } from "../src/lib/providers";

const prisma = new PrismaClient();

const PLATFORM_ORG_SLUG = "adrunr";
const DEFAULT_CLIENT_SLUG = "default";
const OPS_USER_EMAIL = "ops@adrunr.local";

async function main() {
  for (const provider of SEED_PROVIDERS) {
    await prisma.integrationProvider.upsert({
      where: { slug: provider.slug },
      create: provider,
      update: {
        name: provider.name,
        category: provider.category,
        isActive: provider.isActive,
        oauthAuthUrl: provider.oauthAuthUrl,
        oauthTokenUrl: provider.oauthTokenUrl,
        defaultScopes: provider.defaultScopes,
      },
    });
  }

  for (const row of buildRolePermissionRows()) {
    await prisma.rolePermission.upsert({
      where: {
        role_resource_action: {
          role: row.role,
          resource: row.resource,
          action: row.action,
        },
      },
      create: row,
      update: {},
    });
  }

  for (const row of buildClientRolePermissionRows()) {
    await prisma.clientRolePermission.upsert({
      where: {
        role_resource_action: {
          role: row.role,
          resource: row.resource,
          action: row.action,
        },
      },
      create: row,
      update: {},
    });
  }

  const org = await prisma.organization.upsert({
    where: { slug: PLATFORM_ORG_SLUG },
    create: { type: "PLATFORM", name: "Adrunr", slug: PLATFORM_ORG_SLUG },
    update: {},
  });

  const user = await prisma.user.upsert({
    where: { email: OPS_USER_EMAIL },
    create: { email: OPS_USER_EMAIL, name: "Adrunr Ops" },
    update: {},
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    create: { organizationId: org.id, userId: user.id, role: "PLATFORM_OPS" },
    update: {},
  });

  const client = await prisma.client.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: DEFAULT_CLIENT_SLUG } },
    create: { organizationId: org.id, name: "Default client", slug: DEFAULT_CLIENT_SLUG },
    update: {},
  });

  await prisma.clientMembership.upsert({
    where: { clientId_userId: { clientId: client.id, userId: user.id } },
    create: { clientId: client.id, userId: user.id, role: "CLIENT_ADMIN" },
    update: {},
  });

  const workspace = await prisma.workspace.findFirst({
    where: { organizationId: org.id, clientId: client.id, name: "Default workspace" },
  });
  if (!workspace) {
    await prisma.workspace.create({
      data: { organizationId: org.id, clientId: client.id, name: "Default workspace" },
    });
  }

  await prisma.clientMemory.upsert({
    where: { clientId_key: { clientId: client.id, key: "ops_tone" } },
    create: {
      clientId: client.id,
      key: "ops_tone",
      value: "Prefers PAUSED Search, Display, Performance Max, Demand Gen, Video, Shopping, App, Hotel, Local, and Local Services drafts. Dry-run before apply. Chat never validates or enables. Listings sync is read-only — it caches live campaigns/ad groups/ads/keywords and never unpauses. Metrics sync is read-only — it caches campaign budget and spend snapshots and never spends or enables. Performance reports are read-only — they roll up cached metrics or googleAds:search and never enable or spend. Cached ENABLED is a snapshot only. Remarketing is a Display audience. PMax uses asset groups and search-theme signals. Demand Gen uses ad groups, multi-asset ads, and USER_LIST audiences. Video uses ad groups, YouTube video responsive ads, format inventory, and USER_LIST audiences. Shopping uses Merchant Center, ALL_PRODUCTS product groups, and optional listings. App uses Android / iOS app ids and INSTALLS (downloads) with TARGET_CPA. Hotel uses Hotel Center, percent CPC, and ALL_HOTELS listings. Local uses store visits, a business location, and one local ad. Local Services uses a PRIMARY category and a max bid per lead.",
      source: "seed",
    },
    update: {
      value: "Prefers PAUSED Search, Display, Performance Max, Demand Gen, Video, Shopping, App, Hotel, Local, and Local Services drafts. Dry-run before apply. Chat never validates or enables. Listings sync is read-only — it caches live campaigns/ad groups/ads/keywords and never unpauses. Metrics sync is read-only — it caches campaign budget and spend snapshots and never spends or enables. Performance reports are read-only — they roll up cached metrics or googleAds:search and never enable or spend. Cached ENABLED is a snapshot only. Remarketing is a Display audience. PMax uses asset groups and search-theme signals. Demand Gen uses ad groups, multi-asset ads, and USER_LIST audiences. Video uses ad groups, YouTube video responsive ads, format inventory, and USER_LIST audiences. Shopping uses Merchant Center, ALL_PRODUCTS product groups, and optional listings. App uses Android / iOS app ids and INSTALLS (downloads) with TARGET_CPA. Hotel uses Hotel Center, percent CPC, and ALL_HOTELS listings. Local uses store visits, a business location, and one local ad. Local Services uses a PRIMARY category and a max bid per lead.",
    },
  });

  const providerCount = await prisma.integrationProvider.count();
  const permissionCount = await prisma.rolePermission.count();
  const clientPermissionCount = await prisma.clientRolePermission.count();
  console.log(
    `Seeded ${providerCount} providers, ${permissionCount} role permissions, ${clientPermissionCount} client role permissions, platform org ${org.slug}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
