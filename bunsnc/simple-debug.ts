import { Elysia } from "elysia";

// Test 1: Basic Elysia app
console.log("Test 1: Basic Elysia");
const basicApp = new Elysia()
  .get("/test", () => ({ message: "Basic working" }));

basicApp.handle(new Request("http://localhost/test"))
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);

// Test 2: Config plugin only
console.log("Test 2: Config plugin");
import { configPlugin } from "./src/plugins/config-manager";

const configApp = new Elysia()
  .use(configPlugin)
  .get("/config", ({ config }) => ({ hasConfig: !!config }));

configApp.handle(new Request("http://localhost/config"))
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);

// Test 3: Data service plugin WITHOUT config plugin
console.log("Test 3: Data service standalone");
import { dataServicePlugin } from "./src/plugins/data-service";

const standaloneApp = new Elysia()
  .use(dataServicePlugin)
  .get("/standalone", ({ dataService }) => ({ hasDataService: !!dataService }));

standaloneApp.handle(new Request("http://localhost/standalone"))
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);