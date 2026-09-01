import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { authMiddleware, type AuthedRequest } from "./middleware/auth.js";
import { asyncHandler, errorHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { organizationRouter } from "./routes/organizations.js";
import { projectRouter } from "./routes/projects.js";
import { publicUser } from "./errors.js";
import { listSessions, revokeSession } from "./services/auth.js";

const ENDPOINTS = [
  { method: "GET", path: "/api/health", auth: false, description: "Liveness probe" },
  { method: "GET", path: "/api/docs", auth: false, description: "JSON catalog of endpoints" },
  { method: "POST", path: "/api/auth/register", auth: false, description: "Register; issues email verification token" },
  { method: "POST", path: "/api/auth/login", auth: false, description: "Login; rate limited 10/min/IP; unverified emails 403" },
  { method: "POST", path: "/api/auth/refresh", auth: false, description: "Rotate refresh token (old token is revoked)" },
  { method: "POST", path: "/api/auth/logout", auth: false, description: "Revoke a refresh session" },
  { method: "POST", path: "/api/auth/logout-all", auth: true, description: "Revoke every session for the caller" },
  { method: "POST", path: "/api/auth/verify-email", auth: false, description: "Consume email verification token" },
  { method: "POST", path: "/api/auth/forgot-password", auth: false, description: "Always 200; may return resetToken in demo mode" },
  { method: "POST", path: "/api/auth/reset-password", auth: false, description: "Set a new password from a reset token" },
  { method: "GET", path: "/api/me", auth: true, description: "Current user" },
  { method: "GET", path: "/api/me/sessions", auth: true, description: "List sessions" },
  { method: "DELETE", path: "/api/me/sessions/:id", auth: true, description: "Revoke a session" },
  { method: "GET", path: "/api/organizations", auth: true, description: "List memberships" },
  { method: "POST", path: "/api/organizations", auth: true, description: "Create organization (caller becomes OWNER)" },
  { method: "GET", path: "/api/organizations/:id", auth: true, description: "Get organization" },
  { method: "PATCH", path: "/api/organizations/:id", auth: true, description: "Rename organization" },
  { method: "DELETE", path: "/api/organizations/:id", auth: true, description: "Delete organization (OWNER)" },
  { method: "GET", path: "/api/organizations/:id/members", auth: true, description: "List members" },
  { method: "POST", path: "/api/organizations/:id/members", auth: true, description: "Invite member (OWNER/ADMIN)" },
  { method: "PATCH", path: "/api/organizations/:id/members/:userId", auth: true, description: "Change role" },
  { method: "DELETE", path: "/api/organizations/:id/members/:userId", auth: true, description: "Remove member" },
  { method: "GET", path: "/api/organizations/:id/audit", auth: true, description: "Organization audit log" },
  { method: "GET", path: "/api/organizations/:id/projects", auth: true, description: "List projects" },
  { method: "POST", path: "/api/organizations/:id/projects", auth: true, description: "Create project (OWNER/ADMIN)" },
  { method: "GET", path: "/api/projects/:id", auth: true, description: "Get project" },
  { method: "PATCH", path: "/api/projects/:id", auth: true, description: "Update project (OWNER/ADMIN)" },
  { method: "DELETE", path: "/api/projects/:id", auth: true, description: "Delete project (OWNER/ADMIN)" },
];

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "harbor", time: new Date().toISOString() });
  });

  app.get("/api/docs", (_req, res) => {
    res.json({
      title: "Harbor Workspace OS API",
      note: "Multi-tenant SaaS control plane with PostgreSQL, JWT access tokens, opaque refresh rotation, and RBAC.",
      endpoints: ENDPOINTS,
    });
  });

  app.use("/api/auth", authRouter());
  app.get(
    "/api/me",
    authMiddleware(),
    asyncHandler(async (req, res) => {
      res.json({ user: publicUser((req as AuthedRequest).user) });
    }),
  );
  app.get(
    "/api/me/sessions",
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const sessions = await listSessions((req as AuthedRequest).user.id);
      res.json({ sessions });
    }),
  );
  app.delete(
    "/api/me/sessions/:id",
    authMiddleware(),
    asyncHandler(async (req, res) => {
      await revokeSession((req as AuthedRequest).user.id, req.params.id);
      res.status(204).end();
    }),
  );
  app.use("/api/organizations", organizationRouter());
  app.use("/api/projects", projectRouter());

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  const webDist = config.webDist;
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
