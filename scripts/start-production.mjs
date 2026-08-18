import { assertProductionEnvironment } from "./production-env-preflight.mjs";

assertProductionEnvironment();

await import("../server.js");
