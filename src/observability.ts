import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./db.js";

export type RequestWithId = Request & { requestId: string };

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  (req as RequestWithId).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  const started = Date.now();
  res.on("finish", () => {
    process.stdout.write(
      `${JSON.stringify({
        level: "info",
        msg: "http_request",
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - started,
      })}\n`,
    );
  });
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-dns-prefetch-control", "off");
  next();
}

export async function readiness(_req: Request, res: Response) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", db: "up", service: "harbor" });
  } catch {
    res.status(503).json({ status: "not_ready", db: "down", service: "harbor" });
  }
}
