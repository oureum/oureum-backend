import { Router } from "express";
import { getCurrentPrice, setManualPrice, listSnapshots } from "../controllers/priceController";

const r = Router();

r.get("/price", getCurrentPrice);
r.post("/price", setManualPrice);
r.get("/price/snapshots", listSnapshots);

export default r;