import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError, type User } from "../types.js";
import type { AppContext } from "../context.js";

export interface AuthedRequest extends Request {
  user: User;
}

export function authMiddleware(ctx: AppContext) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization ?? "";
      const [scheme, token] = header.split(" ");
      if (scheme !== "Bearer" || !token) {
        throw new HttpError(401, "Missing bearer token");
      }
      let payload: jwt.JwtPayload;
      try {
        payload = jwt.verify(token, config.jwtAccessSecret) as jwt.JwtPayload;
      } catch {
        throw new HttpError(401, "Invalid or expired access token");
      }
      if (payload.type !== "access" || typeof payload.sub !== "string") {
        throw new HttpError(401, "Invalid access token");
      }
      const db = await ctx.store.read();
      const user = db.users.find((u) => u.id === payload.sub);
      if (!user) throw new HttpError(401, "User not found");
      (req as AuthedRequest).user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}
