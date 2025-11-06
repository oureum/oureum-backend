// src/routes/user.ts
import express from "express";
import { userGuard } from "../middlewares/userAuth";
import {
  registerUser,
  getMe,
  getBalances,
  getActivity,
  userMint,
  userBurn,
} from "../controllers/userController";

const router = express.Router();

// All user endpoints require X-User-Wallet
router.use(userGuard);

// Register (idempotent) – creates missing balance rows
router.post("/register", registerUser);

// Profile (user row only)
router.get("/me", getMe);

// Balances (RM + OUMG)
router.get("/balances", getBalances);

// Activity (token_ops history)
router.get("/activity", getActivity);

// Token operations (user-initiated)
router.post("/mint", userMint);
router.post("/burn", userBurn);

export default router;