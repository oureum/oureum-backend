import express from "express";
import { adminGuard } from "../middlewares/authMiddleware";
import { fundPreset, getUserBalances, listUsers } from "../controllers/adminController";
import { listAudits } from "../controllers/auditController";
import { validateBody, validateQuery } from "../middlewares/validate";
import { fundPresetSchema, getBalancesQuerySchema, listUsersQuerySchema } from "../schemas";

const router = express.Router();

router.use(adminGuard);

router.post("/fund-preset", validateBody(fundPresetSchema), fundPreset);
router.get("/balances", validateQuery(getBalancesQuerySchema), getUserBalances);
router.get("/users", validateQuery(listUsersQuerySchema), listUsers);
router.get("/audits", listAudits);

export default router;