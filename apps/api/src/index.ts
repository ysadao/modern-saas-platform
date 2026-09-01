import { config } from "./config.js";
import { createContext } from "./context.js";
import { createApp } from "./app.js";

const ctx = createContext();
const app = createApp(ctx);

app.listen(config.port, () => {
  console.log(`SaaS API listening on http://127.0.0.1:${config.port}`);
});
