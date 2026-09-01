import { Router } from "express";
import { asyncHandler } from "../middleware/error.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import { parse } from "../lib/validate.js";
import {
  forgotPassword,
  forgotSchema,
  login,
  loginSchema,
  logout,
  logoutAll,
  refresh,
  refreshSchema,
  register,
  registerSchema,
  resetPassword,
  resetSchema,
  tokenSchema,
  verifyEmail,
} from "../services/auth.js";

function meta(req: { ip?: string; headers: { "user-agent"?: string } }) {
  return { ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

export function authRouter() {
  const router = Router();

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const body = parse(registerSchema, req.body);
      const result = await register(body, req.ip ?? null);
      res.status(201).json(result);
    }),
  );

  router.post(
    "/login",
    rateLimit({ windowMs: 60_000, max: 10 }),
    asyncHandler(async (req, res) => {
      const body = parse(loginSchema, req.body);
      const result = await login(body, meta(req));
      res.json(result);
    }),
  );

  router.post(
    "/refresh",
    asyncHandler(async (req, res) => {
      const body = parse(refreshSchema, req.body);
      const result = await refresh(body.refreshToken, meta(req));
      res.json(result);
    }),
  );

  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      const body = parse(refreshSchema, req.body);
      await logout(body.refreshToken);
      res.json({ ok: true });
    }),
  );

  router.post(
    "/logout-all",
    authMiddleware(),
    asyncHandler(async (req, res) => {
      await logoutAll((req as AuthedRequest).user.id);
      res.json({ ok: true });
    }),
  );

  router.post(
    "/verify-email",
    asyncHandler(async (req, res) => {
      const body = parse(tokenSchema, req.body);
      await verifyEmail(body.token);
      res.json({ ok: true });
    }),
  );

  router.post(
    "/forgot-password",
    asyncHandler(async (req, res) => {
      const body = parse(forgotSchema, req.body);
      const result = await forgotPassword(body.email);
      res.json(result);
    }),
  );

  router.post(
    "/reset-password",
    asyncHandler(async (req, res) => {
      const body = parse(resetSchema, req.body);
      await resetPassword(body.token, body.password);
      res.json({ ok: true });
    }),
  );

  return router;
}
