import { Router } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { parse } from "../lib/validate.js";
import { deleteProject, getProject, updateProject, updateProjectSchema } from "../services/projects.js";

export function projectRouter() {
  const router = Router();
  router.use(authMiddleware());

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const project = await getProject((req as AuthedRequest).user.id, req.params.id);
      res.json(project);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const body = parse(updateProjectSchema, req.body);
      const project = await updateProject((req as AuthedRequest).user.id, req.params.id, body, req.ip ?? null);
      res.json(project);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      await deleteProject((req as AuthedRequest).user.id, req.params.id, req.ip ?? null);
      res.status(204).end();
    }),
  );

  return router;
}
