import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, ROLE_RANK, type Membership, type Organization, type Role } from "../types.js";

export const createOrgSchema = z.object({
  name: z.string().min(2).max(80).trim(),
});

export const updateOrgSchema = z.object({
  name: z.string().min(2).max(80).trim().optional(),
});

export const inviteSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

export const updateMemberSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER", "VIEWER", "OWNER"]),
});

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org"
  );
}

export async function requireMembership(
  ctx: AppContext,
  organizationId: string,
  userId: string,
  minRole: Role = "VIEWER",
): Promise<{ org: Organization; membership: Membership }> {
  const db = await ctx.store.read();
  const org = db.organizations.find((o) => o.id === organizationId);
  if (!org) throw new HttpError(404, "Organization not found");
  const membership = db.memberships.find((m) => m.organizationId === organizationId && m.userId === userId);
  if (!membership) throw new HttpError(403, "Not a member of this organization");
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new HttpError(403, `Requires ${minRole} role or higher`);
  }
  return { org, membership };
}

export async function createOrganization(ctx: AppContext, userId: string, name: string, ip: string | null) {
  const org: Organization = {
    id: randomUUID(),
    name,
    slug: `${slugify(name)}-${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await ctx.store.update((db) => {
    db.organizations.push(org);
    db.memberships.push({
      id: randomUUID(),
      organizationId: org.id,
      userId,
      role: "OWNER",
      createdAt: new Date().toISOString(),
    });
    db.audit.push({
      id: randomUUID(),
      organizationId: org.id,
      actorUserId: userId,
      action: "organization.created",
      resourceType: "organization",
      resourceId: org.id,
      metadata: { name },
      ip,
      createdAt: new Date().toISOString(),
    });
  });
  return org;
}

export async function listOrganizations(ctx: AppContext, userId: string) {
  const db = await ctx.store.read();
  const mine = db.memberships.filter((m) => m.userId === userId);
  return mine.map((m) => {
    const org = db.organizations.find((o) => o.id === m.organizationId)!;
    return { ...org, role: m.role };
  });
}

export async function getOrganization(ctx: AppContext, userId: string, orgId: string) {
  const { org, membership } = await requireMembership(ctx, orgId, userId);
  return { ...org, role: membership.role };
}

export async function updateOrganization(ctx: AppContext, userId: string, orgId: string, name: string, ip: string | null) {
  await requireMembership(ctx, orgId, userId, "ADMIN");
  let updated: Organization | undefined;
  await ctx.store.update((db) => {
    const org = db.organizations.find((o) => o.id === orgId);
    if (!org) throw new HttpError(404, "Organization not found");
    org.name = name;
    updated = org;
    db.audit.push({
      id: randomUUID(),
      organizationId: orgId,
      actorUserId: userId,
      action: "organization.updated",
      resourceType: "organization",
      resourceId: orgId,
      metadata: { name },
      ip,
      createdAt: new Date().toISOString(),
    });
  });
  return updated!;
}

export async function deleteOrganization(ctx: AppContext, userId: string, orgId: string, ip: string | null) {
  await requireMembership(ctx, orgId, userId, "OWNER");
  await ctx.store.update((db) => {
    db.organizations = db.organizations.filter((o) => o.id !== orgId);
    db.memberships = db.memberships.filter((m) => m.organizationId !== orgId);
    db.projects = db.projects.filter((p) => p.organizationId !== orgId);
    db.audit.push({
      id: randomUUID(),
      organizationId: orgId,
      actorUserId: userId,
      action: "organization.deleted",
      resourceType: "organization",
      resourceId: orgId,
      metadata: {},
      ip,
      createdAt: new Date().toISOString(),
    });
  });
}

export async function listMembers(ctx: AppContext, userId: string, orgId: string) {
  await requireMembership(ctx, orgId, userId);
  const db = await ctx.store.read();
  return db.memberships
    .filter((m) => m.organizationId === orgId)
    .map((m) => {
      const user = db.users.find((u) => u.id === m.userId);
      return {
        userId: m.userId,
        email: user?.email ?? null,
        firstName: user?.firstName ?? null,
        lastName: user?.lastName ?? null,
        role: m.role,
        joinedAt: m.createdAt,
      };
    });
}

export async function inviteMember(
  ctx: AppContext,
  actorId: string,
  orgId: string,
  email: string,
  role: Exclude<Role, "OWNER">,
  ip: string | null,
) {
  await requireMembership(ctx, orgId, actorId, "ADMIN");
  const db = await ctx.store.read();
  const invitee = db.users.find((u) => u.email === email);
  if (!invitee) throw new HttpError(404, "No user with that email");
  if (db.memberships.some((m) => m.organizationId === orgId && m.userId === invitee.id)) {
    throw new HttpError(409, "User is already a member");
  }
  await ctx.store.update((data) => {
    data.memberships.push({
      id: randomUUID(),
      organizationId: orgId,
      userId: invitee.id,
      role,
      createdAt: new Date().toISOString(),
    });
    data.audit.push({
      id: randomUUID(),
      organizationId: orgId,
      actorUserId: actorId,
      action: "member.invited",
      resourceType: "membership",
      resourceId: invitee.id,
      metadata: { email, role },
      ip,
      createdAt: new Date().toISOString(),
    });
  });
  return { userId: invitee.id, email, role };
}

export async function updateMemberRole(
  ctx: AppContext,
  actorId: string,
  orgId: string,
  targetUserId: string,
  role: Role,
  ip: string | null,
) {
  const { membership: actor } = await requireMembership(ctx, orgId, actorId, "ADMIN");
  if (role === "OWNER" && actor.role !== "OWNER") {
    throw new HttpError(403, "Only an OWNER can transfer ownership");
  }
  await ctx.store.update((db) => {
    const target = db.memberships.find((m) => m.organizationId === orgId && m.userId === targetUserId);
    if (!target) throw new HttpError(404, "Member not found");
    if (target.role === "OWNER" && role !== "OWNER") {
      const owners = db.memberships.filter((m) => m.organizationId === orgId && m.role === "OWNER");
      if (owners.length <= 1) throw new HttpError(400, "Cannot demote the last owner");
    }
    target.role = role;
    db.audit.push({
      id: randomUUID(),
      organizationId: orgId,
      actorUserId: actorId,
      action: "member.role_updated",
      resourceType: "membership",
      resourceId: targetUserId,
      metadata: { role },
      ip,
      createdAt: new Date().toISOString(),
    });
  });
}

export async function removeMember(ctx: AppContext, actorId: string, orgId: string, targetUserId: string, ip: string | null) {
  const { membership: actor } = await requireMembership(ctx, orgId, actorId, "ADMIN");
  await ctx.store.update((db) => {
    const target = db.memberships.find((m) => m.organizationId === orgId && m.userId === targetUserId);
    if (!target) throw new HttpError(404, "Member not found");
    if (target.role === "OWNER" && actor.role !== "OWNER") {
      throw new HttpError(403, "Only an OWNER can remove an OWNER");
    }
    if (target.role === "OWNER") {
      const owners = db.memberships.filter((m) => m.organizationId === orgId && m.role === "OWNER");
      if (owners.length <= 1) throw new HttpError(400, "Cannot remove the last owner");
    }
    db.memberships = db.memberships.filter((m) => m.id !== target.id);
    db.audit.push({
      id: randomUUID(),
      organizationId: orgId,
      actorUserId: actorId,
      action: "member.removed",
      resourceType: "membership",
      resourceId: targetUserId,
      metadata: {},
      ip,
      createdAt: new Date().toISOString(),
    });
  });
}

export async function listAudit(ctx: AppContext, userId: string, orgId: string) {
  await requireMembership(ctx, orgId, userId);
  const db = await ctx.store.read();
  return db.audit
    .filter((a) => a.organizationId === orgId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
