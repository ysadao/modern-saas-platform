import { config } from "./config.js";
import { createApp } from "./app.js";
import { prisma } from "./db.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`Harbor listening on http://127.0.0.1:${config.port}`);
});

async function shutdown() {
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
