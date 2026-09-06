import "server-only";

import type { IntegrationProvider, Organization, User, Client, Workspace } from "@prisma/client";

import { MOCK_EMAIL } from "./mock-data";
import { prisma } from "./prisma";
import { SEED_PROVIDERS } from "./providers";

export const PLATFORM_ORG_SLUG = "adrunr";
export const DEFAULT_CLIENT_SLUG = "default";
export const DEFAULT_WORKSPACE_NAME = "Default workspace";
export const OPS_USER_EMAIL = MOCK_EMAIL;

export type PlatformContext = {
  org: Organization;
  user: User;
  client: Client;
  workspace: Workspace;
};

export async function seedIntegrationProviders(): Promise<IntegrationProvider[]> {
  const db = prisma();
  const rows: IntegrationProvider[] = [];
  for (const provider of SEED_PROVIDERS) {
    const row = await db.integrationProvider.upsert({
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
    rows.push(row);
  }
  return rows;
}

export async function requireProvider(slug: string): Promise<IntegrationProvider> {
  const db = prisma();
  const existing = await db.integrationProvider.findUnique({ where: { slug } });
  if (existing) return existing;
  await seedIntegrationProviders();
  const created = await db.integrationProvider.findUnique({ where: { slug } });
  if (!created) {
    throw Object.assign(new Error(`Integration provider ${slug} is not seeded.`), {
      status: 500,
      info: { kind: "config", hint: "Run prisma db seed." },
    });
  }
  return created;
}

export async function ensurePlatformContext(email?: string, name?: string): Promise<PlatformContext> {
  const db = prisma();
  await seedIntegrationProviders();

  const org = await db.organization.upsert({
    where: { slug: PLATFORM_ORG_SLUG },
    create: { type: "PLATFORM", name: "Adrunr", slug: PLATFORM_ORG_SLUG },
    update: {},
  });

  const userEmail = (email ?? OPS_USER_EMAIL).toLowerCase();
  const user = await db.user.upsert({
    where: { email: userEmail },
    create: { email: userEmail, name: name ?? "Adrunr Ops" },
    update: name ? { name } : {},
  });

  await db.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    create: { organizationId: org.id, userId: user.id, role: "PLATFORM_OPS" },
    update: {},
  });

  const client = await db.client.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: DEFAULT_CLIENT_SLUG } },
    create: { organizationId: org.id, name: "Default client", slug: DEFAULT_CLIENT_SLUG },
    update: {},
  });

  await db.clientMembership.upsert({
    where: { clientId_userId: { clientId: client.id, userId: user.id } },
    create: { clientId: client.id, userId: user.id, role: "CLIENT_ADMIN" },
    update: {},
  });

  let workspace = await db.workspace.findFirst({
    where: { organizationId: org.id, clientId: client.id, name: DEFAULT_WORKSPACE_NAME },
  });
  if (!workspace) {
    workspace = await db.workspace.create({
      data: { organizationId: org.id, clientId: client.id, name: DEFAULT_WORKSPACE_NAME },
    });
  }

  return { org, user, client, workspace };
}
