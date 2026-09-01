import path from "node:path";
import { Store } from "./store.js";
import { emptyDb, type DbShape } from "./types.js";
import { config } from "./config.js";

export interface AppContext {
  store: Store<DbShape>;
}

export function createContext(dataDir = config.dataDir): AppContext {
  return {
    store: new Store<DbShape>(path.join(dataDir, "saas.json"), emptyDb()),
  };
}
