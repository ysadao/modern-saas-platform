import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Organization, OrganizationMember, Role } from "@prisma/client";
import { prisma } from "../db.js";
import { HttpError, ROLE_RANK } from "../errors.js";
import { writeAudit } from "../lib/audit.js";

export const createOrgSchema = z.object({
  name: z.string().min(2).max(80).trim(),
});

export const updateOrgSchema = z.object({
  name: z.string().min(2).max(80).trim().optional(),
});

export const inviteSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
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
  organizationId: string,
  userId: string,
  minRole: Role = "VIEWER",
): Promise<{ org: Organization; membership: OrganizationMember }> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new HttpError(404, "Organization not found");
  const membership = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership) throw new HttpError(403, "Not a member of this organization");
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new HttpError(403, `Requires ${minRole} role or higher`);
  }
  return { org, membership };
}

export async function createOrganization(userId: string, name: string, ip: string | null) {
  const org = await prisma.organization.create({
    data: {
      name,
      slug: `${slugify(name)}-${randomUUID().slice(0, 8)}`,
      members: {
        create: { userId, role: "OWNER" },
      },
    },
  });
  await writeAudit({
    userId,
    organizationId: org.id,
    action: "organization.created",
    resource: "organization",
    resourceId: org.id,
    metadata: { name },
    ip,
  });
  return org;
}

export async function listOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "desc" },
  });
  return memberships.map((m) => ({
    ...m.organization,
    role: m.role,
  }));
}

export async function getOrganization(userId: string, orgId: string) {
  const { org, membership } = await requireMembership(orgId, userId);
  return { ...org, role: membership.role };
}

export async function updateOrganization(userId: string, orgId: string, name: string, ip: string | null) {
  await requireMembership(orgId, userId, "ADMIN");
  const org = await prisma.organization.update({
    where: { id: orgId },
    data: { name },
  });
  await writeAudit({
    userId,
    organizationId: orgId,
    action: "organization.updated",
    resource: "organization",
    resourceId: orgId,
    metadata: { name },
    ip,
  });
  return org;
}

export async function deleteOrganization(userId: string, orgId: string, ip: string | null) {
  await requireMembership(orgId, userId, "OWNER");
  await prisma.organization.delete({ where: { id: orgId } });
  await writeAudit({
    userId,
    organizationId: orgId,
    action: "organization.deleted",
    resource: "organization",
    resourceId: orgId,
    metadata: {},
    ip,
  });
}

export async function listMembers(userId: string, orgId: string) {
  await requireMembership(orgId, userId);
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: orgId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({
    userId: m.userId,
    email: m.user.email,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
  }));
}

export async function inviteMember(
  actorId: string,
  orgId: string,
  email: string,
  role: Exclude<Role, "OWNER">,
  ip: string | null,
) {
  await requireMembership(orgId, actorId, "ADMIN");
  const invitee = await prisma.user.findUnique({ where: { email } });
  if (!invitee) throw new HttpError(404, "No user with that email");
  const existing = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId: invitee.id, organizationId: orgId } },
  });
  if (existing) throw new HttpError(409, "User is already a member");
  await prisma.organizationMember.create({
    data: { organizationId: orgId, userId: invitee.id, role },
  });
  await writeAudit({
    userId: actorId,
    organizationId: orgId,
    action: "member.invited",
    resource: "membership",
    resourceId: invitee.id,
    metadata: { email, role },
    ip,
  });
  return { userId: invitee.id, email, role };
}

export async function updateMemberRole(
  actorId: string,
  orgId: string,
  targetUserId: string,
  role: Role,
  ip: string | null,
) {
  const { membership: actor } = await requireMembership(orgId, actorId, "ADMIN");
  if (role === "OWNER" && actor.role !== "OWNER") {
    throw new HttpError(403, "Only an OWNER can transfer ownership");
  }
  const target = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
  });
  if (!target) throw new HttpError(404, "Member not found");
  if (target.role === "OWNER" && role !== "OWNER") {
    const owners = await prisma.organizationMember.count({
      where: { organizationId: orgId, role: "OWNER" },
    });
    if (owners <= 1) throw new HttpError(400, "Cannot demote the last owner");
  }
  await prisma.organizationMember.update({
    where: { id: target.id },
    data: { role },
  });
  await writeAudit({
    userId: actorId,
    organizationId: orgId,
    action: "member.role_updated",
    resource: "membership",
    resourceId: targetUserId,
    metadata: { role },
    ip,
  });
}

export async function removeMember(actorId: string, orgId: string, targetUserId: string, ip: string | null) {
  const { membership: actor } = await requireMembership(orgId, actorId, "ADMIN");
  const target = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
  });
  if (!target) throw new HttpError(404, "Member not found");
  if (target.role === "OWNER" && actor.role !== "OWNER") {
    throw new HttpError(403, "Only an OWNER can remove an OWNER");
  }
  if (target.role === "OWNER") {
    const owners = await prisma.organizationMember.count({
      where: { organizationId: orgId, role: "OWNER" },
    });
    if (owners <= 1) throw new HttpError(400, "Cannot remove the last owner");
  }
  await prisma.organizationMember.delete({ where: { id: target.id } });
  await writeAudit({
    userId: actorId,
    organizationId: orgId,
    action: "member.removed",
    resource: "membership",
    resourceId: targetUserId,
    metadata: {},
    ip,
  });
}

export async function listAudit(userId: string, orgId: string) {
  await requireMembership(orgId, userId);
  const audit = await prisma.auditLog.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return audit.map((a) => ({
    id: a.id,
    userId: a.userId,
    organizationId: a.organizationId,
    action: a.action,
    resource: a.resource,
    resourceId: a.resourceId,
    metadata: a.metadata,
    ip: a.ip,
    createdAt: a.createdAt.toISOString(),
  }));
}
