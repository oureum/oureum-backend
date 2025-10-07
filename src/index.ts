import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { logger } from "./logger";

const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, () => {
  logger.info({ port: PORT }, `🚀 Oureum backend running on http://localhost:${PORT}`);
});