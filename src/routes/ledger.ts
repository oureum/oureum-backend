import express from "express";
import { adminGuard } from "../middlewares/authMiddleware";
import { createGoldIntake, getGoldIntake } from "../controllers/ledgerController";

const router = express.Router();

router.use(adminGuard); // Admin-only for now

router.post("/gold-intake", createGoldIntake);
router.get("/gold-intake", getGoldIntake);

export default router;