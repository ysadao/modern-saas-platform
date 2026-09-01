# Modern SaaS Platform

Portfolio/reference implementation demonstrating production patterns.

A full-stack multi-tenant SaaS dashboard with JWT authentication, organization RBAC, tenant-isolated projects, and audit logging. Persistence uses a typed JSON file store so the project runs on Windows without native SQLite bindings.

## Features

- Email/password registration and login with bcrypt hashing
- Access + refresh JWT rotation
- Organizations with OWNER / ADMIN / MEMBER / VIEWER roles
- Projects scoped to an organization with tenant isolation
- Audit trail for auth and resource mutations
- In-memory login rate limiting (10 requests / minute / IP)
- React dashboard (Vite) with a slate/teal dark UI
- Health and machine-readable API docs endpoints

## Stack

- TypeScript, Express, Zod, jsonwebtoken, bcryptjs
- Vite + React for the web client
- JSON file store (`data/`) instead of SQLite
- Optional Postgres/Redis via Docker Compose (infra only; the app does not require them)

## Architecture

The API is a layered Express service: routes validate with Zod, services enforce RBAC and tenant isolation, and a mutex-backed `Store` serializes reads/writes to disk. The web app talks to `/api` through a Vite proxy. See [docs/architecture.md](docs/architecture.md).

## API

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | no | Liveness |
| GET | `/api/docs` | no | Endpoint catalog |
| POST | `/api/auth/register` | no | Create account |
| POST | `/api/auth/login` | no | Issue tokens (rate limited) |
| POST | `/api/auth/refresh` | no | Rotate refresh token |
| GET | `/api/me` | JWT | Current user |
| GET/POST | `/api/organizations` | JWT | List / create orgs |
| GET/PATCH/DELETE | `/api/organizations/:id` | JWT | Org CRUD |
| GET/POST | `/api/organizations/:id/members` | JWT | Membership |
| PATCH/DELETE | `/api/organizations/:id/members/:userId` | JWT | Update / remove member |
| GET | `/api/organizations/:id/audit` | JWT | Audit log |
| GET/POST | `/api/organizations/:id/projects` | JWT | List / create projects |
| GET/PATCH/DELETE | `/api/projects/:id` | JWT | Project CRUD |

Default API port: **4101**. Default web port: **3101**.

## Setup

```bash
npm install
copy .env.example .env   # Windows
npm run dev              # API + web via concurrently
npm test
npm run build
```

Web UI: http://127.0.0.1:3101  
API: http://127.0.0.1:4101/api/health

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4101` | API listen port |
| `JWT_ACCESS_SECRET` | demo secret | Access token HMAC key |
| `JWT_REFRESH_SECRET` | demo secret | Refresh token HMAC key |
| `JWT_ACCESS_TTL` | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | `7d` | Refresh token lifetime |
| `BCRYPT_ROUNDS` | `10` | Password hash cost (use `4` in tests) |
| `DATA_DIR` | `./data` | JSON store directory |

JWT secrets have safe local-demo defaults. Change them before any shared deployment.

## Docker

`docker-compose.yml` starts the API plus optional Postgres 16 and Redis 7. The application still persists to JSON files; the databases are included so operators can swap in a real backend later.

## License

Original reference code for portfolio use. Not affiliated with any commercial SaaS product.
