import { ZodTypeAny, ZodError } from "zod";
import { Request, Response, NextFunction } from "express";

/** Validate req.body with Zod without mutating req.body (Express v5 safe). */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Do not assign back to req.body; store on a side channel instead.
      const parsed = schema.parse(req.body);
      (req as any).validatedBody = parsed; // safe attachment
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ error: "Invalid body", details: e.issues });
      }
      next(e);
    }
  };
}

/** Validate req.query with Zod without mutating req.query (Express v5 safe). */
export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Do not assign or Object.assign into req.query; it has a getter only in Express v5.
      const parsed = schema.parse(req.query);
      (req as any).validatedQuery = parsed; // safe attachment
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ error: "Invalid query", details: e.issues });
      }
      next(e);
    }
  };
}