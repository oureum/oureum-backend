import { Router } from "express";
import { getWalletOverview } from "../controllers/walletController";
import { getWalletHistory } from "../controllers/historyController";

const router = Router();

router.get("/overview", getWalletOverview);
router.get("/history", getWalletHistory);

export default router;