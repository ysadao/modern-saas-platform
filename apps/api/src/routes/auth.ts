import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { asyncHandler } from "../middleware/error.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { HttpError } from "../types.js";
import { login, loginSchema, refresh, refreshSchema, register, registerSchema } from "../services/auth.js";

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, "Validation failed", result.error.flatten());
  }
  return result.data;
}

export function authRouter(ctx: AppContext) {
  const router = Router();

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const body = parse(registerSchema, req.body);
      const result = await register(ctx, body, req.ip ?? null);
      res.status(201).json(result);
    }),
  );

  router.post(
    "/login",
    rateLimit({ windowMs: 60_000, max: 10 }),
    asyncHandler(async (req, res) => {
      const body = parse(loginSchema, req.body);
      const result = await login(ctx, body, req.ip ?? null);
      res.json(result);
    }),
  );

  router.post(
    "/refresh",
    asyncHandler(async (req, res) => {
      const body = parse(refreshSchema, req.body);
      const result = await refresh(ctx, body.refreshToken);
      res.json(result);
    }),
  );

  return router;
}
