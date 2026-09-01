import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../errors.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.details !== undefined) body.details = err.details;
    if (err.code) body.code = err.code;
    res.status(err.status).json(body);
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
