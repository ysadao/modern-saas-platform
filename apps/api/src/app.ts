import express from "express";
import cors from "cors";
import type { AppContext } from "./context.js";
import { authMiddleware, type AuthedRequest } from "./middleware/auth.js";
import { asyncHandler, errorHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { organizationRouter } from "./routes/organizations.js";
import { projectRouter } from "./routes/projects.js";
import { publicUser } from "./types.js";

const ENDPOINTS = [
  { method: "GET", path: "/api/health", auth: false, description: "Liveness probe" },
  { method: "GET", path: "/api/docs", auth: false, description: "JSON catalog of endpoints" },
  { method: "POST", path: "/api/auth/register", auth: false, description: "Register with email and password" },
  { method: "POST", path: "/api/auth/login", auth: false, description: "Login; rate limited 10/min/IP" },
  { method: "POST", path: "/api/auth/refresh", auth: false, description: "Rotate refresh token" },
  { method: "GET", path: "/api/me", auth: true, description: "Current user" },
  { method: "GET", path: "/api/organizations", auth: true, description: "List memberships" },
  { method: "POST", path: "/api/organizations", auth: true, description: "Create organization (caller becomes OWNER)" },
  { method: "GET", path: "/api/organizations/:id", auth: true, description: "Get organization" },
  { method: "PATCH", path: "/api/organizations/:id", auth: true, description: "Rename organization" },
  { method: "DELETE", path: "/api/organizations/:id", auth: true, description: "Delete organization (OWNER)" },
  { method: "GET", path: "/api/organizations/:id/members", auth: true, description: "List members" },
  { method: "POST", path: "/api/organizations/:id/members", auth: true, description: "Invite member" },
  { method: "PATCH", path: "/api/organizations/:id/members/:userId", auth: true, description: "Change role" },
  { method: "DELETE", path: "/api/organizations/:id/members/:userId", auth: true, description: "Remove member" },
  { method: "GET", path: "/api/organizations/:id/audit", auth: true, description: "Organization audit log" },
  { method: "GET", path: "/api/organizations/:id/projects", auth: true, description: "List projects" },
  { method: "POST", path: "/api/organizations/:id/projects", auth: true, description: "Create project (OWNER/ADMIN)" },
  { method: "GET", path: "/api/projects/:id", auth: true, description: "Get project" },
  { method: "PATCH", path: "/api/projects/:id", auth: true, description: "Update project (OWNER/ADMIN)" },
  { method: "DELETE", path: "/api/projects/:id", auth: true, description: "Delete project (OWNER/ADMIN)" },
];

export function createApp(ctx: AppContext) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "modern-saas-platform", time: new Date().toISOString() });
  });

  app.get("/api/docs", (_req, res) => {
    res.json({
      title: "Modern SaaS Platform API",
      note: "Portfolio/reference implementation demonstrating production patterns.",
      endpoints: ENDPOINTS,
    });
  });

  app.use("/api/auth", authRouter(ctx));
  app.get(
    "/api/me",
    authMiddleware(ctx),
    asyncHandler(async (req, res) => {
      res.json({ user: publicUser((req as AuthedRequest).user) });
    }),
  );
  app.use("/api/organizations", organizationRouter(ctx));
  app.use("/api/projects", projectRouter(ctx));

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
