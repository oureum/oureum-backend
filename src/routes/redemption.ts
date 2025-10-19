// src/routes/redemption.ts
import { Router } from "express";
import { adminGuard } from "../middlewares/authMiddleware";
import {
  createRedemption,
  listRedemption,
  updateRedemption,
} from "../controllers/redemptionController";

const router = Router();

/** Public: user creates a redemption request */
router.post("/", createRedemption);

/** Admin: list redemptions (optional ?status=&limit=&offset=) */
router.get("/", adminGuard, listRedemption);

/** Admin: update redemption status */
router.patch("/:id", adminGuard, updateRedemption);

export default router;