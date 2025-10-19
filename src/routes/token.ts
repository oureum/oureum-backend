import { Router } from "express";
import { authRequired } from "../middlewares/authMiddleware";
import { rateLimit } from "../middlewares/rateLimit";
import { buyMintHandler, sellBurnHandler, listTokenOps } from "../controllers/tokenController";

const router = Router();

// Admin-only, rate-limited
router.post("/buy-mint", authRequired, rateLimit(30, 60), buyMintHandler);
router.post("/sell-burn", authRequired, rateLimit(30, 60), sellBurnHandler);

// Admin list all token ops (pagination)
router.get("/ops", authRequired, listTokenOps);

export default router;