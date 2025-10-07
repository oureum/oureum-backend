import express from "express";
import { adminGuard } from "../middlewares/authMiddleware";
import { getCurrentPrice, setManualPrice, listSnapshots } from "../controllers/priceController";
import { validateBody, validateQuery } from "../middlewares/validate";
import { priceManualUpdateSchema, paginationQuerySchema } from "../schemas";

const router = express.Router();

router.get("/current", getCurrentPrice);

router.use(adminGuard);
router.post("/manual-update", validateBody(priceManualUpdateSchema), setManualPrice);
router.get("/snapshots", validateQuery(paginationQuerySchema), listSnapshots);

export default router;