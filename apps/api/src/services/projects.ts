import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, type Project } from "../types.js";
import { requireMembership } from "./organizations.js";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  description: z.string().max(2000).default(""),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export async function listProjects(ctx: AppContext, userId: string, orgId: string) {
  await requireMembership(ctx, orgId, userId, "VIEWER");
  const db = await ctx.store.read();
  return db.projects.filter((p) => p.organizationId === orgId);
}

export async function createProject(
  ctx: AppContext,
  userId: string,
  orgId: string,
  input: z.infer<typeof createProjectSchema>,
  ip: string | null,
) {
  await requireMembership(ctx, orgId, userId, "ADMIN");
  const project: Project = {
    id: randomUUID(),
    organizationId: orgId,
    name: input.name,
    description: input.description,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await ctx.store.update((db) => {
    db.projects.push(project);
    db.audit.push({
      id: randomUUID(),
      organizationId: orgId,
      actorUserId: userId,
      action: "project.created",
      resourceType: "project",
      resourceId: project.id,
      metadata: { name: project.name },
      ip,
      createdAt: new Date().toISOString(),
    });
  });
  return project;
}

export async function getProject(ctx: AppContext, userId: string, projectId: string) {
  const db = await ctx.store.read();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) throw new HttpError(404, "Project not found");
  await requireMembership(ctx, project.organizationId, userId, "VIEWER");
  return project;
}

export async function updateProject(
  ctx: AppContext,
  userId: string,
  projectId: string,
  input: z.infer<typeof updateProjectSchema>,
  ip: string | null,
) {
  const existing = await getProject(ctx, userId, projectId);
  await requireMembership(ctx, existing.organizationId, userId, "ADMIN");
  let updated: Project | undefined;
  await ctx.store.update((db) => {
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) throw new HttpError(404, "Project not found");
    if (input.name !== undefined) project.name = input.name;
    if (input.description !== undefined) project.description = input.description;
    if (input.status !== undefined) project.status = input.status;
    project.updatedAt = new Date().toISOString();
    updated = project;
    db.audit.push({
      id: randomUUID(),
      organizationId: project.organizationId,
      actorUserId: userId,
      action: "project.updated",
      resourceType: "project",
      resourceId: project.id,
      metadata: { ...input },
      ip,
      createdAt: new Date().toISOString(),
    });
  });
  return updated!;
}

export async function deleteProject(ctx: AppContext, userId: string, projectId: string, ip: string | null) {
  const existing = await getProject(ctx, userId, projectId);
  await requireMembership(ctx, existing.organizationId, userId, "ADMIN");
  await ctx.store.update((db) => {
    db.projects = db.projects.filter((p) => p.id !== projectId);
    db.audit.push({
      id: randomUUID(),
      organizationId: existing.organizationId,
      actorUserId: userId,
      action: "project.deleted",
      resourceType: "project",
      resourceId: projectId,
      metadata: { name: existing.name },
      ip,
      createdAt: new Date().toISOString(),
    });
  });
}
