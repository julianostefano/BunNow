/**
 * Ticket Actions Routes - ServiceNow workflow operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { consolidatedServiceNowService } from "../services";

export const createTicketActionsRoutes = () => {
  return (
    new Elysia({ prefix: "/tickets/actions" })
      /**
       * Resolve ticket with resolution code and notes
       * POST /tickets/actions/resolve
       */
      .post(
        "/resolve",
        async ({ body }) => {
          try {
            const result =
              await consolidatedServiceNowService.resolveTicket(body);
            return {
              success: result.success,
              data: result,
              timestamp: new Date().toISOString(),
            };
          } catch (error: unknown) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            };
          }
        },
        {
          body: t.Object({
            table: t.String({ minLength: 1 }),
            sysId: t.String({ minLength: 1 }),
            resolutionCode: t.String({ minLength: 1 }),
            resolutionNotes: t.String({ minLength: 1 }),
            closeCode: t.Optional(t.String()),
          }),
        },
      )

      /**
       * Close ticket with close code and notes
       * POST /tickets/actions/close
       */
      .post(
        "/close",
        async ({ body }) => {
          try {
            const result =
              await consolidatedServiceNowService.closeTicket(body);
            return {
              success: result.success,
              data: result,
              timestamp: new Date().toISOString(),
            };
          } catch (error: unknown) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            };
          }
        },
        {
          body: t.Object({
            table: t.String({ minLength: 1 }),
            sysId: t.String({ minLength: 1 }),
            closeCode: t.String({ minLength: 1 }),
            closeNotes: t.String({ minLength: 1 }),
          }),
        },
      )

      /**
       * Reopen resolved/closed ticket
       * POST /tickets/actions/reopen
       */
      .post(
        "/reopen",
        async ({ body }) => {
          try {
            const result =
              await consolidatedServiceNowService.reopenTicket(body);
            return {
              success: result.success,
              data: result,
              timestamp: new Date().toISOString(),
            };
          } catch (error: unknown) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            };
          }
        },
        {
          body: t.Object({
            table: t.String({ minLength: 1 }),
            sysId: t.String({ minLength: 1 }),
            reopenNotes: t.String({ minLength: 1 }),
            reason: t.String({ minLength: 1 }),
          }),
        },
      )

      /**
       * Assign ticket to user or group
       * POST /tickets/actions/assign
       */
      .post(
        "/assign",
        async ({ body }) => {
          try {
            const result =
              await consolidatedServiceNowService.assignTicket(body);
            return {
              success: result.success,
              data: result,
              timestamp: new Date().toISOString(),
            };
          } catch (error: unknown) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            };
          }
        },
        {
          body: t.Object({
            table: t.String({ minLength: 1 }),
            sysId: t.String({ minLength: 1 }),
            assignedTo: t.Optional(t.String()),
            assignmentGroup: t.Optional(t.String()),
            assignmentNotes: t.Optional(t.String()),
          }),
        },
      )

      /**
       * Update ticket priority
       * POST /tickets/actions/priority
       */
      .post(
        "/priority",
        async ({ body }) => {
          try {
            const result =
              await consolidatedServiceNowService.updatePriority(body);
            return {
              success: result.success,
              data: result,
              timestamp: new Date().toISOString(),
            };
          } catch (error: unknown) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            };
          }
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
        },
      )

      /**
       * Update ticket category
       * POST /tickets/actions/category
       */
      .post(
        "/category",
        async ({ body }) => {
          try {
            const result =
              await consolidatedServiceNowService.updateCategory(body);
            return {
              success: result.success,
              data: result,
              timestamp: new Date().toISOString(),
            };
          } catch (error: unknown) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            };
          }
        },
        {
          body: t.Object({
            table: t.String({ minLength: 1 }),
            sysId: t.String({ minLength: 1 }),
            category: t.String({ minLength: 1 }),
            subcategory: t.Optional(t.String()),
            justification: t.String({ minLength: 1 }),
          }),
        },
      )

      /**
       * Self-assign ticket to current user
       * POST /tickets/actions/self-assign
       */
      .post(
        "/self-assign",
        async ({ body }) => {
          try {
            // In a real implementation, this would get the current user from auth context
            const currentUser = "current.user"; // Placeholder

            const result = await consolidatedServiceNowService.assignTicket({
              table: body.table,
              sysId: body.sysId,
              assignedTo: currentUser,
              assignmentNotes: "Self-assigned via BunSNC interface",
            });

            return {
              success: result.success,
              data: result,
              timestamp: new Date().toISOString(),
            };
          } catch (error: unknown) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            };
          }
        },
        {
          body: t.Object({
            table: t.String({ minLength: 1 }),
            sysId: t.String({ minLength: 1 }),
          }),
        },
      )

      /**
       * Escalate ticket (assign to higher level group)
       * POST /tickets/actions/escalate
       */
      .post(
        "/escalate",
        async ({ body }) => {
          try {
            const result = await consolidatedServiceNowService.assignTicket({
              table: body.table,
              sysId: body.sysId,
              assignmentGroup: body.escalationGroup,
              assignmentNotes: `ESCALATED\nReason: ${body.reason}\n\n${body.notes || "No additional notes provided"}`,
            });

            return {
              success: result.success,
              data: result,
              timestamp: new Date().toISOString(),
            };
          } catch (error: unknown) {
            return {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            };
          }
        },
        {
          body: t.Object({
            table: t.String({ minLength: 1 }),
            sysId: t.String({ minLength: 1 }),
            escalationGroup: t.String({ minLength: 1 }),
            reason: t.String({ minLength: 1 }),
            notes: t.Optional(t.String()),
          }),
        },
      )

      /**
       * Get available resolution codes for a table
       * GET /tickets/actions/resolution-codes/:table
       */
      .get("/resolution-codes/:table", async ({ params: { table } }) => {
        // In a real implementation, this would query ServiceNow for available codes
        const codes = {
          incident: [
            { value: "Solved (Work Around)", label: "Solved (Work Around)" },
            { value: "Solved (Permanently)", label: "Solved (Permanently)" },
            {
              value: "Solved Remotely (Work Around)",
              label: "Solved Remotely (Work Around)",
            },
            {
              value: "Solved Remotely (Permanently)",
              label: "Solved Remotely (Permanently)",
            },
            {
              value: "Not Solved (Not Reproducible)",
              label: "Not Solved (Not Reproducible)",
            },
            {
              value: "Not Solved (Too Costly)",
              label: "Not Solved (Too Costly)",
            },
          ],
          change_task: [
            { value: "Successful", label: "Successful" },
            {
              value: "Successful with Issues",
              label: "Successful with Issues",
            },
            { value: "Unsuccessful", label: "Unsuccessful" },
          ],
          sc_task: [
            { value: "Fulfilled", label: "Fulfilled" },
            { value: "Rejected", label: "Rejected" },
            { value: "Cancelled", label: "Cancelled" },
          ],
        };

        return {
          success: true,
          data: codes[table] || [],
          timestamp: new Date().toISOString(),
        };
      })

      /**
       * Get available close codes for a table
       * GET /tickets/actions/close-codes/:table
       */
      .get("/close-codes/:table", async ({ params: { table } }) => {
        // In a real implementation, this would query ServiceNow for available codes
        const codes = {
          incident: [
            { value: "Solved (Permanently)", label: "Solved (Permanently)" },
            { value: "Solved (Work Around)", label: "Solved (Work Around)" },
            {
              value: "Not Solved (Not Reproducible)",
              label: "Not Solved (Not Reproducible)",
            },
            {
              value: "Not Solved (Too Costly)",
              label: "Not Solved (Too Costly)",
            },
            {
              value: "Closed/Resolved by Caller",
              label: "Closed/Resolved by Caller",
            },
          ],
          change_task: [
            { value: "Successful", label: "Successful" },
            {
              value: "Successful with Issues",
              label: "Successful with Issues",
            },
            { value: "Rolled Back", label: "Rolled Back" },
          ],
          sc_task: [
            { value: "Request Fulfilled", label: "Request Fulfilled" },
            { value: "Request Cancelled", label: "Request Cancelled" },
            { value: "Request Rejected", label: "Request Rejected" },
          ],
        };

        return {
          success: true,
          data: codes[table] || [],
          timestamp: new Date().toISOString(),
        };
      })

      /**
       * Health check for actions service
       * GET /tickets/actions/health
       */
      .get("/health", () => {
        return {
          success: true,
          service: "Ticket Actions Service",
          status: "healthy",
          timestamp: new Date().toISOString(),
        };
      })
  );
};
