import { Router } from "express";
import { getUserBalances } from "../controllers/userController";
import { getUserTokenHistory } from "../controllers/userController";
import { mintOnchainController } from "../controllers/mintOnchainController";

const router = Router();

// Public, read-only
router.get("/balances", getUserBalances);
router.get("/token-history", getUserTokenHistory);

// ---- New: On-chain mint (user) ----
router.post("/mint-onchain", (req, res) => {
  const authUserWallet = (req as any)?.user?.wallet || null;
  return mintOnchainController(req, res, {
    role: "user",
    authUserWallet,
  });
});

export default router;