import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { createContext } from "../src/context.js";
import { resetRateLimits } from "../src/middleware/rateLimit.js";

process.env.BCRYPT_ROUNDS = "4";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const tmp = await mkdtemp(path.join(os.tmpdir(), "saas-"));
const ctx = createContext(tmp);
const app = createApp(ctx);
const server = createServer(app);

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const addr = server.address();
if (!addr || typeof addr === "string") throw new Error("no port");
const base = `http://127.0.0.1:${addr.port}`;

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await rm(tmp, { recursive: true, force: true });
});

before(() => resetRateLimits());

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

test("health and docs", async () => {
  const health = await json("GET", "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.status, "ok");
  const docs = await json("GET", "/api/docs");
  assert.equal(docs.status, 200);
  assert.ok(Array.isArray(docs.data.endpoints));
});

test("register validation and login flow", async () => {
  const bad = await json("POST", "/api/auth/register", { email: "nope", password: "short" });
  assert.equal(bad.status, 400);

  const alice = await json("POST", "/api/auth/register", {
    email: "alice@example.com",
    password: "password12",
    firstName: "Alice",
    lastName: "Chen",
  });
  assert.equal(alice.status, 201);
  assert.ok(alice.data.accessToken);
  assert.ok(alice.data.refreshToken);

  const dup = await json("POST", "/api/auth/register", {
    email: "alice@example.com",
    password: "password12",
    firstName: "Alice",
    lastName: "Chen",
  });
  assert.equal(dup.status, 409);

  const me = await json("GET", "/api/me", undefined, alice.data.accessToken);
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, "alice@example.com");

  const login = await json("POST", "/api/auth/login", {
    email: "alice@example.com",
    password: "password12",
  });
  assert.equal(login.status, 200);

  const wrong = await json("POST", "/api/auth/login", {
    email: "alice@example.com",
    password: "wrong-password",
  });
  assert.equal(wrong.status, 401);

  const rotated = await json("POST", "/api/auth/refresh", { refreshToken: alice.data.refreshToken });
  assert.equal(rotated.status, 200);
  const reused = await json("POST", "/api/auth/refresh", { refreshToken: alice.data.refreshToken });
  assert.equal(reused.status, 401);
});

test("org RBAC, projects, tenant isolation, audit", async () => {
  const owner = await json("POST", "/api/auth/register", {
    email: "owner@example.com",
    password: "password12",
    firstName: "Owen",
    lastName: "Owner",
  });
  const member = await json("POST", "/api/auth/register", {
    email: "member@example.com",
    password: "password12",
    firstName: "Mia",
    lastName: "Member",
  });
  const outsider = await json("POST", "/api/auth/register", {
    email: "out@example.com",
    password: "password12",
    firstName: "Omar",
    lastName: "Out",
  });

  const org = await json("POST", "/api/organizations", { name: "Northwind" }, owner.data.accessToken);
  assert.equal(org.status, 201);
  const orgId = org.data.id;

  const invited = await json(
    "POST",
    `/api/organizations/${orgId}/members`,
    { email: "member@example.com", role: "MEMBER" },
    owner.data.accessToken,
  );
  assert.equal(invited.status, 201);

  const memberCreate = await json(
    "POST",
    `/api/organizations/${orgId}/projects`,
    { name: "Should fail", description: "" },
    member.data.accessToken,
  );
  assert.equal(memberCreate.status, 403);

  const project = await json(
    "POST",
    `/api/organizations/${orgId}/projects`,
    { name: "Billing", description: "Invoices" },
    owner.data.accessToken,
  );
  assert.equal(project.status, 201);

  const listed = await json("GET", `/api/organizations/${orgId}/projects`, undefined, member.data.accessToken);
  assert.equal(listed.status, 200);
  assert.equal(listed.data.projects.length, 1);

  const forbidden = await json("GET", `/api/organizations/${orgId}/projects`, undefined, outsider.data.accessToken);
  assert.equal(forbidden.status, 403);

  const otherOrg = await json("POST", "/api/organizations", { name: "Other Co" }, outsider.data.accessToken);
  const steal = await json(
    "GET",
    `/api/organizations/${orgId}/projects`,
    undefined,
    outsider.data.accessToken,
  );
  assert.equal(steal.status, 403);

  const crossProject = await json("GET", `/api/projects/${project.data.id}`, undefined, outsider.data.accessToken);
  assert.equal(crossProject.status, 403);

  const otherList = await json(
    "GET",
    `/api/organizations/${otherOrg.data.id}/projects`,
    undefined,
    owner.data.accessToken,
  );
  assert.equal(otherList.status, 403);

  const audit = await json("GET", `/api/organizations/${orgId}/audit`, undefined, owner.data.accessToken);
  assert.equal(audit.status, 200);
  const actions = audit.data.audit.map((a: { action: string }) => a.action);
  assert.ok(actions.includes("organization.created"));
  assert.ok(actions.includes("project.created"));
  assert.ok(actions.includes("member.invited"));
});

test("login rate limit", async () => {
  resetRateLimits();
  await json("POST", "/api/auth/register", {
    email: "rate@example.com",
    password: "password12",
    firstName: "Ray",
    lastName: "Limit",
  });
  let lastStatus = 0;
  for (let i = 0; i < 11; i++) {
    const res = await json("POST", "/api/auth/login", {
      email: "rate@example.com",
      password: "wrong-password",
    });
    lastStatus = res.status;
  }
  assert.equal(lastStatus, 429);
});
