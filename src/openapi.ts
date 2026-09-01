export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Harbor Workspace OS",
    version: "2.1.0",
    description:
      "Multi-tenant SaaS control plane. JWT access tokens, hashed refresh rotation, organization RBAC, tenant isolation.",
  },
  servers: [{ url: "/", description: "Same origin" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  paths: {
    "/api/health": {
      get: { summary: "Liveness", responses: { "200": { description: "Process is up" } } },
    },
    "/api/ready": {
      get: {
        summary: "Readiness (Postgres ping)",
        responses: {
          "200": { description: "Database reachable" },
          "503": { description: "Database down" },
        },
      },
    },
    "/api/auth/login": {
      post: { summary: "Login", responses: { "200": { description: "Tokens issued" }, "401": { description: "Invalid credentials" }, "403": { description: "Email unverified" } } },
    },
    "/api/auth/refresh": {
      post: { summary: "Rotate refresh token", responses: { "200": { description: "New pair" }, "401": { description: "Rejected" } } },
    },
    "/api/organizations": {
      get: { summary: "List memberships", security: [{ bearerAuth: [] }], responses: { "200": { description: "OK" } } },
      post: { summary: "Create organization (caller is OWNER)", security: [{ bearerAuth: [] }], responses: { "201": { description: "Created" } } },
    },
    "/api/organizations/{id}/projects": {
      post: { summary: "Create project (OWNER/ADMIN)", security: [{ bearerAuth: [] }], responses: { "201": { description: "Created" }, "403": { description: "Forbidden" } } },
    },
  },
} as const;
