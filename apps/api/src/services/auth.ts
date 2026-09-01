import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import type { AppContext } from "../context.js";
import { HttpError, publicUser, type User } from "../types.js";

export const registerSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(80).trim(),
  lastName: z.string().min(1).max(80).trim(),
});

export const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function signAccess(user: User) {
  return jwt.sign({ sub: user.id, email: user.email, type: "access" }, config.jwtAccessSecret, {
    expiresIn: config.jwtAccessTtl,
  } as jwt.SignOptions);
}

function parseTtlMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 7 * 24 * 3600 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  const map: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * map[unit];
}

export async function issueTokens(ctx: AppContext, user: User) {
  const refreshToken = randomBytes(48).toString("base64url");
  const sessionId = randomUUID();
  await ctx.store.update((db) => {
    db.refreshSessions.push({
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + parseTtlMs(config.jwtRefreshTtl)).toISOString(),
      createdAt: new Date().toISOString(),
    });
  });
  return {
    accessToken: signAccess(user),
    refreshToken,
    tokenType: "Bearer" as const,
    expiresIn: config.jwtAccessTtl,
  };
}

export async function register(ctx: AppContext, input: z.infer<typeof registerSchema>, ip: string | null) {
  const existing = (await ctx.store.read()).users.find((u) => u.email === input.email);
  if (existing) throw new HttpError(409, "Email already registered");
  const user: User = {
    id: randomUUID(),
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, config.bcryptRounds),
    firstName: input.firstName,
    lastName: input.lastName,
    createdAt: new Date().toISOString(),
  };
  await ctx.store.update((db) => {
    db.users.push(user);
    db.audit.push({
      id: randomUUID(),
      organizationId: null,
      actorUserId: user.id,
      action: "user.registered",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email },
      ip,
      createdAt: new Date().toISOString(),
    });
  });
  const tokens = await issueTokens(ctx, user);
  return { user: publicUser(user), ...tokens };
}

export async function login(ctx: AppContext, input: z.infer<typeof loginSchema>, ip: string | null) {
  const user = (await ctx.store.read()).users.find((u) => u.email === input.email);
  if (!user) throw new HttpError(401, "Invalid email or password");
  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid email or password");
  await ctx.store.update((db) => {
    db.audit.push({
      id: randomUUID(),
      organizationId: null,
      actorUserId: user.id,
      action: "user.login",
      resourceType: "user",
      resourceId: user.id,
      metadata: {},
      ip,
      createdAt: new Date().toISOString(),
    });
  });
  const tokens = await issueTokens(ctx, user);
  return { user: publicUser(user), ...tokens };
}

export async function refresh(ctx: AppContext, refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  const db = await ctx.store.read();
  const session = db.refreshSessions.find((s) => s.tokenHash === tokenHash);
  if (!session) throw new HttpError(401, "Invalid refresh token");
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw new HttpError(401, "Refresh token expired");
  }
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) throw new HttpError(401, "User not found");
  await ctx.store.update((data) => {
    data.refreshSessions = data.refreshSessions.filter((s) => s.id !== session.id);
  });
  const tokens = await issueTokens(ctx, user);
  return { user: publicUser(user), ...tokens };
}
