import { ZodTypeAny, ZodError } from "zod";
import { Request, Response, NextFunction } from "express";

/** Validate req.body with a Zod schema */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({
          error: "Invalid body",
          details: e.issues,
        });
      }
      next(e);
    }
  };
}

/** Validate req.query with a Zod schema */
export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      (req.query as any) = schema.parse(req.query);
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({
          error: "Invalid query",
          details: e.issues,
        });
      }
      next(e);
    }
  };
}