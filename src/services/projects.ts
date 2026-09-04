import { z } from "zod";
import { canManageProjects } from "../domain/rbac.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { writeAudit } from "../lib/audit.js";
import { requireMembership } from "./organizations.js";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  description: z.string().max(2000).default(""),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export async function listProjects(userId: string, orgId: string) {
  await requireMembership(orgId, userId, "VIEWER");
  return prisma.project.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createProject(
  userId: string,
  orgId: string,
  input: z.infer<typeof createProjectSchema>,
  ip: string | null,
) {
  const { membership } = await requireMembership(orgId, userId, "ADMIN");
  const gate = canManageProjects(membership.role);
  if (!gate.ok) throw new HttpError(gate.status, gate.message);

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        organizationId: orgId,
        name: input.name,
        description: input.description,
        status: "ACTIVE",
      },
    });
    await writeAudit(
      {
        userId,
        organizationId: orgId,
        action: "project.created",
        resource: "project",
        resourceId: project.id,
        metadata: { name: project.name },
        ip,
      },
      tx,
    );
    return project;
  });
}

/**
 * Cross-tenant project access returns 404 (not 403) so IDs are not enumerable
 * as "exists but forbidden".
 */
export async function getProject(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Project not found");
  const membership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: project.organizationId },
    },
  });
  if (!membership) throw new HttpError(404, "Project not found");
  return project;
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: z.infer<typeof updateProjectSchema>,
  ip: string | null,
) {
  const existing = await getProject(userId, projectId);
  const { membership } = await requireMembership(existing.organizationId, userId, "ADMIN");
  const gate = canManageProjects(membership.role);
  if (!gate.ok) throw new HttpError(gate.status, gate.message);

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.update({
      where: { id: projectId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    await writeAudit(
      {
        userId,
        organizationId: project.organizationId,
        action: "project.updated",
        resource: "project",
        resourceId: project.id,
        metadata: { ...input },
        ip,
      },
      tx,
    );
    return project;
  });
}

export async function deleteProject(userId: string, projectId: string, ip: string | null) {
  const existing = await getProject(userId, projectId);
  const { membership } = await requireMembership(existing.organizationId, userId, "ADMIN");
  const gate = canManageProjects(membership.role);
  if (!gate.ok) throw new HttpError(gate.status, gate.message);

  await prisma.$transaction(async (tx) => {
    await writeAudit(
      {
        userId,
        organizationId: existing.organizationId,
        action: "project.deleted",
        resource: "project",
        resourceId: projectId,
        metadata: { name: existing.name },
        ip,
      },
      tx,
    );
    await tx.project.delete({ where: { id: projectId } });
  });
}
