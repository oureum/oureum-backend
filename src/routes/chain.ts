import { Router } from "express";
import { getCurrentPrice, setManualPrice, listSnapshots } from "../controllers/priceController";
import { adminGuard } from "../middlewares/authMiddleware"; // ✅ use consistent guard
import { pausedStatus, pauseContract, unpauseContract } from "../controllers/chainController";

const router = Router();

/** 
 * Price endpoints
 * ---------------------------------------------------
 * GET /api/chain/price             -> public read
 * POST /api/chain/price            -> admin set manual price
 * GET /api/chain/price/snapshots   -> list price history
 */
router.get("/price", getCurrentPrice);
router.post("/price", adminGuard, setManualPrice);
router.get("/price/snapshots", listSnapshots);

/** 
 * Contract pausability endpoints
 * ---------------------------------------------------
 * GET  /api/chain/paused           -> public check paused()
 * POST /api/chain/pause            -> admin pause contract
 * POST /api/chain/unpause          -> admin unpause contract
 */
router.get("/paused", pausedStatus);
router.post("/pause", adminGuard, pauseContract);
router.post("/unpause", adminGuard, unpauseContract);

export default router;