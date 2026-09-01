import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export async function writeAudit(input: {
  userId?: string | null;
  organizationId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      organizationId: input.organizationId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ?? {},
      ip: input.ip ?? null,
    },
  });
}
