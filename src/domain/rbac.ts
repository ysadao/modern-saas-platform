/**
 * Pure RBAC policy for Harbor tenancy.
 * Services load membership rows; this module decides what is allowed.
 */

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export type PolicyDeny =
  | { ok: false; status: 403 | 400; message: string }
  | { ok: true };

export function hasMinRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function assertMinRole(actual: Role, required: Role): PolicyDeny {
  if (!hasMinRole(actual, required)) {
    return { ok: false, status: 403, message: `Requires ${required} role or higher` };
  }
  return { ok: true };
}

/** Who may invite / change roles (ADMIN+). Ownership transfer is OWNER-only. */
export function canChangeMemberRole(actor: Role, target: Role, next: Role): PolicyDeny {
  const adminGate = assertMinRole(actor, "ADMIN");
  if (!adminGate.ok) return adminGate;

  if (next === "OWNER" && actor !== "OWNER") {
    return { ok: false, status: 403, message: "Only an OWNER can transfer ownership" };
  }
  if (target === "OWNER" && actor !== "OWNER" && next !== "OWNER") {
    return { ok: false, status: 403, message: "Only an OWNER can demote an OWNER" };
  }
  return { ok: true };
}

export function canRemoveMember(actor: Role, target: Role): PolicyDeny {
  const adminGate = assertMinRole(actor, "ADMIN");
  if (!adminGate.ok) return adminGate;
  if (target === "OWNER" && actor !== "OWNER") {
    return { ok: false, status: 403, message: "Only an OWNER can remove an OWNER" };
  }
  return { ok: true };
}

/** Protect the last OWNER so an org cannot become ownerless. */
export function canLeaveOwnerSeat(target: Role, ownerCount: number, demotingOrRemoving: boolean): PolicyDeny {
  if (!demotingOrRemoving || target !== "OWNER") return { ok: true };
  if (ownerCount <= 1) {
    return { ok: false, status: 400, message: "Cannot remove or demote the last owner" };
  }
  return { ok: true };
}

export function canManageProjects(actor: Role): PolicyDeny {
  return assertMinRole(actor, "ADMIN");
}

export function canDeleteOrganization(actor: Role): PolicyDeny {
  return assertMinRole(actor, "OWNER");
}
