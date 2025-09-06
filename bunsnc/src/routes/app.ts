import { Elysia, t } from "elysia";
import { BatchService } from "../services/batch.service";
import { ServiceNowService } from "../services/servicenow.service";
import { getSchemaForTable } from "../types/schemaRegistry";
import { AttachmentService } from "../services/attachment.service";
import { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import { createTicketActionsRoutes } from "./TicketActionsRoutes";
import { createTicketListRoutes } from "./TicketListRoutes";
import { createTicketDetailsRoutes } from "./TicketDetailsRoutes";

const app = new Elysia();

// CRUD seguro
app.post("/record/:table",
  async ({ params, body, headers }) => {
    const instanceUrl = headers["x-instance-url"] || Bun.env.SNC_INSTANCE_URL || "";
    const authToken = headers["authorization"] || Bun.env.SNC_AUTH_TOKEN || "";
    const service = new ServiceNowService(instanceUrl, authToken);
    return service.create(params.table, body);
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
    const instanceUrl = headers["x-instance-url"] || Bun.env.SNC_INSTANCE_URL || "";
    const authToken = headers["authorization"] || Bun.env.SNC_AUTH_TOKEN || "";
    const service = new AttachmentService(instanceUrl, authToken);
    return service.upload(params.table, params.sysId, body.file);
  },
  {
    params: t.Object({ table: t.String(), sysId: t.String() }),
    body: t.Object({ file: t.Any() }),
    headers: t.Object({
      "x-instance-url": t.Optional(t.String()),
      authorization: t.Optional(t.String())
    })
  }
);

// Download de anexo
app.get("/attachment/:attachmentId",
  async ({ params, headers }) => {
    const instanceUrl = headers["x-instance-url"] || Bun.env.SNC_INSTANCE_URL || "";
    const authToken = headers["authorization"] || Bun.env.SNC_AUTH_TOKEN || "";
    const service = new AttachmentService(instanceUrl, authToken);
    return service.download(params.attachmentId);
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
    const instanceUrl = headers["x-instance-url"] || Bun.env.SNC_INSTANCE_URL || "";
    const authToken = headers["authorization"] || Bun.env.SNC_AUTH_TOKEN || "";
    if (!body || body.operations == null || !Array.isArray(body.operations)) {
      console.error("Batch endpoint: invalid operations value", body && body.operations);
      return Response.json({ error: "operations deve ser um array" }, { status: 400 });
    }
    try {
      const results = await BatchService.executeBatch(instanceUrl, authToken, body.operations);
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

// Initialize default ServiceNow client for ticket routes
const defaultServiceNowClient = new ServiceNowAuthClient(
  Bun.env.SNC_INSTANCE_URL || "",
  Bun.env.SNC_AUTH_TOKEN || ""
);

// Add ticket routes
app.use(createTicketActionsRoutes(defaultServiceNowClient));
app.use(createTicketListRoutes(defaultServiceNowClient));
app.use(createTicketDetailsRoutes(defaultServiceNowClient));

export default app;
export { app };