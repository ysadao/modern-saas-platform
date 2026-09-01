import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env"), override: true });

export const DEMO_EMAIL = "demo@harbor.app";

export const config = {
  get port() {
    return Number(process.env.PORT ?? 3101);
  },
  get nodeEnv() {
    return process.env.NODE_ENV ?? "development";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "postgresql://app:app@127.0.0.1:55431/saas";
  },
  get jwtAccessSecret() {
    return process.env.JWT_ACCESS_SECRET ?? "saas-demo-access-secret-change-me";
  },
  get jwtRefreshSecret() {
    return process.env.JWT_REFRESH_SECRET ?? "saas-demo-refresh-secret-change-me";
  },
  get jwtAccessTtl() {
    return process.env.JWT_ACCESS_TTL ?? "15m";
  },
  get jwtRefreshTtl() {
    return process.env.JWT_REFRESH_TTL ?? "7d";
  },
  get bcryptRounds() {
    return Number(process.env.BCRYPT_ROUNDS ?? 10);
  },
  get demoExposeTokens() {
    return process.env.DEMO_EXPOSE_TOKENS === "true";
  },
  get webDist() {
    return path.resolve(here, "../web/dist");
  },
};

export function parseTtlMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 7 * 24 * 3600 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  const map: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * map[unit];
}
