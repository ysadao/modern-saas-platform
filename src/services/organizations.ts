import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Organization, OrganizationMember, Role } from "@prisma/client";
import {
  assertMinRole,
  canChangeMemberRole,
  canDeleteOrganization,
  canLeaveOwnerSeat,
  canRemoveMember,
} from "../domain/rbac.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
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

function deny(decision: { ok: false; status: 403 | 400; message: string }): never {
  throw new HttpError(decision.status, decision.message);
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
  const gate = assertMinRole(membership.role, minRole);
  if (!gate.ok) deny(gate);
  return { org, membership };
}

export async function createOrganization(userId: string, name: string, ip: string | null) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name,
        slug: `${slugify(name)}-${randomUUID().slice(0, 8)}`,
        members: {
          create: { userId, role: "OWNER" },
        },
      },
    });
    await writeAudit(
      {
        userId,
        organizationId: org.id,
        action: "organization.created",
        resource: "organization",
        resourceId: org.id,
        metadata: { name },
        ip,
      },
      tx,
    );
    return org;
  });
}

export async function listOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      organization: {
        include: {
          _count: { select: { members: true, projects: true, auditLogs: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return memberships.map((m) => {
    const { _count, ...organization } = m.organization;
    return {
      ...organization,
      role: m.role,
      memberCount: _count.members,
      projectCount: _count.projects,
      auditCount: _count.auditLogs,
    };
  });
}

export async function getOrganization(userId: string, orgId: string) {
  const { org, membership } = await requireMembership(orgId, userId);
  return { ...org, role: membership.role };
}

export async function updateOrganization(userId: string, orgId: string, name: string, ip: string | null) {
  await requireMembership(orgId, userId, "ADMIN");
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id: orgId },
      data: { name },
    });
    await writeAudit(
      {
        userId,
        organizationId: orgId,
        action: "organization.updated",
        resource: "organization",
        resourceId: orgId,
        metadata: { name },
        ip,
      },
      tx,
    );
    return org;
  });
}

export async function deleteOrganization(userId: string, orgId: string, ip: string | null) {
  const { membership } = await requireMembership(orgId, userId, "OWNER");
  const gate = canDeleteOrganization(membership.role);
  if (!gate.ok) deny(gate);
  // Audit before delete so the row survives org FK SetNull with a recorded action.
  await prisma.$transaction(async (tx) => {
    await writeAudit(
      {
        userId,
        organizationId: orgId,
        action: "organization.deleted",
        resource: "organization",
        resourceId: orgId,
        metadata: {},
        ip,
      },
      tx,
    );
    await tx.organization.delete({ where: { id: orgId } });
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
  return prisma.$transaction(async (tx) => {
    const existing = await tx.organizationMember.findUnique({
      where: { userId_organizationId: { userId: invitee.id, organizationId: orgId } },
    });
    if (existing) throw new HttpError(409, "User is already a member");
    await tx.organizationMember.create({
      data: { organizationId: orgId, userId: invitee.id, role },
    });
    await writeAudit(
      {
        userId: actorId,
        organizationId: orgId,
        action: "member.invited",
        resource: "membership",
        resourceId: invitee.id,
        metadata: { email, role },
        ip,
      },
      tx,
    );
    return { userId: invitee.id, email, role };
  });
}

export async function updateMemberRole(
  actorId: string,
  orgId: string,
  targetUserId: string,
  role: Role,
  ip: string | null,
) {
  const { membership: actor } = await requireMembership(orgId, actorId, "ADMIN");
  const target = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
  });
  if (!target) throw new HttpError(404, "Member not found");

  const roleGate = canChangeMemberRole(actor.role, target.role, role);
  if (!roleGate.ok) deny(roleGate);

  const owners = await prisma.organizationMember.count({
    where: { organizationId: orgId, role: "OWNER" },
  });
  const seatGate = canLeaveOwnerSeat(target.role, owners, role !== "OWNER");
  if (!seatGate.ok) deny(seatGate);

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.update({
      where: { id: target.id },
      data: { role },
    });
    await writeAudit(
      {
        userId: actorId,
        organizationId: orgId,
        action: "member.role_updated",
        resource: "membership",
        resourceId: targetUserId,
        metadata: { role },
        ip,
      },
      tx,
    );
  });
}

export async function removeMember(actorId: string, orgId: string, targetUserId: string, ip: string | null) {
  const { membership: actor } = await requireMembership(orgId, actorId, "ADMIN");
  const target = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
  });
  if (!target) throw new HttpError(404, "Member not found");

  const removeGate = canRemoveMember(actor.role, target.role);
  if (!removeGate.ok) deny(removeGate);

  const owners = await prisma.organizationMember.count({
    where: { organizationId: orgId, role: "OWNER" },
  });
  const seatGate = canLeaveOwnerSeat(target.role, owners, true);
  if (!seatGate.ok) deny(seatGate);

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.delete({ where: { id: target.id } });
    await writeAudit(
      {
        userId: actorId,
        organizationId: orgId,
        action: "member.removed",
        resource: "membership",
        resourceId: targetUserId,
        metadata: {},
        ip,
      },
      tx,
    );
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
