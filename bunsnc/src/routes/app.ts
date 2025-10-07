import { Elysia, t } from "elysia";
// FIX v5.5.22: Completely remove service imports - use plugins exclusively
// This resolves CRITICAL-2 circular dependency: routes → services → plugins → routes
// Reference: docs/reports/COMPLETE_CODEBASE_ANALYSIS.md
import { serviceNowPlugin } from "../plugins/servicenow";
import { dataPlugin } from "../plugins/data";
import { authPlugin } from "../plugins/auth";
import { getSchemaForTable } from "../types/schemaRegistry";
import { createTicketActionsRoutes } from "./TicketActionsRoutes";
import { createTicketListRoutes } from "./TicketListRoutes";
import { createTicketDetailsRoutes } from "./TicketDetailsRoutes";
import { authRoutes } from "./auth";
import type { ServiceNowStreams } from "../config/redis-streams";
import {
  TableParam,
  TableSysIdParams,
  AttachmentUpload,
  BatchOperation,
} from "../guards/shared.guards";

// Create async app initialization function
async function createApp() {
  console.log("🔍 [DEBUG-APP] createApp() START");

  // FIX v5.5.20: Use ElysiaJS plugin pattern instead of manual service instantiation
  console.log("🔍 [DEBUG-APP] Creating Elysia instance...");
  const app = new Elysia({ name: "app-routes" });

  console.log("🔍 [DEBUG-APP] Loading serviceNowPlugin...");
  app.use(serviceNowPlugin); // Provides: serviceNowBridge, createServiceNowRecord, etc.
  console.log("🔍 [DEBUG-APP] serviceNowPlugin loaded ✓");

  console.log("🔍 [DEBUG-APP] Loading dataPlugin...");
  app.use(dataPlugin); // Provides: data service functionality
  console.log("🔍 [DEBUG-APP] dataPlugin loaded ✓");

  console.log("🔍 [DEBUG-APP] Loading authPlugin...");
  app.use(authPlugin); // Provides: auth functionality
  console.log("🔍 [DEBUG-APP] authPlugin loaded ✓");

  app.onError(({ error, code, set }) => {
    console.error("Global error handler:", {
      error: error.message,
      code,
      stack: error.stack,
    });

    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        success: false,
        error: "Route not found",
        message: "The requested endpoint does not exist",
        timestamp: new Date().toISOString(),
      };
    }

    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false,
        error: "Validation error",
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }

    set.status = 500;
    return {
      success: false,
      error: "Internal server error",
      message: "An unexpected error occurred",
      timestamp: new Date().toISOString(),
    };
  });

  // CRUD seguro - Using plugin context with Guard pattern
  app
    .use(TableParam)
    .post("/record/:table", async ({ params, body, headers, createServiceNowRecord }) => {
      const result = await createServiceNowRecord(params.table, body);
      if (!result.success) {
        throw new Error(result.error || "Failed to create record");
      }
      return result;
    }, {
      body: t.Record(t.String(), t.Any()),
      headers: t.Object({
        "x-instance-url": t.Optional(t.String()),
        authorization: t.Optional(t.String()),
      }),
    });

  console.log(
    "🔍 [DEBUG-APP] Setting up attachment/batch endpoints using plugin methods...",
  );

  // FIX v5.5.22: Use serviceNowPlugin methods with Guard pattern
  // This resolves CRITICAL-2 circular dependency by using plugin-provided services
  // Plugin already loaded on line 30, so uploadAttachment/downloadAttachment/executeBatch are available
  app
    // Upload de anexo with TableSysIdParams Guard
    .use(TableSysIdParams)
    .post(
      "/attachment/:table/:sysId",
      async ({ params, body, headers, uploadAttachment }) => {
        return uploadAttachment({
          table: params.table,
          sysId: params.sysId,
          file: body.file,
          fileName: body.fileName || "uploaded-file",
        });
      },
      {
        body: t.Object({ file: t.Any(), fileName: t.Optional(t.String()) }),
        headers: t.Object({
          "x-instance-url": t.Optional(t.String()),
          authorization: t.Optional(t.String()),
        }),
      },
    )
    // Download de anexo
    .get(
      "/attachment/:attachmentId",
      async ({ params, headers, downloadAttachment }) => {
        return downloadAttachment(params.attachmentId);
      },
      {
        params: t.Object({ attachmentId: t.String() }),
        headers: t.Object({
          "x-instance-url": t.Optional(t.String()),
          authorization: t.Optional(t.String()),
        }),
      },
    )
    // Batch real with BatchOperation Guard
    .use(BatchOperation)
    .post(
      "/batch",
      async ({ body, headers, executeBatch }) => {
        try {
          const results = await executeBatch(body.operations);
          return Response.json(results, { status: 200 });
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 });
        }
      },
      {
        headers: t.Object({
          "x-instance-url": t.Optional(t.String()),
          authorization: t.Optional(t.String()),
        }),
      },
    );

  // FIX v5.5.21: MongoDB/Redis initialization REMOVED from startup
  // Root cause: mongoService.initialize() requires ServiceNowAuthClient parameter
  // ElysiaJS best practice: External services should NOT block server startup
  // Solution: Initialize on-demand via plugins or background tasks
  // See: ELYSIA_BEST_PRACTICES.md - "Non-blocking Service Initialization"

  console.log(
    "🔍 [DEBUG-APP] Skipping MongoDB/Redis sync initialization (non-blocking pattern)",
  );
  console.log("   Enhanced features will initialize on-demand via plugins");

  // FIX v5.5.20: Removed .derive() - services provided via pre-initialization (ROADMAP FASE 1.4)
  // authClient will be available via context from routes/index.ts pre-initialization
  // mongoService and redisStreams created locally above

  // Add authentication routes (including SAML)
  app.use(authRoutes);

  // Add ticket routes following Elysia best practices (services, not controllers)
  console.log("🔍 [DEBUG-APP] Adding ticket routes...");
  app.use(createTicketActionsRoutes());
  console.log("🔍 [DEBUG-APP] TicketActions routes added ✓");

  app.use(createTicketListRoutes());
  console.log("🔍 [DEBUG-APP] TicketList routes added ✓");

  app.use(createTicketDetailsRoutes());
  console.log("🔍 [DEBUG-APP] TicketDetails routes added ✓");

  console.log("🔍 [DEBUG-APP] createApp() COMPLETED - returning app");
  return app;
}

// FIX v5.5.19: Removed top-level createApp() call to prevent startup hang
// Root cause: const appPromise = createApp() executes during import
// Violates ElysiaJS best practice: Don't execute async functions at module scope
// See: docs/reports/ELYSIA_E2E_VERIFICATION_v5.5.19.md
// const appPromise = createApp();
// export default appPromise;
export { createApp };
export default createApp; // ✅ Export factory function
