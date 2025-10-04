/**
 * Ticket List Routes - Simple Elysia patterns following Development Guidelines
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following guidelines:
 * - Maximum 300-500 lines per file
 * - Simple Elysia endpoint patterns
 * - Extract templates to separate functions
 * - MVC separation of concerns
 */

import { Elysia, t } from "elysia";
import { TicketController } from "../controllers/TicketController";
import { TicketListView } from "../views/TicketListView";
import { ErrorHandler } from "../utils/ErrorHandler";
import type { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";

// FIX v5.5.20: Updated to use context instead of parameters (ElysiaJS best practices)
export function createTicketListRoutes() {
  return (
    new Elysia({ prefix: "/tickets" })
      // Simple lazy load endpoint following Elysia patterns
      .get(
        "/lazy-load/:type/:state",
        async ({ params, query, set, defaultServiceNowClient }) => {
          try {
            const { type, state } = params;
            const { group = "all", page = "1" } = query;

            const ticketController = new TicketController(
              defaultServiceNowClient as ServiceNowAuthClient,
            );
            const tickets = await ticketController.getLazyLoadTickets(
              type,
              state,
              group,
              parseInt(page),
            );

            const htmlContent = TicketListView.generateTicketCards(tickets);

            set.headers["content-type"] = "text/html; charset=utf-8";
            return htmlContent;
          } catch (error: unknown) {
            ErrorHandler.logError("Lazy Load Tickets", error, {
              type: params.type,
              state: params.state,
            });

            const errorHtml = TicketListView.generateErrorCard(
              "Erro ao carregar tickets",
            );
            set.headers["content-type"] = "text/html; charset=utf-8";
            return errorHtml;
          }
        },
        {
          params: t.Object({
            type: t.String({ minLength: 1 }),
            state: t.String({ minLength: 1 }),
          }),
          query: t.Object({
            group: t.Optional(t.String()),
            page: t.Optional(t.String()),
          }),
        },
      )

      // Simple ticket counts endpoint
      .get(
        "/ticket-counts/:type/:state",
        async ({ params, query, serviceNowAuthClient, set }) => {
          try {
            const { type, state } = params;
            const { group = "all" } = query;

            const ticketController = new TicketController(serviceNowClient);
            const count = await ticketController.getTicketCount(
              type,
              state,
              group,
            );

            const htmlContent = TicketListView.generateCountBadge(count);

            set.headers["content-type"] = "text/html; charset=utf-8";
            return htmlContent;
          } catch (error: unknown) {
            ErrorHandler.logError("Ticket Counts", error, {
              type: params.type,
              state: params.state,
            });

            const errorHtml = TicketListView.generateErrorBadge();
            set.headers["content-type"] = "text/html; charset=utf-8";
            return errorHtml;
          }
        },
        {
          params: t.Object({
            type: t.String({ minLength: 1 }),
            state: t.String({ minLength: 1 }),
          }),
          query: t.Object({
            group: t.Optional(t.String()),
          }),
        },
      )
  );
}
