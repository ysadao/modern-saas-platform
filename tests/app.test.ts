import "./env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetRateLimits } from "../src/middleware/rateLimit.js";
import { seed } from "../prisma/seed.js";

async function waitForPostgres(timeoutMs = 60_000) {
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Postgres not ready on DATABASE_URL: ${String(last)}`);
}

const app = createApp();
const server = createServer(app);

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const addr = server.address();
if (!addr || typeof addr === "string") throw new Error("no port");
const base = `http://127.0.0.1:${addr.port}`;

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await prisma.$disconnect();
});

before(async () => {
  resetRateLimits();
  await waitForPostgres();
  await seed();
});

async function json(method: string, url: string, body?: unknown, token?: string) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

function uniqueEmail(prefix: string) {
  return `${prefix}.${randomUUID().slice(0, 8)}@harbor.test`;
}

async function registerVerified(prefix: string, password = "password12") {
  const email = uniqueEmail(prefix);
  const registered = await json("POST", "/api/auth/register", {
    email,
    password,
    firstName: prefix,
    lastName: "Tester",
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  assert.ok(registered.data.verificationToken);
  const verified = await json("POST", "/api/auth/verify-email", {
    token: registered.data.verificationToken,
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  const login = await json("POST", "/api/auth/login", { email, password });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  return { email, password, ...login.data };
}

test("health", async () => {
  const health = await json("GET", "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.status, "ok");
});

test("register, verify, login", async () => {
  const email = uniqueEmail("alice");
  const registered = await json("POST", "/api/auth/register", {
    email,
    password: "password12",
    firstName: "Alice",
    lastName: "Chen",
  });
  assert.equal(registered.status, 201);
  assert.ok(registered.data.user.id);
  assert.equal(registered.data.user.email, email);
  assert.ok(registered.data.verificationToken);
  assert.equal(registered.data.accessToken, undefined);

  const dup = await json("POST", "/api/auth/register", {
    email,
    password: "password12",
    firstName: "Alice",
    lastName: "Chen",
  });
  assert.equal(dup.status, 409);

  const meBefore = await json("GET", "/api/me");
  assert.equal(meBefore.status, 401);

  const verified = await json("POST", "/api/auth/verify-email", {
    token: registered.data.verificationToken,
  });
  assert.equal(verified.status, 200);

  const login = await json("POST", "/api/auth/login", { email, password: "password12" });
  assert.equal(login.status, 200);
  assert.ok(login.data.accessToken);
  assert.ok(login.data.refreshToken);

  const me = await json("GET", "/api/me", undefined, login.data.accessToken);
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, email);
  assert.ok(me.data.user.emailVerifiedAt);
});

test("unverified login blocked", async () => {
  const email = uniqueEmail("unverified");
  const registered = await json("POST", "/api/auth/register", {
    email,
    password: "password12",
    firstName: "Una",
    lastName: "Verified",
  });
  assert.equal(registered.status, 201);
  const blocked = await json("POST", "/api/auth/login", { email, password: "password12" });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, "EMAIL_UNVERIFIED");
  assert.ok(blocked.data.error);
});

test("refresh rotation (old refresh fails)", async () => {
  const session = await registerVerified("rotate");
  const rotated = await json("POST", "/api/auth/refresh", { refreshToken: session.refreshToken });
  assert.equal(rotated.status, 200);
  assert.ok(rotated.data.accessToken);
  assert.ok(rotated.data.refreshToken);
  assert.notEqual(rotated.data.refreshToken, session.refreshToken);

  const reused = await json("POST", "/api/auth/refresh", { refreshToken: session.refreshToken });
  assert.equal(reused.status, 401);

  const second = await json("POST", "/api/auth/refresh", { refreshToken: rotated.data.refreshToken });
  assert.equal(second.status, 200);
});

test("password reset", async () => {
  const { email } = await registerVerified("reset");
  const forgot = await json("POST", "/api/auth/forgot-password", { email });
  assert.equal(forgot.status, 200);
  assert.ok(forgot.data.resetToken);

  const unknown = await json("POST", "/api/auth/forgot-password", { email: uniqueEmail("missing") });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.data.resetToken, undefined);

  const reset = await json("POST", "/api/auth/reset-password", {
    token: forgot.data.resetToken,
    password: "newpass123",
  });
  assert.equal(reset.status, 200);

  const oldLogin = await json("POST", "/api/auth/login", { email, password: "password12" });
  assert.equal(oldLogin.status, 401);

  const newLogin = await json("POST", "/api/auth/login", { email, password: "newpass123" });
  assert.equal(newLogin.status, 200);
});

test("seed demo user can login", async () => {
  const login = await json("POST", "/api/auth/login", {
    email: "demo@harbor.app",
    password: "HarborDemo123!",
  });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.user.email, "demo@harbor.app");
  const me = await json("GET", "/api/me", undefined, login.data.accessToken);
  assert.equal(me.status, 200);
  const sessions = await json("GET", "/api/me/sessions", undefined, login.data.accessToken);
  assert.equal(sessions.status, 200);
  assert.ok(Array.isArray(sessions.data.sessions));
});

test("login rate limit 10/min/IP", async () => {
  resetRateLimits();
  const email = uniqueEmail("rate");
  await json("POST", "/api/auth/register", {
    email,
    password: "password12",
    firstName: "Ray",
    lastName: "Limit",
  });
  let lastStatus = 0;
  for (let i = 0; i < 11; i++) {
    const res = await json("POST", "/api/auth/login", { email, password: "wrong-password" });
    lastStatus = res.status;
  }
  assert.equal(lastStatus, 429);
});

test("org isolation: user B cannot read user A's org", async () => {
  resetRateLimits();
  const a = await registerVerified("ownera");
  const b = await registerVerified("ownerb");
  const org = await json("POST", "/api/organizations", { name: "Alpha Tenant" }, a.accessToken);
  assert.equal(org.status, 201);
  const forbidden = await json("GET", `/api/organizations/${org.data.id}`, undefined, b.accessToken);
  assert.equal(forbidden.status, 403);
  const projects = await json("GET", `/api/organizations/${org.data.id}/projects`, undefined, b.accessToken);
  assert.equal(projects.status, 403);
});

test("RBAC: viewer cannot create project", async () => {
  resetRateLimits();
  const owner = await registerVerified("rbacowner");
  const viewer = await registerVerified("rbacviewer");
  const org = await json("POST", "/api/organizations", { name: "RBAC Co" }, owner.accessToken);
  assert.equal(org.status, 201);
  const invited = await json(
    "POST",
    `/api/organizations/${org.data.id}/members`,
    { email: viewer.email, role: "VIEWER" },
    owner.accessToken,
  );
  assert.equal(invited.status, 201);

  const denied = await json(
    "POST",
    `/api/organizations/${org.data.id}/projects`,
    { name: "Should fail", description: "" },
    viewer.accessToken,
  );
  assert.equal(denied.status, 403);

  const created = await json(
    "POST",
    `/api/organizations/${org.data.id}/projects`,
    { name: "Billing", description: "Invoices" },
    owner.accessToken,
  );
  assert.equal(created.status, 201);

  const listed = await json("GET", `/api/organizations/${org.data.id}/projects`, undefined, viewer.accessToken);
  assert.equal(listed.status, 200);
  assert.equal(listed.data.projects.length, 1);
});

test("readiness pings postgres and request ids are echoed", async () => {
  const ready = await fetch(`${base}/api/ready`);
  assert.equal(ready.status, 200);
  const body = await ready.json();
  assert.equal(body.status, "ready");
  assert.equal(body.db, "up");

  const spec = await fetch(`${base}/api/openapi.json`);
  assert.equal(spec.status, 200);
  const openapi = await spec.json();
  assert.equal(openapi.openapi, "3.0.3");

  const custom = await fetch(`${base}/api/health`, { headers: { "x-request-id": "harbor-review-1" } });
  assert.equal(custom.headers.get("x-request-id"), "harbor-review-1");
});
