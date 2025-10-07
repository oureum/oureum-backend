import express from "express";
import { adminGuard } from "../middlewares/authMiddleware";
import { createRedemptionHandler, updateStatusHandler, listByUserHandler, listAllHandler } from "../controllers/redemptionController";
import { validateBody, validateQuery } from "../middlewares/validate";
import { redemptionCreateSchema, redemptionUpdateSchema, getBalancesQuerySchema, paginationQuerySchema } from "../schemas";

const router = express.Router();

// user endpoints (public)
router.post("/create", validateBody(redemptionCreateSchema), createRedemptionHandler);
router.get("/user", validateQuery(getBalancesQuerySchema), listByUserHandler);

// admin endpoints
router.use(adminGuard);
router.post("/update-status", validateBody(redemptionUpdateSchema), updateStatusHandler);
router.get("/all", validateQuery(paginationQuerySchema), listAllHandler);

export default router;