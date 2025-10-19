import { Request, Response } from "express";
import { insertGoldLedger, listGoldLedger } from "../models/goldLedgerModel";

/** POST /api/ledger/gold (admin) */
export async function createGoldEntry(req: Request, res: Response) {
  try {
    const { entry_date, intake_g, source, purity_bp, serial, batch, storage, custody, insurance, audit_ref, note } = req.body;
    if (!entry_date || !intake_g || Number(intake_g) <= 0) {
      return res.status(400).json({ error: "entry_date and positive intake_g are required" });
    }
    const row = await insertGoldLedger({
      entry_date, intake_g: Number(intake_g),
      source, purity_bp: purity_bp ? Number(purity_bp) : null,
      serial, batch, storage, custody, insurance, audit_ref, note
    });
    return res.json({ success: true, row });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "createGoldEntry failed" });
  }
}

/** GET /api/ledger/gold?from=&to=&source=&limit=&offset= */
export async function listGoldEntries(req: Request, res: Response) {
  try {
    const data = await listGoldLedger({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      source: req.query.source as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    return res.json({ data });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "listGoldEntries failed" });
  }
}