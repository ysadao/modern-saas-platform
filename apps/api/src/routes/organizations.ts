import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { HttpError } from "../types.js";
import {
  createOrganization,
  createOrgSchema,
  deleteOrganization,
  getOrganization,
  inviteMember,
  inviteSchema,
  listAudit,
  listMembers,
  listOrganizations,
  removeMember,
  updateMemberRole,
  updateMemberSchema,
  updateOrganization,
  updateOrgSchema,
} from "../services/organizations.js";
import {
  createProject,
  createProjectSchema,
  listProjects,
} from "../services/projects.js";

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, "Validation failed", result.error.flatten());
  return result.data;
}

export function organizationRouter(ctx: AppContext) {
  const router = Router();
  router.use(authMiddleware(ctx));

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const orgs = await listOrganizations(ctx, (req as AuthedRequest).user.id);
      res.json({ organizations: orgs });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = parse(createOrgSchema, req.body);
      const org = await createOrganization(ctx, (req as AuthedRequest).user.id, body.name, req.ip ?? null);
      res.status(201).json(org);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const org = await getOrganization(ctx, (req as AuthedRequest).user.id, req.params.id);
      res.json(org);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const body = parse(updateOrgSchema, req.body);
      if (!body.name) throw new HttpError(400, "name is required");
      const org = await updateOrganization(ctx, (req as AuthedRequest).user.id, req.params.id, body.name, req.ip ?? null);
      res.json(org);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      await deleteOrganization(ctx, (req as AuthedRequest).user.id, req.params.id, req.ip ?? null);
      res.status(204).end();
    }),
  );

  router.get(
    "/:id/members",
    asyncHandler(async (req, res) => {
      const members = await listMembers(ctx, (req as AuthedRequest).user.id, req.params.id);
      res.json({ members });
    }),
  );

  router.post(
    "/:id/members",
    asyncHandler(async (req, res) => {
      const body = parse(inviteSchema, req.body);
      const member = await inviteMember(
        ctx,
        (req as AuthedRequest).user.id,
        req.params.id,
        body.email,
        body.role,
        req.ip ?? null,
      );
      res.status(201).json(member);
    }),
  );

  router.patch(
    "/:id/members/:userId",
    asyncHandler(async (req, res) => {
      const body = parse(updateMemberSchema, req.body);
      await updateMemberRole(ctx, (req as AuthedRequest).user.id, req.params.id, req.params.userId, body.role, req.ip ?? null);
      res.json({ ok: true });
    }),
  );

  router.delete(
    "/:id/members/:userId",
    asyncHandler(async (req, res) => {
      await removeMember(ctx, (req as AuthedRequest).user.id, req.params.id, req.params.userId, req.ip ?? null);
      res.status(204).end();
    }),
  );

  router.get(
    "/:id/audit",
    asyncHandler(async (req, res) => {
      const audit = await listAudit(ctx, (req as AuthedRequest).user.id, req.params.id);
      res.json({ audit });
    }),
  );

  router.get(
    "/:id/projects",
    asyncHandler(async (req, res) => {
      const projects = await listProjects(ctx, (req as AuthedRequest).user.id, req.params.id);
      res.json({ projects });
    }),
  );

  router.post(
    "/:id/projects",
    asyncHandler(async (req, res) => {
      const body = parse(createProjectSchema, req.body);
      const project = await createProject(ctx, (req as AuthedRequest).user.id, req.params.id, body, req.ip ?? null);
      res.status(201).json(project);
    }),
  );

  return router;
}
