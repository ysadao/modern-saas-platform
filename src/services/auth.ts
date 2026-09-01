import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Prisma, type User } from "@prisma/client";
import { config, DEMO_EMAIL, parseTtlMs } from "../config.js";
import { prisma } from "../db.js";
import { HttpError, publicUser } from "../errors.js";
import { writeAudit } from "../lib/audit.js";
import { hashToken, newOpaqueToken } from "../lib/tokens.js";

export const registerSchema = z.object({
  email: z
    .string()
    .email()
    .max(255)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(80).trim(),
  lastName: z.string().min(1).max(80).trim(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const tokenSchema = z.object({
  token: z.string().min(16),
});

export const forgotSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
});

export const resetSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(128),
});

function signAccess(user: User) {
  return jwt.sign({ sub: user.id, email: user.email, type: "access" }, config.jwtAccessSecret, {
    expiresIn: config.jwtAccessTtl,
  } as jwt.SignOptions);
}

export async function issueTokens(
  user: User,
  meta: { userAgent?: string | null; ip?: string | null } = {},
) {
  const refreshToken = newOpaqueToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt: new Date(Date.now() + parseTtlMs(config.jwtRefreshTtl)),
    },
  });
  return {
    accessToken: signAccess(user),
    refreshToken,
    tokenType: "Bearer" as const,
    expiresIn: config.jwtAccessTtl,
  };
}

export async function register(input: z.infer<typeof registerSchema>, ip: string | null) {
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  let user: User;
  try {
    user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "Email already registered");
    }
    throw err;
  }

  const verificationToken = newOpaqueToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(verificationToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await writeAudit({
    userId: user.id,
    action: "user.registered",
    resource: "user",
    resourceId: user.id,
    metadata: { email: user.email },
    ip,
  });

  return {
    user: publicUser(user),
    ...(config.demoExposeTokens ? { verificationToken } : {}),
  };
}

function isVerified(user: User) {
  return user.emailVerifiedAt != null || user.email === DEMO_EMAIL;
}

export async function login(
  input: z.infer<typeof loginSchema>,
  meta: { userAgent?: string | null; ip?: string | null },
) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new HttpError(401, "Invalid email or password");
  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid email or password");
  if (!isVerified(user)) {
    throw new HttpError(403, "Email is not verified", undefined, "EMAIL_UNVERIFIED");
  }
  await writeAudit({
    userId: user.id,
    action: "user.login",
    resource: "user",
    resourceId: user.id,
    metadata: {},
    ip: meta.ip ?? null,
  });
  const tokens = await issueTokens(user, meta);
  return { user: publicUser(user), ...tokens };
}

export async function refresh(
  refreshToken: string,
  meta: { userAgent?: string | null; ip?: string | null },
) {
  const tokenHash = hashToken(refreshToken);
  const session = await prisma.session.findFirst({
    where: { refreshTokenHash: tokenHash },
  });
  if (!session || session.revokedAt) {
    throw new HttpError(401, "Invalid refresh token");
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw new HttpError(401, "Refresh token expired");
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new HttpError(401, "User not found");

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueTokens(user, {
    userAgent: meta.userAgent ?? session.userAgent,
    ip: meta.ip ?? session.ip,
  });
  return { user: publicUser(user), ...tokens };
}

export async function logout(refreshToken: string) {
  const session = await prisma.session.findFirst({
    where: { refreshTokenHash: hashToken(refreshToken) },
  });
  if (session && !session.revokedAt) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }
}

export async function logoutAll(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function verifyEmail(token: string) {
  const record = await prisma.emailVerificationToken.findFirst({
    where: { tokenHash: hashToken(token) },
  });
  if (!record) throw new HttpError(400, "Invalid verification token");
  if (record.usedAt) throw new HttpError(400, "Verification token already used");
  if (record.expiresAt.getTime() < Date.now()) throw new HttpError(400, "Verification token expired");

  await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: true as const };
  }
  const resetToken = newOpaqueToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(resetToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return {
    ok: true as const,
    ...(config.demoExposeTokens ? { resetToken } : {}),
  };
}

export async function resetPassword(token: string, password: string) {
  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: hashToken(token) },
  });
  if (!record) throw new HttpError(400, "Invalid reset token");
  if (record.usedAt) throw new HttpError(400, "Reset token already used");
  if (record.expiresAt.getTime() < Date.now()) throw new HttpError(400, "Reset token expired");

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function listSessions(userId: string) {
  const sessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ip: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return sessions.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    ip: s.ip,
    expiresAt: s.expiresAt.toISOString(),
    revokedAt: s.revokedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  }));
}

export async function revokeSession(userId: string, sessionId: string) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) throw new HttpError(404, "Session not found");
  if (!session.revokedAt) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }
}
