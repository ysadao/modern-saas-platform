/**
 * Refresh-token session family policy.
 * Persistence stays in the auth service; decisions live here.
 */

export type SessionRow = {
  id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
};

export type RefreshDecision =
  | { action: "reject_unknown" }
  | { action: "revoke_family"; userId: string; sessionId: string; reason: "reuse" }
  | { action: "reject_expired"; sessionId: string }
  | { action: "rotate"; sessionId: string; userId: string };

export function decideRefresh(session: SessionRow | null, now = new Date()): RefreshDecision {
  if (!session) return { action: "reject_unknown" };
  if (session.revokedAt) {
    return { action: "revoke_family", userId: session.userId, sessionId: session.id, reason: "reuse" };
  }
  if (session.expiresAt.getTime() < now.getTime()) {
    return { action: "reject_expired", sessionId: session.id };
  }
  return { action: "rotate", sessionId: session.id, userId: session.userId };
}
