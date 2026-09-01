import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });
dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4101),
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "saas-demo-access-secret-change-me",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "saas-demo-refresh-secret-change-me",
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? "7d",
  get bcryptRounds() {
    return Number(process.env.BCRYPT_ROUNDS ?? 10);
  },
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(here, "../../../data")),
};
