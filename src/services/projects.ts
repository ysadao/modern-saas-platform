import { z } from "zod";
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
  await requireMembership(orgId, userId, "ADMIN");
  const project = await prisma.project.create({
    data: {
      organizationId: orgId,
      name: input.name,
      description: input.description,
      status: "ACTIVE",
    },
  });
  await writeAudit({
    userId,
    organizationId: orgId,
    action: "project.created",
    resource: "project",
    resourceId: project.id,
    metadata: { name: project.name },
    ip,
  });
  return project;
}

export async function getProject(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Project not found");
  await requireMembership(project.organizationId, userId, "VIEWER");
  return project;
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: z.infer<typeof updateProjectSchema>,
  ip: string | null,
) {
  const existing = await getProject(userId, projectId);
  await requireMembership(existing.organizationId, userId, "ADMIN");
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
  await writeAudit({
    userId,
    organizationId: project.organizationId,
    action: "project.updated",
    resource: "project",
    resourceId: project.id,
    metadata: { ...input },
    ip,
  });
  return project;
}

export async function deleteProject(userId: string, projectId: string, ip: string | null) {
  const existing = await getProject(userId, projectId);
  await requireMembership(existing.organizationId, userId, "ADMIN");
  await prisma.project.delete({ where: { id: projectId } });
  await writeAudit({
    userId,
    organizationId: existing.organizationId,
    action: "project.deleted",
    resource: "project",
    resourceId: projectId,
    metadata: { name: existing.name },
    ip,
  });
}
