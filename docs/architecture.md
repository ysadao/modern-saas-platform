# Architecture

Portfolio/reference implementation demonstrating production patterns for a small multi-tenant SaaS.

## Runtime topology

```
┌─────────────┐  Vite proxy /api   ┌────────────────┐
│  Web :3101  │ ─────────────────► │  API :4101     │
│  React SPA  │                    │  Express + Zod │
└─────────────┘                    └───────┬────────┘
                                           │
                                           ▼
                                   ┌───────────────┐
                                   │  Store (JSON) │
                                   │  data/*.json  │
                                   └───────────────┘
```

Postgres and Redis appear in Compose as optional infrastructure. The running demo does not connect to them.

## Layers

1. **HTTP** — Express routers, CORS, JSON body parsing, request IDs.
2. **Validation** — Zod schemas at the route boundary. Invalid input returns `400` with field issues.
3. **Auth** — Bearer access JWT; refresh tokens stored as SHA-256 hashes.
4. **Authorization** — Organization membership + role. OWNER and ADMIN mutate; MEMBER and VIEWER read.
5. **Domain services** — Users, organizations, projects, audit.
6. **Persistence** — `Store<T>` serializes mutations through a promise queue so concurrent requests cannot corrupt the JSON file.

## Tenant isolation

Every project row carries `organizationId`. Lookups always join through the caller's membership. A valid JWT for tenant A cannot read tenant B's projects even if the UUID is known.

## RBAC

| Action | OWNER | ADMIN | MEMBER | VIEWER |
| --- | --- | --- | --- | --- |
| Read org / projects / audit | yes | yes | yes | yes |
| Create / update project | yes | yes | no | no |
| Invite / change members | yes | yes* | no | no |
| Delete org | yes | no | no | no |

\* ADMIN cannot promote to OWNER or remove the last OWNER.

## Rate limiting

Login uses a sliding window in process memory: 10 attempts per IP per 60 seconds. Suitable for a single-node demo; a production deployment would share counters in Redis.

## Audit

Mutations and logins append immutable records. Organization owners and admins can list their tenant's log via `GET /api/organizations/:id/audit`.
