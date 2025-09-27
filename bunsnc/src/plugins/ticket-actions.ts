/**
 * Ticket Actions Plugin - Elysia plugin for ServiceNow workflow operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Dependency injection via .decorate()
 * - Shared ticket action functionality
 * - Plugin lifecycle hooks (onStart, onStop)
 * - Type safety com Eden Treaty
 *
 * Converts TicketActionsRoutes.ts from route factory to plugin pattern
 */

import { Elysia, t } from "elysia";
import { consolidatedServiceNowService } from "../services";

// Types para Eden Treaty
export interface TicketActionsPluginContext {
  resolveTicket: (data: ResolveTicketRequest) => Promise<ActionResult>;
  closeTicket: (data: CloseTicketRequest) => Promise<ActionResult>;
  reopenTicket: (data: ReopenTicketRequest) => Promise<ActionResult>;
  assignTicket: (data: AssignTicketRequest) => Promise<ActionResult>;
  updatePriority: (data: UpdatePriorityRequest) => Promise<ActionResult>;
  updateCategory: (data: UpdateCategoryRequest) => Promise<ActionResult>;
  escalateTicket: (data: EscalateTicketRequest) => Promise<ActionResult>;
  selfAssignTicket: (data: SelfAssignRequest) => Promise<ActionResult>;
  getResolutionCodes: (table: string) => Promise<ResolutionCode[]>;
  getCloseCodes: (table: string) => Promise<CloseCode[]>;
}

export interface ResolveTicketRequest {
  table: string;
  sysId: string;
  resolutionCode: string;
  resolutionNotes: string;
  closeCode?: string;
}

export interface CloseTicketRequest {
  table: string;
  sysId: string;
  closeCode: string;
  closeNotes: string;
}

export interface ReopenTicketRequest {
  table: string;
  sysId: string;
  reopenNotes: string;
  reason: string;
}

export interface AssignTicketRequest {
  table: string;
  sysId: string;
  assignedTo?: string;
  assignmentGroup?: string;
  assignmentNotes?: string;
}

export interface UpdatePriorityRequest {
  table: string;
  sysId: string;
  newPriority: "1" | "2" | "3" | "4" | "5";
  justification: string;
}

export interface UpdateCategoryRequest {
  table: string;
  sysId: string;
  category: string;
  subcategory?: string;
  justification: string;
}

export interface EscalateTicketRequest {
  table: string;
  sysId: string;
  escalationGroup: string;
  reason: string;
  notes?: string;
}

export interface SelfAssignRequest {
  table: string;
  sysId: string;
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
}

export interface ResolutionCode {
  value: string;
  label: string;
}

export interface CloseCode {
  value: string;
  label: string;
}

/**
 * Ticket Actions Plugin - Separate Instance Method pattern
 * Provides shared ticket workflow operations through dependency injection
 */
