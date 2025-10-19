import express from "express";
import { adminGuard } from "../middlewares/authMiddleware";
import {
  createGoldIntake,
  getGoldIntake,
} from "../controllers/ledgerController";
import {
  createGoldEntry,
  listGoldEntries,
} from "../controllers/goldLedgerController";

const router = express.Router();

// all ledger endpoints require admin access
router.use(adminGuard);

/**
 * Legacy endpoints (if still used by earlier version)
 * Example: /api/ledger/gold-intake
 */
router.post("/gold-intake", createGoldIntake);
router.get("/gold-intake", getGoldIntake);

/**
 * New gold ledger endpoints
 * Example: /api/ledger/gold
 */
router.post("/gold", createGoldEntry);
router.get("/gold", listGoldEntries);

export default router;