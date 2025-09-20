import { Elysia, t } from "elysia";
import { serviceNowService, authService, dataService } from "../services";
import { getSchemaForTable } from "../types/schemaRegistry";
import { createTicketActionsRoutes } from "./TicketActionsRoutes";
import { createTicketListRoutes } from "./TicketListRoutes";
import { createTicketDetailsRoutes } from "./TicketDetailsRoutes";
import { authRoutes } from "./auth";
import type { ServiceNowStreams } from "../config/redis-streams";

// Create async app initialization function
async function createApp() {
  const app = new Elysia()
    .onError(({ error, code, set }) => {
      console.error('Global error handler:', { error: error.message, code, stack: error.stack });

      if (code === 'NOT_FOUND') {
        set.status = 404;
        return {
          success: false,
          error: 'Route not found',
          message: 'The requested endpoint does not exist',
          timestamp: new Date().toISOString()
        };
      }

      if (code === 'VALIDATION') {
        set.status = 400;
        return {
          success: false,
          error: 'Validation error',
          message: error.message,
          timestamp: new Date().toISOString()
        };
      }

      set.status = 500;
      return {
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString()
      };
    });

  // CRUD seguro
  app.post("/record/:table",
  async ({ params, body, headers }) => {
    return serviceNowService.create(params.table, body);
  },
  {
    params: t.Object({ table: t.String() }),
    body: t.Record(t.String(), t.Any()),
    headers: t.Object({
      "x-instance-url": t.Optional(t.String()),
      authorization: t.Optional(t.String())
    })
  }
);

// Upload de anexo
app.post("/attachment/:table/:sysId",
  async ({ params, body, headers }) => {
    return serviceNowService.uploadAttachment({
      table: params.table,
      sysId: params.sysId,
      file: body.file,
      fileName: body.fileName || 'uploaded-file'
    });
  },
  {
    params: t.Object({ table: t.String(), sysId: t.String() }),
    body: t.Object({ file: t.Any(), fileName: t.Optional(t.String()) }),
    headers: t.Object({
      "x-instance-url": t.Optional(t.String()),
      authorization: t.Optional(t.String())
    })
  }
);

// Download de anexo
app.get("/attachment/:attachmentId",
  async ({ params, headers }) => {
    return serviceNowService.downloadAttachment(params.attachmentId);
  },
  {
    params: t.Object({ attachmentId: t.String() }),
    headers: t.Object({
      "x-instance-url": t.Optional(t.String()),
      authorization: t.Optional(t.String())
    })
  }
);

// Batch real
app.post("/batch",
  async ({ body, headers }) => {
    if (!body || body.operations == null || !Array.isArray(body.operations)) {
      console.error("Batch endpoint: invalid operations value", body && body.operations);
      return Response.json({ error: "operations deve ser um array" }, { status: 400 });
    }
    try {
      const results = await serviceNowService.executeBatch(body.operations);
      return Response.json(results, { status: 200 });
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 });
    }
  },
  {
    body: t.Object({ operations: t.Array(t.Any()) }),
    headers: t.Object({
      "x-instance-url": t.Optional(t.String()),
      authorization: t.Optional(t.String())
    })
  }
  );

  // Use consolidated auth service
  const defaultServiceNowClient = authService;

  // Initialize MongoDB and Redis services for enhanced features
  let mongoService = dataService;
  let redisStreams: ServiceNowStreams | undefined;

  try {
    // Initialize MongoDB persistence service
    await dataService.initialize();
    console.log(' MongoDB service initialized for enhanced features');
  } catch (error) {
    console.warn(' MongoDB service not available, enhanced features will be limited:', error.message);
  }

  try {
    // Initialize Redis Streams with dynamic import to avoid circular deps
    const { ServiceNowStreams } = await import("../config/redis-streams");
    redisStreams = new ServiceNowStreams();
    await redisStreams.initialize();
    console.log(' Redis Streams initialized for real-time features');
  } catch (error) {
    console.warn(' Redis Streams not available, real-time features will be limited:', error.message);
  }

  // Add authentication routes (including SAML)
  app.use(authRoutes);

  // Add ticket routes following Elysia best practices (services, not controllers)
  app.use(createTicketActionsRoutes());
  app.use(createTicketListRoutes(defaultServiceNowClient));
  app.use(createTicketDetailsRoutes(defaultServiceNowClient, mongoService, redisStreams));
  
  return app;
}

// Initialize and export the app
const appPromise = createApp();
export default appPromise;
export { createApp };