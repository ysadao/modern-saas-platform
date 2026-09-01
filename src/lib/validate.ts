import { z } from "zod";
import { HttpError } from "../errors.js";

export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, "Validation failed", result.error.flatten());
  }
  return result.data;
}
