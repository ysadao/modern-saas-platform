# Harbor — Workspace OS

Multi-tenant SaaS control plane: PostgreSQL (Prisma), complete email/password auth with verification and refresh rotation, organization RBAC, tenant-isolated projects, and an audit log. The Express API serves the React SPA in production so **one process** is the live demo.

## Demo login

| Field | Value |
| --- | --- |
| Email | `demo@harbor.app` |
| Password | `HarborDemo123!` |
| Organization | Northwind Labs (OWNER) |

Seeded alongside the demo user: two projects, extra members (ADMIN + VIEWER), and audit rows.

```bash
npm run db:seed
```

## Stack

- **API:** TypeScript ESM, Express, Zod, bcrypt, JWT access tokens (15m), opaque refresh tokens hashed in `Session`
- **Domain:** pure RBAC + session-family policy under `src/domain/` (see [docs/architecture.md](./docs/architecture.md))
- **DB:** PostgreSQL 16 via Prisma
- **Web:** Vite + React (IBM Plex, slate/teal Harbor identity)
- **Tests:** `node:test` + `tsx` — domain unit tests + HTTP against a **real** Postgres instance

## Setup

Postgres must be reachable at `postgresql://app:app@127.0.0.1:55431/saas` (container name `saas-pg`).

```bash
copy .env.example .env          # Windows
docker compose up -d postgres   # if saas-pg is not already running
npm install
npx prisma migrate deploy       # or: npx prisma db push
npm run db:seed
npm test
npm run build
npm start                       # http://127.0.0.1:3101  (API + SPA)
```

Development (API on 3101, Vite on 5173 with `/api` proxy):

```bash
npm run dev
```

## Auth matrix

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/register` | Creates user + verification token. With `DEMO_EXPOSE_TOKENS=true`, response includes `verificationToken`. |
| POST | `/api/auth/login` | Access JWT + opaque refresh. Unverified emails return **403** `{ error, code: "EMAIL_UNVERIFIED" }` except the pre-verified demo user. Rate limit: **10 / min / IP**. |
| POST | `/api/auth/refresh` | Rotates refresh: old session is revoked; **reuse of a revoked token revokes all sessions** for that user. |
| POST | `/api/auth/logout` | Revoke one session by refresh token. |
| POST | `/api/auth/logout-all` | Bearer. Revoke every session. |
| POST | `/api/auth/verify-email` | `{ token }` |
| POST | `/api/auth/forgot-password` | Always **200**. Demo mode may include `resetToken`. |
| POST | `/api/auth/reset-password` | `{ token, password }` — revokes all sessions. |
| GET | `/api/me` | Bearer. Current user. |
| GET | `/api/me/sessions` | Bearer. Session list. |
| DELETE | `/api/me/sessions/:id` | Bearer. Revoke one session. |

Passwords are bcrypt (cost 10; tests set `BCRYPT_ROUNDS=4`).

## RBAC

Creating an organization makes the caller **OWNER**. Tenant isolation is enforced on every org and project lookup.

| Action | OWNER | ADMIN | MEMBER | VIEWER |
| --- | --- | --- | --- | --- |
| Read org / projects / members / audit | yes | yes | yes | yes |
| Create / update / delete project | yes | yes | no | no |
| Invite / change members | yes | yes* | no | no |
| Delete organization | yes | no | no | no |

\* ADMIN cannot promote to OWNER or remove the last OWNER.

## API (tenancy)

| Method | Path | Auth |
| --- | --- | --- |
| GET/POST | `/api/organizations` | JWT |
| GET/PATCH/DELETE | `/api/organizations/:id` | JWT |
| GET/POST | `/api/organizations/:id/members` | JWT |
| PATCH/DELETE | `/api/organizations/:id/members/:userId` | JWT |
| GET | `/api/organizations/:id/audit` | JWT |
| GET/POST | `/api/organizations/:id/projects` | JWT |
| GET/PATCH/DELETE | `/api/projects/:id` | JWT |
| GET | `/api/health` `/api/ready` `/api/docs` `/api/openapi.json` | public |

Default listen port: **3101**. Machine-readable catalog: `GET /api/docs`.

## Web UI

`/login` `/register` `/forgot` `/reset?token=` `/verify?token=` `/` (orgs) `/orgs/:id` (projects, members, invite, audit) `/settings` (sessions + revoke). The client stores the Bearer token in `localStorage` and retries once via `/api/auth/refresh` on 401.

## Environment

See `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://app:app@127.0.0.1:55431/saas` | Prisma connection |
| `PORT` | `3101` | Listen port (API + SPA) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | demo secrets | HMAC keys — change before any shared deploy |
| `JWT_ACCESS_TTL` | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | `7d` | Refresh session lifetime |
| `DEMO_EXPOSE_TOKENS` | `false` | When `true`, return verification/reset tokens in JSON (tests/CI only) |
| `BCRYPT_ROUNDS` | `10` | Use `4` in tests |

## Docker

```bash
docker compose up --build
```

Maps **3101** for the app and **55431** for Postgres 16 (`saas-pg`). The image builds the web client, compiles the API, runs `prisma migrate deploy`, then starts Node.

## Tests

```bash
npm test
```

Hits real Postgres (`DATABASE_URL` above). Coverage includes register → verify → login, refresh rotation with reuse → full session revoke, unverified login blocked, password reset, org isolation, RBAC (viewer/member denies, admin cannot promote to OWNER), cross-tenant project IDOR, the seeded demo user, readiness, and request IDs.

`GET /api/ready` pings Postgres. `GET /api/openapi.json` is the OpenAPI 3 spec. Every response includes `x-request-id`. Logs are JSON lines (`http_request`). SIGINT/SIGTERM close the HTTP server then disconnect Prisma.

## What this is

A **reference implementation** of senior SaaS patterns (tenancy, RBAC, session rotation, operational probes). It is not evidence of ten years running production Harbor at scale.

## For reviewers

If you are reading this as a code sample, start here:

1. [`docs/architecture.md`](./docs/architecture.md) — layering and tenancy model  
2. [`src/domain/`](./src/domain/) — pure RBAC + refresh-session policy (no Express/Prisma)  
3. [`src/services/`](./src/services/) — transactions, audit, HTTP wiring  
4. [`tests/domain.test.ts`](./tests/domain.test.ts) then [`tests/app.test.ts`](./tests/app.test.ts)

Decisions worth noticing: refresh-token reuse revokes the whole session family; cross-tenant project access returns **404** (not 403); membership/project writes audit in the same transaction as the state change.

## License

Original reference code for portfolio use. Not affiliated with any commercial SaaS product.
