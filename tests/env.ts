process.env.DATABASE_URL ??= "postgresql://app:app@127.0.0.1:55431/saas";
process.env.BCRYPT_ROUNDS = "4";
process.env.DEMO_EXPOSE_TOKENS = "true";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";
