import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../errors.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as Request & { requestId?: string }).requestId;
  if (err instanceof HttpError) {
    const body: Record<string, unknown> = { error: err.message, requestId };
    if (err.details !== undefined) body.details = err.details;
    if (err.code) body.code = err.code;
    res.status(err.status).json(body);
    return;
  }
  process.stderr.write(
    `${JSON.stringify({
      level: "error",
      msg: "unhandled_error",
      requestId,
      error: err instanceof Error ? err.message : String(err),
    })}\n`,
  );
  res.status(500).json({ error: "Internal server error", requestId });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
