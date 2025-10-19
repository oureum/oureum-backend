import { Request, Response } from "express";
import { ChainService } from "../services/chainService";

/** POST /api/chain/pause  (admin) */
export async function pauseContract(req: Request, res: Response) {
  try {
    const r = await ChainService.pause();
    return res.json({ success: true, txHash: r.txHash });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "pause failed" });
  }
}

/** POST /api/chain/unpause  (admin) */
export async function unpauseContract(req: Request, res: Response) {
  try {
    const r = await ChainService.unpause();
    return res.json({ success: true, txHash: r.txHash });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "unpause failed" });
  }
}

/** GET /api/chain/paused */
export async function pausedStatus(_req: Request, res: Response) {
  try {
    const paused = await ChainService.isPaused();
    return res.json({ paused });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "pausedStatus failed" });
  }
}