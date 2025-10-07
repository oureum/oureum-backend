import { Request, Response } from "express";
import { addGoldIntake, listGoldIntake } from "../models/ledgerModel";

/** POST /api/ledger/gold-intake */
export async function createGoldIntake(req: Request, res: Response) {
  try {
    const { intakeDate, source, purity, grams } = req.body;
    if (!intakeDate || !source || !purity || typeof grams !== "number") {
      return res.status(400).json({ error: "intakeDate, source, purity, grams are required" });
    }
    const row = await addGoldIntake(intakeDate, source, purity, grams);
    return res.json({ success: true, data: row });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "createGoldIntake failed" });
  }
}

/** GET /api/ledger/gold-intake?limit=100&offset=0 */
export async function getGoldIntake(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);
    const data = await listGoldIntake(limit, offset);
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "getGoldIntake failed" });
  }
}