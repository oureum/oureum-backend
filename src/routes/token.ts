import express from "express";
import { adminGuard } from "../middlewares/authMiddleware";
import { buyMintHandler, sellBurnHandler } from "../controllers/tokenController";
import { validateBody } from "../middlewares/validate";
import { buyMintSchema, sellBurnSchema } from "../schemas";
import { rateLimit } from "../middlewares/rateLimit";

const router = express.Router();
router.use(adminGuard);

// add lightweight rate limit to sensitive endpoints
router.post("/buy-mint", rateLimit(), validateBody(buyMintSchema), buyMintHandler);
router.post("/sell-burn", rateLimit(), validateBody(sellBurnSchema), sellBurnHandler);

export default router;