import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canChangeMemberRole,
  canLeaveOwnerSeat,
  canManageProjects,
  canRemoveMember,
  hasMinRole,
} from "../src/domain/rbac.js";
import { decideRefresh } from "../src/domain/sessions.js";

test("rbac: role ranks", () => {
  assert.equal(hasMinRole("ADMIN", "MEMBER"), true);
  assert.equal(hasMinRole("VIEWER", "ADMIN"), false);
  assert.equal(canManageProjects("MEMBER").ok, false);
  assert.equal(canManageProjects("ADMIN").ok, true);
});

test("rbac: only OWNER transfers ownership", () => {
  const adminPromote = canChangeMemberRole("ADMIN", "MEMBER", "OWNER");
  assert.equal(adminPromote.ok, false);
  if (!adminPromote.ok) assert.equal(adminPromote.status, 403);

  const ownerPromote = canChangeMemberRole("OWNER", "ADMIN", "OWNER");
  assert.equal(ownerPromote.ok, true);
});

test("rbac: last owner seat is protected", () => {
  const last = canLeaveOwnerSeat("OWNER", 1, true);
  assert.equal(last.ok, false);
  if (!last.ok) assert.equal(last.status, 400);

  const ok = canLeaveOwnerSeat("OWNER", 2, true);
  assert.equal(ok.ok, true);

  const adminRemoveOwner = canRemoveMember("ADMIN", "OWNER");
  assert.equal(adminRemoveOwner.ok, false);
});

test("sessions: reuse of revoked refresh revokes family", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(decideRefresh(null, now).action, "reject_unknown");

  const active = decideRefresh(
    {
      id: "s1",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date("2026-01-08T00:00:00Z"),
    },
    now,
  );
  assert.equal(active.action, "rotate");

  const reused = decideRefresh(
    {
      id: "s1",
      userId: "u1",
      revokedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-01-08T00:00:00Z"),
    },
    now,
  );
  assert.deepEqual(reused, {
    action: "revoke_family",
    userId: "u1",
    sessionId: "s1",
    reason: "reuse",
  });

  const expired = decideRefresh(
    {
      id: "s2",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date("2025-12-01T00:00:00Z"),
    },
    now,
  );
  assert.equal(expired.action, "reject_expired");
});
