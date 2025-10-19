import express from "express";
import { adminGuard } from "../middlewares/authMiddleware";
import { fundPreset, getUserBalances, listUsers } from "../controllers/adminController";
import { listAudits } from "../controllers/auditController";
import { validateBody, validateQuery } from "../middlewares/validate";
import { fundPresetSchema, getBalancesQuerySchema, listUsersQuerySchema } from "../schemas";
import { authRequired } from "../middlewares/authMiddleware";
import { rateLimit } from "../middlewares/rateLimit";
import { faucetRm } from "../controllers/faucetController";


const router = express.Router();

router.use(adminGuard);

router.post("/fund-preset", validateBody(fundPresetSchema), fundPreset);
router.get("/balances", validateQuery(getBalancesQuerySchema), getUserBalances);
router.get("/users", validateQuery(listUsersQuerySchema), listUsers);
router.get("/audits", listAudits);


// Admin RM faucet (rate limited)
router.post("/faucet-rm", authRequired, rateLimit(10, 60), faucetRm);

// POST /api/admin/fund-preset
router.post("/fund-preset", fundPreset);

export default router;