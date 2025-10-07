import { Request, Response } from "express";
import { getAdminByWallet } from "../models/adminModel";

export async function adminLogin(req: Request, res: Response) {
  const { wallet } = req.body;
  if (!wallet) {
    return res.status(400).json({ error: "wallet is required" });
  }
  const admin = await getAdminByWallet(wallet);
  if (!admin) {
    return res.status(403).json({ error: "Not admin" });
  }
  // 生成 session token（简单方案，用 JWT 或自定义）
  // 这里暂时直接回一个标记
  return res.json({ success: true });
}