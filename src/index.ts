import { config } from "./config.js";
import { createApp } from "./app.js";
import { prisma } from "./db.js";

const app = createApp();
const server = app.listen(config.port, () => {
  process.stdout.write(
    `${JSON.stringify({ level: "info", msg: "listen", service: "harbor", port: config.port })}\n`,
  );
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`${JSON.stringify({ level: "info", msg: "shutdown", signal })}\n`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
