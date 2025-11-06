// src/routes/price.ts
import express from "express";
import { adminGuard } from "../middlewares/authMiddleware";
import { getCurrentPrice, postCurrentPrice, listSnapshots } from "../controllers/priceController";
import { validateBody, validateQuery } from "../middlewares/validate";
import { priceCurrentPostSchema, paginationQuerySchema } from "../schemas";

const router = express.Router();

// Public: read current price (never calls vendor when PRICE_MODE=manual)
router.get("/current", getCurrentPrice);

// Admin: create a new manual pricing sheet (overrides by latest record)
router.post("/current", adminGuard, validateBody(priceCurrentPostSchema), postCurrentPrice);

// Admin: list snapshots (history)
router.get("/snapshots", adminGuard, validateQuery(paginationQuerySchema), listSnapshots);

export default router;