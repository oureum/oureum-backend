import { Router } from "express";
import { getUserBalances } from "../controllers/userController";
import { getUserTokenHistory } from "../controllers/userController";

const router = Router();

// Public, read-only
router.get("/balances", getUserBalances);
router.get("/token-history", getUserTokenHistory);

export default router;