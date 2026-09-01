import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { HttpError } from "../types.js";
import { deleteProject, getProject, updateProject, updateProjectSchema } from "../services/projects.js";

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, "Validation failed", result.error.flatten());
  return result.data;
}

export function projectRouter(ctx: AppContext) {
  const router = Router();
  router.use(authMiddleware(ctx));

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const project = await getProject(ctx, (req as AuthedRequest).user.id, req.params.id);
      res.json(project);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const body = parse(updateProjectSchema, req.body);
      const project = await updateProject(ctx, (req as AuthedRequest).user.id, req.params.id, body, req.ip ?? null);
      res.json(project);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      await deleteProject(ctx, (req as AuthedRequest).user.id, req.params.id, req.ip ?? null);
      res.status(204).end();
    }),
  );

  return router;
}
