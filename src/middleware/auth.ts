import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export interface AuthedRequest extends Request {
  user: User;
}

export function authMiddleware() {
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
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new HttpError(401, "User not found");
      (req as AuthedRequest).user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}
