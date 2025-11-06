import express from "express";
import { adminGuard } from "../middlewares/authMiddleware";
import {
  fundPreset,
  getUserBalances,
  listUsers as listUsers_old, // keep old if other parts rely on it
} from "../controllers/adminController";
import { listAudits } from "../controllers/auditController";
import { validateBody, validateQuery } from "../middlewares/validate";
import {
  fundPresetSchema,
  getBalancesQuerySchema,
  listUsersQuerySchema,
} from "../schemas";
import { authRequired } from "../middlewares/authMiddleware";
import { rateLimit } from "../middlewares/rateLimit";
import { faucetRm } from "../controllers/faucetController";
import { mintOnchainController } from "../controllers/mintOnchainController";


import {
  getAdminUsers,
  postCreateUser,
  postCreditUser,
  postRecordPurchase,
} from "../controllers/adminUsersController";

const router = express.Router();

// Admin auth wall
router.use(adminGuard);

// ---- Existing admin endpoints ----
router.post("/fund-preset", validateBody(fundPresetSchema), fundPreset);
router.get("/balances", validateQuery(getBalancesQuerySchema), getUserBalances);
router.get("/users-legacy", validateQuery(listUsersQuerySchema), listUsers_old); // keep legacy if needed
router.get("/audits", listAudits);

// Admin RM faucet (rate limited)
router.post("/faucet-rm", authRequired, rateLimit(10, 60), faucetRm);

// !!! Remove duplicate route: the second "/fund-preset" was redundant
// router.post("/fund-preset", fundPreset); // <-- deleted

// ---- New: Admin Users management ----
// List users with balances (supports q/limit/offset)
router.get("/users", getAdminUsers);

// Create a user by wallet (idempotent)
router.post("/users", postCreateUser);

// Credit RM to a user
router.post("/users/:wallet/credit", postCreditUser);

// Record a purchase (deduct RM, increase grams)
router.post("/users/:wallet/purchase", postRecordPurchase);

// ---- New: On-chain mint (admin) ----
router.post("/mint-onchain", (req, res) => {
  const adminWallet = (req as any)?.admin?.wallet || null;
  return mintOnchainController(req, res, {
    role: "admin",
    adminWallet,
  });
});
export default router;