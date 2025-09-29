import { Elysia } from "elysia";
import { dataServicePlugin } from "./src/plugins/data-service";
import { configPlugin } from "./src/plugins/config-manager";

// Set MongoDB environment for testing
process.env.MONGODB_URL = "mongodb://10.219.8.210:27018/bunsnc";
process.env.MONGODB_DB = "bunsnc";

console.log("Environment:", {
  MONGODB_URL: process.env.MONGODB_URL,
  MONGODB_DB: process.env.MONGODB_DB
});

const app = new Elysia()
  .use(configPlugin)
  .use(dataServicePlugin)
  .get("/debug", ({ dataService, healthCheck }) => {
    console.log("Route context:", {
      hasDataService: !!dataService,
      hasHealthCheck: !!healthCheck,
      dataServiceType: typeof dataService,
      dataServiceValue: dataService
    });
    return {
      hasDataService: !!dataService,
      hasHealthCheck: !!healthCheck,
      error: "none"
    };
  })
  .onError(({ error, code }) => {
    console.error("Plugin error:", error);
    return {
      success: false,
      error: error.message,
      code
    };
  });

const request = new Request("http://localhost/debug");
app.handle(request)
  .then(response => response.text())
  .then(console.log)
  .catch(err => console.error("Outer error:", err));