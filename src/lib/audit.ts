import "server-only";

import { prisma } from "./prisma";
import type { AuditEventView } from "./types";

export async function writeAudit(input: {
  organizationId?: string | null;
  actorUserId?: string | null;
  providerId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: unknown;
}): Promise<void> {
  await prisma().auditEvent.create({
    data: {
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      providerId: input.providerId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadataText:
        input.metadata === undefined
          ? null
          : typeof input.metadata === "string"
            ? input.metadata
            : JSON.stringify(input.metadata),
    },
  });
}

export async function listAuditEvents(organizationId: string, take = 40): Promise<AuditEventView[]> {
  const rows = await prisma().auditEvent.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    providerId: row.providerId,
    metadataText: row.metadataText,
    createdAt: row.createdAt.toISOString(),
  }));
}