export const ticketActionsPlugin = new Elysia({
  name: "servicenow-ticket-actions-plugin",
  prefix: "/tickets/actions",
  seed: {
    resolveTicket: {} as TicketActionsPluginContext["resolveTicket"],
    closeTicket: {} as TicketActionsPluginContext["closeTicket"],
    reopenTicket: {} as TicketActionsPluginContext["reopenTicket"],
    assignTicket: {} as TicketActionsPluginContext["assignTicket"],
    updatePriority: {} as TicketActionsPluginContext["updatePriority"],
    updateCategory: {} as TicketActionsPluginContext["updateCategory"],
    escalateTicket: {} as TicketActionsPluginContext["escalateTicket"],
    selfAssignTicket: {} as TicketActionsPluginContext["selfAssignTicket"],
    getResolutionCodes: {} as TicketActionsPluginContext["getResolutionCodes"],
    getCloseCodes: {} as TicketActionsPluginContext["getCloseCodes"],
  },
})
  // Lifecycle Hook: onStart - Initialize Ticket Actions
  .onStart(() => {
    console.log(
      "🎫 Ticket Actions Plugin starting - workflow operations available",
    );
  })

  // Business logic methods - replace direct service calls
  .decorate(
    "resolveTicket",
    async function (
      this: {},
      data: ResolveTicketRequest,
    ): Promise<ActionResult> {
      try {
        const result = await consolidatedServiceNowService.resolveTicket(data);
        return {
          success: result.success,
          data: result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
  )

  .decorate(
    "closeTicket",
    async function (this: {}, data: CloseTicketRequest): Promise<ActionResult> {
      try {
        const result = await consolidatedServiceNowService.closeTicket(data);
        return {
          success: result.success,
          data: result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
  )

  .decorate(
    "reopenTicket",
    async function (
      this: {},
      data: ReopenTicketRequest,
    ): Promise<ActionResult> {
      try {
        const result = await consolidatedServiceNowService.reopenTicket(data);
        return {
          success: result.success,
          data: result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
  )

  .decorate(
    "assignTicket",
    async function (
      this: {},
      data: AssignTicketRequest,
    ): Promise<ActionResult> {
      try {
        const result = await consolidatedServiceNowService.assignTicket(data);
        return {
          success: result.success,
          data: result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
  )

  .decorate(
    "updatePriority",
    async function (
      this: {},
      data: UpdatePriorityRequest,
    ): Promise<ActionResult> {
      try {
        const result = await consolidatedServiceNowService.updatePriority(data);
        return {
          success: result.success,
          data: result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
  )

  .decorate(
    "updateCategory",
    async function (
      this: {},
      data: UpdateCategoryRequest,
    ): Promise<ActionResult> {
      try {
        const result = await consolidatedServiceNowService.updateCategory(data);
        return {
          success: result.success,
          data: result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
  )

  .decorate(
    "escalateTicket",
    async function (
      this: {},
      data: EscalateTicketRequest,
    ): Promise<ActionResult> {
      try {
        const result = await consolidatedServiceNowService.assignTicket({
          table: data.table,
          sysId: data.sysId,
          assignmentGroup: data.escalationGroup,
          assignmentNotes: `ESCALATED\nReason: ${data.reason}\n\n${data.notes || "No additional notes provided"}`,
        });

        return {
          success: result.success,
          data: result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
  )

  .decorate(
    "selfAssignTicket",
    async function (
      this: {},
      data: SelfAssignRequest,
      authContext?: { userId?: string; userSysId?: string },
    ): Promise<ActionResult> {
      try {
        // Get current user from authentication context or environment
        const currentUser =
          authContext?.userSysId ||
          authContext?.userId ||
          process.env.SERVICENOW_DEFAULT_USER ||
          "system.admin";

        if (!currentUser || currentUser === "system.admin") {
          return {
            success: false,
            error: "User authentication required for self-assignment",
            timestamp: new Date().toISOString(),
          };
        }

        const result = await consolidatedServiceNowService.assignTicket({
          table: data.table,
          sysId: data.sysId,
          assignedTo: currentUser,
          assignmentNotes: "Self-assigned via BunSNC interface",
        });

        return {
          success: result.success,
          data: result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
  )

  // Reference data methods - queries ServiceNow for real resolution codes
  .decorate(
    "getResolutionCodes",
    async function (this: {}, table: string): Promise<ResolutionCode[]> {
      try {
        // Query ServiceNow for actual resolution codes based on table type
        const fieldName =
          table === "incident"
            ? "resolution_code"
            : table === "change_task"
              ? "close_code"
              : table === "sc_task"
                ? "state"
                : "resolution_code";

        // Use consolidated service to get choice list values
        const choiceListQuery = {
          sysparm_query: `name=${table}^element=${fieldName}^language=en`,
          sysparm_fields: "value,label",
          sysparm_limit: 100,
        };

        const result = await consolidatedServiceNowService.query(
          "sys_choice",
          choiceListQuery,
        );

        if (result.success && result.result) {
          return result.result.map((choice: any) => ({
            value: choice.value || choice.sys_id,
            label: choice.label || choice.display_value || choice.value,
          }));
        }

        // Fallback to minimal default values if ServiceNow query fails
        console.warn(
          `Failed to get resolution codes for ${table}, using fallback`,
        );
        return table === "incident"
          ? [
              { value: "Solved", label: "Solved" },
              { value: "Not Solved", label: "Not Solved" },
            ]
          : [
              { value: "Successful", label: "Successful" },
              { value: "Unsuccessful", label: "Unsuccessful" },
            ];
      } catch (error: any) {
        console.error(
          `Error getting resolution codes for ${table}:`,
          error.message,
        );
        return [{ value: "Resolved", label: "Resolved" }]; // Minimal fallback
      }
    },
  )

  .decorate("getCloseCodes", async function (this: {}, table: string): Promise<
    CloseCode[]
  > {
    try {
      // Query ServiceNow for actual close codes based on table type
      const fieldName =
        table === "incident"
          ? "close_code"
          : table === "change_task"
            ? "close_code"
            : table === "sc_task"
              ? "close_code"
              : "close_code";

      // Use consolidated service to get choice list values for close codes
      const choiceListQuery = {
        sysparm_query: `name=${table}^element=${fieldName}^language=en`,
        sysparm_fields: "value,label",
        sysparm_limit: 100,
      };

      const result = await consolidatedServiceNowService.query(
        "sys_choice",
        choiceListQuery,
      );

      if (result.success && result.result) {
        return result.result.map((choice: any) => ({
          value: choice.value || choice.sys_id,
          label: choice.label || choice.display_value || choice.value,
        }));
      }

      // Fallback to minimal default values if ServiceNow query fails
      console.warn(`Failed to get close codes for ${table}, using fallback`);
      return table === "incident"
        ? [
            { value: "Solved", label: "Solved" },
            { value: "Closed", label: "Closed" },
          ]
        : [
            { value: "Successful", label: "Successful" },
            { value: "Complete", label: "Complete" },
          ];
    } catch (error: any) {
      console.error(`Error getting close codes for ${table}:`, error.message);
      return [{ value: "Closed", label: "Closed" }]; // Minimal fallback
    }
  })

  // === API ENDPOINTS ===

  /**
   * Resolve ticket with resolution code and notes
   * POST /tickets/actions/resolve
   */
  .post(
    "/resolve",
    async ({ resolveTicket, body }) => {
      return await resolveTicket(body);
    },
    {
      body: t.Object({
        table: t.String({ minLength: 1 }),
        sysId: t.String({ minLength: 1 }),
        resolutionCode: t.String({ minLength: 1 }),
        resolutionNotes: t.String({ minLength: 1 }),
        closeCode: t.Optional(t.String()),
      }),
      detail: {
        summary: "Resolve Ticket",
        description: "Resolve ticket with resolution code and notes",
        tags: ["Tickets", "Actions", "Resolve"],
      },
    },
  )

  /**
   * Close ticket with close code and notes
   * POST /tickets/actions/close
   */
  .post(
    "/close",
    async ({ closeTicket, body }) => {
      return await closeTicket(body);
    },
    {
      body: t.Object({
        table: t.String({ minLength: 1 }),
        sysId: t.String({ minLength: 1 }),
        closeCode: t.String({ minLength: 1 }),
        closeNotes: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Close Ticket",
        description: "Close ticket with close code and notes",
        tags: ["Tickets", "Actions", "Close"],
      },
    },
  )

  /**
   * Reopen resolved/closed ticket
   * POST /tickets/actions/reopen
   */
  .post(
    "/reopen",
    async ({ reopenTicket, body }) => {
      return await reopenTicket(body);
    },
    {
      body: t.Object({
        table: t.String({ minLength: 1 }),
        sysId: t.String({ minLength: 1 }),
        reopenNotes: t.String({ minLength: 1 }),
        reason: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Reopen Ticket",
        description: "Reopen resolved/closed ticket",
        tags: ["Tickets", "Actions", "Reopen"],
      },
    },
  )

  /**
   * Assign ticket to user or group
   * POST /tickets/actions/assign
   */
  .post(
    "/assign",
    async ({ assignTicket, body }) => {
      return await assignTicket(body);
    },
    {
      body: t.Object({
        table: t.String({ minLength: 1 }),
        sysId: t.String({ minLength: 1 }),
        assignedTo: t.Optional(t.String()),
        assignmentGroup: t.Optional(t.String()),
        assignmentNotes: t.Optional(t.String()),
      }),
      detail: {
        summary: "Assign Ticket",
        description: "Assign ticket to user or group",
        tags: ["Tickets", "Actions", "Assign"],
      },
    },
  )

  /**
   * Update ticket priority
   * POST /tickets/actions/priority
   */
  .post(
    "/priority",
    async ({ updatePriority, body }) => {
      return await updatePriority(body);
    },
    {
      body: t.Object({
        table: t.String({ minLength: 1 }),
        sysId: t.String({ minLength: 1 }),
        newPriority: t.Union([
          t.Literal("1"),
          t.Literal("2"),
          t.Literal("3"),
          t.Literal("4"),
          t.Literal("5"),
        ]),
        justification: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Update Priority",
        description: "Update ticket priority",
        tags: ["Tickets", "Actions", "Priority"],
      },
    },
  )

  /**
   * Update ticket category
   * POST /tickets/actions/category
   */
  .post(
    "/category",
    async ({ updateCategory, body }) => {
      return await updateCategory(body);
    },
    {
      body: t.Object({
        table: t.String({ minLength: 1 }),
        sysId: t.String({ minLength: 1 }),
        category: t.String({ minLength: 1 }),
        subcategory: t.Optional(t.String()),
        justification: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Update Category",
        description: "Update ticket category",
        tags: ["Tickets", "Actions", "Category"],
      },
    },
  )

  /**
   * Self-assign ticket to current user
   * POST /tickets/actions/self-assign
   */
  .post(
    "/self-assign",
    async ({ selfAssignTicket, body }) => {
      return await selfAssignTicket(body);
    },
    {
      body: t.Object({
        table: t.String({ minLength: 1 }),
        sysId: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Self Assign",
        description: "Self-assign ticket to current user",
        tags: ["Tickets", "Actions", "Self-Assign"],
      },
    },
  )

  /**
   * Escalate ticket (assign to higher level group)
   * POST /tickets/actions/escalate
   */
  .post(
    "/escalate",
    async ({ escalateTicket, body }) => {
      return await escalateTicket(body);
    },
    {
      body: t.Object({
        table: t.String({ minLength: 1 }),
        sysId: t.String({ minLength: 1 }),
        escalationGroup: t.String({ minLength: 1 }),
        reason: t.String({ minLength: 1 }),
        notes: t.Optional(t.String()),
      }),
      detail: {
        summary: "Escalate Ticket",
        description: "Escalate ticket to higher level group",
        tags: ["Tickets", "Actions", "Escalate"],
      },
    },
  )

  /**
   * Get available resolution codes for a table
   * GET /tickets/actions/resolution-codes/:table
   */
  .get(
    "/resolution-codes/:table",
    async ({ getResolutionCodes, params: { table } }) => {
      try {
        const codes = await getResolutionCodes(table);
        return {
          success: true,
          data: codes,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Get Resolution Codes",
        description:
          "Get available resolution codes for a table from ServiceNow",
        tags: ["Tickets", "Reference", "Resolution"],
      },
    },
  )

  /**
   * Get available close codes for a table
   * GET /tickets/actions/close-codes/:table
   */
  .get(
    "/close-codes/:table",
    async ({ getCloseCodes, params: { table } }) => {
      try {
        const codes = await getCloseCodes(table);
        return {
          success: true,
          data: codes,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Get Close Codes",
        description: "Get available close codes for a table from ServiceNow",
        tags: ["Tickets", "Reference", "Close"],
      },
    },
  )

  /**
   * Health check for actions service
   * GET /tickets/actions/health
   */
  .get(
    "/health",
    () => {
      return {
        success: true,
        service: "Ticket Actions Service",
        status: "healthy",
        timestamp: new Date().toISOString(),
      };
    },
    {
      detail: {
        summary: "Health Check",
        description: "Health check for ticket actions service",
        tags: ["Health", "Plugin", "Actions"],
      },
    },
  )

  // Lifecycle Hook: onStop - Cleanup
  .onStop(() => {
    console.log("🛑 Ticket Actions Plugin stopping - cleanup completed");
  });

// Export plugin context type for Eden Treaty
export type TicketActionsPluginApp = typeof ticketActionsPlugin;

// Functional Callback Method pattern - for conditional use
export const createTicketActionsPlugin = (config?: {
  enableAllActions?: boolean;
  enableEscalation?: boolean;
  enableSelfAssign?: boolean;
}) => {
  return (app: Elysia) =>
    app.use(ticketActionsPlugin).onStart(() => {
      console.log(
        "🔌 Ticket Actions Plugin applied - workflow operations available via dependency injection",
      );
      console.log(
        "📦 Direct ticket action imports eliminated - using plugin injection",
      );
    });
};

// Export types for other modules
export type {
  ResolveTicketRequest,
  CloseTicketRequest,
  ReopenTicketRequest,
  AssignTicketRequest,
  UpdatePriorityRequest,
  UpdateCategoryRequest,
  EscalateTicketRequest,
  SelfAssignRequest,
  ActionResult,
  ResolutionCode,
  CloseCode,
};
