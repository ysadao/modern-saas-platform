import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../types.js";

interface Bucket {
  timestamps: number[];
}

const windows = new Map<string, Bucket>();

export function rateLimit(options: { windowMs: number; max: number; key?: (req: Request) => string }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = options.key ? options.key(req) : req.ip ?? "unknown";
    const now = Date.now();
    const bucket = windows.get(key) ?? { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < options.windowMs);
    if (bucket.timestamps.length >= options.max) {
      next(new HttpError(429, "Too many requests. Try again later."));
      return;
    }
    bucket.timestamps.push(now);
    windows.set(key, bucket);
    next();
  };
}

export function resetRateLimits() {
  windows.clear();
}
