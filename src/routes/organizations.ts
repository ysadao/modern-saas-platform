import { Router } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { parse } from "../lib/validate.js";
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
import { createProject, createProjectSchema, listProjects } from "../services/projects.js";
import { HttpError } from "../errors.js";

export function organizationRouter() {
  const router = Router();
  router.use(authMiddleware());

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const organizations = await listOrganizations((req as AuthedRequest).user.id);
      res.json({ organizations });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = parse(createOrgSchema, req.body);
      const org = await createOrganization((req as AuthedRequest).user.id, body.name, req.ip ?? null);
      res.status(201).json(org);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const org = await getOrganization((req as AuthedRequest).user.id, req.params.id);
      res.json(org);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const body = parse(updateOrgSchema, req.body);
      if (!body.name) throw new HttpError(400, "name is required");
      const org = await updateOrganization((req as AuthedRequest).user.id, req.params.id, body.name, req.ip ?? null);
      res.json(org);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      await deleteOrganization((req as AuthedRequest).user.id, req.params.id, req.ip ?? null);
      res.status(204).end();
    }),
  );

  router.get(
    "/:id/members",
    asyncHandler(async (req, res) => {
      const members = await listMembers((req as AuthedRequest).user.id, req.params.id);
      res.json({ members });
    }),
  );

  router.post(
    "/:id/members",
    asyncHandler(async (req, res) => {
      const body = parse(inviteSchema, req.body);
      const member = await inviteMember(
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
      await updateMemberRole(
        (req as AuthedRequest).user.id,
        req.params.id,
        req.params.userId,
        body.role,
        req.ip ?? null,
      );
      res.json({ ok: true });
    }),
  );

  router.delete(
    "/:id/members/:userId",
    asyncHandler(async (req, res) => {
      await removeMember((req as AuthedRequest).user.id, req.params.id, req.params.userId, req.ip ?? null);
      res.status(204).end();
    }),
  );

  router.get(
    "/:id/audit",
    asyncHandler(async (req, res) => {
      const audit = await listAudit((req as AuthedRequest).user.id, req.params.id);
      res.json({ audit });
    }),
  );

  router.get(
    "/:id/projects",
    asyncHandler(async (req, res) => {
      const projects = await listProjects((req as AuthedRequest).user.id, req.params.id);
      res.json({ projects });
    }),
  );

  router.post(
    "/:id/projects",
    asyncHandler(async (req, res) => {
      const body = parse(createProjectSchema, req.body);
      const project = await createProject((req as AuthedRequest).user.id, req.params.id, body, req.ip ?? null);
      res.status(201).json(project);
    }),
  );

  return router;
}
