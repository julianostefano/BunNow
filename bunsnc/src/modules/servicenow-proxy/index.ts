/**
 * ServiceNow Proxy Routes Module - Rotas proxy internas seguindo Elysia Best Practices
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este módulo implementa as rotas proxy internas que resolvem self-referencing calls:
 * - Recebe calls para /api/v1/servicenow/tickets/* (self-referencing)
 * - Faz bridge para ServiceNow real usando ServiceNowBridgeService
 * - Aplicação completa das Elysia best practices
 *
 * Best Practices Aplicadas:
 * - Plugin system com lifecycle hooks
 * - Eden Treaty type safety
 * - Error handling centralizado
 * - Validation schema dinâmica
 * - MVC separation
 * - Arquivo < 500 linhas
 */

import { Elysia, t } from "elysia";
import { serviceNowBridgeService } from "../../services/ServiceNowBridgeService";

// Types para Eden Treaty
export interface ServiceNowProxyRequest {
  table: string;
  sys_id?: string;
  query?: Record<string, any>;
  data?: Record<string, any>;
}

export interface ServiceNowProxyResponse<T = any> {
  success: boolean;
  result?: T;
  total?: number;
  error?: string;
  duration?: number;
  module: string;
  timestamp: string;
}

// Route handlers seguindo MVC pattern
const serviceNowProxyHandlers = {
  // GET /api/v1/servicenow/tickets/:table
  async getTickets({
    params,
    query,
    set,
    requestId,
  }: any): Promise<ServiceNowProxyResponse> {
    try {
      const { table } = params;

      console.log(`[${requestId}] Proxy GET: ${table}`, query);

      const result = await serviceNowBridgeService.queryTable(table, query);

      if (!result.success) {
        set.status = 500;
        throw new Error(result.error || "Bridge service failed");
      }

      return {
        ...result,
        module: "servicenow-proxy",
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error(`[${requestId}] Proxy GET error:`, error.message);
      throw error;
    }
  },

  // POST /api/v1/servicenow/tickets/:table
  async createTicket({
    params,
    body,
    set,
    requestId,
  }: any): Promise<ServiceNowProxyResponse> {
    try {
      const { table } = params;

      console.log(`[${requestId}] Proxy POST: ${table}`);

      const result = await serviceNowBridgeService.createRecord(table, body);

      if (!result.success) {
        set.status = 500;
        throw new Error(result.error || "Bridge service failed");
      }

      set.status = 201;
      return {
        ...result,
        module: "servicenow-proxy",
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error(`[${requestId}] Proxy POST error:`, error.message);
      throw error;
    }
  },

  // PUT /api/v1/servicenow/tickets/:table/:sys_id
  async updateTicket({
    params,
    body,
    set,
    requestId,
  }: any): Promise<ServiceNowProxyResponse> {
    try {
      const { table, sys_id } = params;

      console.log(`[${requestId}] Proxy PUT: ${table}/${sys_id}`);

      const result = await serviceNowBridgeService.updateRecord(
        table,
        sys_id,
        body,
      );

      if (!result.success) {
        set.status = 500;
        throw new Error(result.error || "Bridge service failed");
      }

      return {
        ...result,
        module: "servicenow-proxy",
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error(`[${requestId}] Proxy PUT error:`, error.message);
      throw error;
    }
  },

  // DELETE /api/v1/servicenow/tickets/:table/:sys_id
  async deleteTicket({
    params,
    set,
    requestId,
  }: any): Promise<ServiceNowProxyResponse> {
    try {
      const { table, sys_id } = params;

      console.log(`[${requestId}] Proxy DELETE: ${table}/${sys_id}`);

      const result = await serviceNowBridgeService.deleteRecord(table, sys_id);

      if (!result.success) {
        set.status = 500;
        throw new Error(result.error || "Bridge service failed");
      }

      return {
        success: true,
        result: { deleted: true },
        module: "servicenow-proxy",
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error(`[${requestId}] Proxy DELETE error:`, error.message);
      throw error;
    }
  },

  // GET /api/v1/servicenow/tickets/:table/:sys_id
  async getTicket({
    params,
    query,
    set,
    requestId,
  }: any): Promise<ServiceNowProxyResponse> {
    try {
      const { table, sys_id } = params;

      console.log(`[${requestId}] Proxy GET: ${table}/${sys_id}`);

      const result = await serviceNowBridgeService.getRecord(
        table,
        sys_id,
        query,
      );

      if (!result.success) {
        set.status = 500;
        throw new Error(result.error || "Bridge service failed");
      }

      if (!result.result) {
        set.status = 404;
        return {
          success: false,
          error: "Record not found",
          module: "servicenow-proxy",
          timestamp: new Date().toISOString(),
        };
      }

      return {
        ...result,
        module: "servicenow-proxy",
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error(`[${requestId}] Proxy GET record error:`, error.message);
      throw error;
    }
  },
};

// ServiceNow Proxy Routes Module com Elysia Best Practices
export const serviceNowProxyRoutes = new Elysia({
  prefix: "/api/v1/servicenow",
  name: "servicenow-proxy",
})
  // Lifecycle Hook: onStart
  .onStart(() => {
    console.log("🚀 ServiceNow Proxy Routes module started");
    console.log("📡 Self-referencing calls will be bridged to ServiceNow real");
  })

  // Lifecycle Hook: beforeHandle (request logging + ID generation)
  .derive(({ request }) => {
    const requestId = `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${requestId}] ${request.method} ${request.url}`);
    return { requestId };
  })

  // Lifecycle Hook: onError (centralized error handling)
  .onError(({ error, code, set, request, requestId }) => {
    const errorLog = {
      requestId,
      method: request.method,
      url: request.url,
      code,
      message: error.message,
      timestamp: new Date().toISOString(),
    };

    console.error("[ServiceNowProxy] Error:", errorLog);

    // Set appropriate status codes
    if (code === "VALIDATION") {
      set.status = 400;
    } else if (code === "NOT_FOUND") {
      set.status = 404;
    } else if (set.status === undefined) {
      set.status = 500;
    }

    return {
      success: false,
      error: error.message,
      code,
      module: "servicenow-proxy",
      timestamp: new Date().toISOString(),
      requestId,
    };
  })

  // Tickets group - implementa todas as rotas esperadas pelos serviços
  .group("/tickets", (app) =>
    app
      // GET /api/v1/servicenow/tickets/:table
      .get("/:table", serviceNowProxyHandlers.getTickets, {
        params: t.Object({
          table: t.String({
            minLength: 1,
            description: "ServiceNow table name",
          }),
        }),
        query: t.Optional(t.Record(t.String(), t.Any())),
        response: {
          200: t.Object({
            success: t.Boolean(),
            result: t.Optional(t.Array(t.Any())),
            total: t.Optional(t.Number()),
            module: t.String(),
            timestamp: t.String(),
          }),
          500: t.Object({
            success: t.Boolean(),
            error: t.String(),
            module: t.String(),
            timestamp: t.String(),
          }),
        },
        detail: {
          summary: "Query ServiceNow table via proxy",
          description:
            "Queries records from specified ServiceNow table using internal bridge",
          tags: ["ServiceNow", "Proxy", "Query"],
        },
      })

      // GET /api/v1/servicenow/tickets/:table/:sys_id
      .get("/:table/:sys_id", serviceNowProxyHandlers.getTicket, {
        params: t.Object({
          table: t.String({ minLength: 1 }),
          sys_id: t.String({ minLength: 1 }),
        }),
        query: t.Optional(t.Record(t.String(), t.Any())),
        detail: {
          summary: "Get specific ServiceNow record via proxy",
          tags: ["ServiceNow", "Proxy", "Get"],
        },
      })

      // POST /api/v1/servicenow/tickets/:table
      .post("/:table", serviceNowProxyHandlers.createTicket, {
        params: t.Object({
          table: t.String({ minLength: 1 }),
        }),
        body: t.Record(t.String(), t.Any()),
        response: {
          201: t.Object({
            success: t.Boolean(),
            result: t.Optional(t.Any()),
            module: t.String(),
            timestamp: t.String(),
          }),
        },
        detail: {
          summary: "Create ServiceNow record via proxy",
          tags: ["ServiceNow", "Proxy", "Create"],
        },
      })

      // PUT /api/v1/servicenow/tickets/:table/:sys_id
      .put("/:table/:sys_id", serviceNowProxyHandlers.updateTicket, {
        params: t.Object({
          table: t.String({ minLength: 1 }),
          sys_id: t.String({ minLength: 1 }),
        }),
        body: t.Record(t.String(), t.Any()),
        detail: {
          summary: "Update ServiceNow record via proxy",
          tags: ["ServiceNow", "Proxy", "Update"],
        },
      })

      // DELETE /api/v1/servicenow/tickets/:table/:sys_id
      .delete("/:table/:sys_id", serviceNowProxyHandlers.deleteTicket, {
        params: t.Object({
          table: t.String({ minLength: 1 }),
          sys_id: t.String({ minLength: 1 }),
        }),
        detail: {
          summary: "Delete ServiceNow record via proxy",
          tags: ["ServiceNow", "Proxy", "Delete"],
        },
      })

      // Special endpoints que os serviços esperam
      .get(
        "/task_sla",
        async ({ query, requestId }) => {
          console.log(`[${requestId}] Proxy task_sla query`);
          return await serviceNowProxyHandlers.getTickets({
            params: { table: "task_sla" },
            query,
            requestId,
          });
        },
        {
          query: t.Optional(t.Record(t.String(), t.Any())),
          detail: {
            summary: "Query Task SLA records via proxy",
            tags: ["ServiceNow", "Proxy", "SLA"],
          },
        },
      )

      .get(
        "/sla_definition",
        async ({ query, requestId }) => {
          console.log(`[${requestId}] Proxy sla_definition query`);
          return await serviceNowProxyHandlers.getTickets({
            params: { table: "sla_definition" },
            query,
            requestId,
          });
        },
        {
          query: t.Optional(t.Record(t.String(), t.Any())),
          detail: {
            summary: "Query SLA Definition records via proxy",
            tags: ["ServiceNow", "Proxy", "SLA"],
          },
        },
      )

      .get(
        "/contract_sla",
        async ({ query, requestId }) => {
          console.log(`[${requestId}] Proxy contract_sla query`);
          return await serviceNowProxyHandlers.getTickets({
            params: { table: "contract_sla" },
            query,
            requestId,
          });
        },
        {
          query: t.Optional(t.Record(t.String(), t.Any())),
          detail: {
            summary: "Query Contract SLA records via proxy",
            tags: ["ServiceNow", "Proxy", "SLA"],
          },
        },
      ),
  )

  // Legacy lazy-load endpoints for compatibility
  .group("/tickets", (app) =>
    app.group("/lazy-load", (app) =>
      app
        // GET /tickets/lazy-load/:table/:state (legacy compatibility)
        .get(
          "/:table/:state",
          async ({ params, query, requestId }) => {
            console.log(
              `[${requestId}] Legacy lazy-load: ${params.table}/${params.state}`,
            );

            // Delegate to standard tickets route with same parameters
            return await serviceNowProxyHandlers.getTickets({
              params: { table: params.table },
              query: { ...query, state: params.state },
              requestId,
            });
          },
          {
            params: t.Object({
              table: t.String({ minLength: 1 }),
              state: t.String({ minLength: 1 }),
            }),
            query: t.Optional(t.Record(t.String(), t.Any())),
            detail: {
              summary: "Legacy lazy-load endpoint for backward compatibility",
              tags: ["ServiceNow", "Proxy", "Legacy", "Lazy-Load"],
            },
          },
        ),
    ),
  )

  // Health check endpoint
  .get(
    "/health",
    async ({ requestId }) => {
      console.log(`[${requestId}] Proxy health check`);

      const bridgeHealth = await serviceNowBridgeService.healthCheck();
      const bridgeMetrics = serviceNowBridgeService.getMetrics();

      return {
        success: true,
        result: {
          status: "healthy",
          bridge: bridgeHealth.result,
          metrics: bridgeMetrics,
        },
        module: "servicenow-proxy",
        timestamp: new Date().toISOString(),
      };
    },
    {
      detail: {
        summary: "ServiceNow Proxy Health Check",
        tags: ["Health", "Proxy"],
      },
    },
  )

  // Lifecycle Hook: afterHandle (response logging)
  .derive(({ requestId }) => ({ requestId }));

// Export type para Eden Treaty
export type ServiceNowProxyApp = typeof serviceNowProxyRoutes;
