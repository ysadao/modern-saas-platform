# Harbor architecture

Layered reference SaaS control plane. Domain policy is pure and unit-tested; Express/Prisma stay in the application and infrastructure rings.

```
routes/  →  services/  →  domain/   (pure policy)
                 ↓
              prisma / audit
```

## Layers

| Layer | Responsibility |
| --- | --- |
| `routes/` | HTTP parsing, auth middleware, status codes |
| `services/` | Transactions, persistence, wiring |
| `domain/rbac.ts` | Role ranks, invite/promote/remove/last-owner rules |
| `domain/sessions.ts` | Refresh decisions: rotate vs reuse→revoke family |
| `lib/` | Tokens, audit helper (accepts a transaction client) |

## Tenancy

Every org and project mutation goes through `requireMembership` with a minimum role. Project reads by id return **404** for outsiders (no existence leak via 403).

Mutations that change membership or projects write the **audit row in the same Prisma transaction** as the state change. Organization delete audits first, then deletes (audit FK becomes `SetNull`).

## Session family

Opaque refresh tokens are stored hashed. `decideRefresh`:

1. unknown hash → 401
2. revoked hash presented again → revoke **all** active sessions for that user (theft signal)
3. expired → 401
4. otherwise rotate (revoke current, issue new)

## What this is not

Not a multi-region SaaS product. No outbound email provider; verification tokens are demo-gated. JWT secrets must be replaced before any shared deploy.
