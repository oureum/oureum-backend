// src/routes/tokenOps.ts
// Express route definitions for token operations

import express from "express";
import {
  pauseContract,
  resumeContract,
  getContractStatus,
  listTokenOpsLogs,
} from "../controllers/adminTokenOpsController";

const router = express.Router();

/** POST /api/token-ops/pause - Pause the token contract */
router.post("/pause", pauseContract);

/** POST /api/token-ops/resume - Resume the token contract */
router.post("/resume", resumeContract);

/** GET /api/token-ops/status - Get paused/active status */
router.get("/status", getContractStatus);

// Get: list logs
router.get("/logs", listTokenOpsLogs);

export default router;