import { Request, Response } from "express";
import { listAdminAudits } from "../models/auditModel";

/** GET /api/admin/audits?limit=100&offset=0 */
export async function listAudits(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);
    const data = await listAdminAudits(limit, offset);
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "listAudits failed" });
  }
}