import { Request, Response } from "express";
import { OumgService } from "../services/chain/oumgService";

export const getMeta = async (_req: Request, res: Response) => {
  const [token, info] = await Promise.all([
    OumgService.getTokenMeta(),
    OumgService.getInfo(),
  ]);
  return res.json({ token, info });
};