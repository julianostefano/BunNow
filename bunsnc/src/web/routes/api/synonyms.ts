/**
 * Synonyms API Routes - Test and manage synonym functionality
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { synonymService } from "../../../services/SynonymService";
import { ticketSearchService } from "../../../services/TicketSearchService";
import { ErrorHandler } from "../../../utils/ErrorHandler";

export const synonymsApiRoutes = new Elysia({ prefix: "/api/synonyms" })
  /**
   * Get synonym expansion for a query
   */
  .get("/expand", async ({ query }) => {
    try {
      const { q: searchQuery, max = "5", categories } = query as any;

      if (!searchQuery) {
        return { error: "Query parameter 'q' is required" };
      }

      const maxExpansions = parseInt(max.toString()) || 5;
      const categoryFilter = categories
        ? categories.split(",").map((c: string) => c.trim())
        : ["technical", "status", "priority", "general"];

      const expansion = synonymService.expandQuery(searchQuery, {
        maxExpansions,
        includeCategories: categoryFilter,
        minScore: 0.7,
      });

      return {
        success: true,
        data: expansion,
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymsAPI.expand", error);
      return {
        success: false,
        error: ErrorHandler.getErrorMessage(error),
      };
    }
  })

  /**
   * Get search suggestions for autocomplete
   */
  .get("/suggestions", async ({ query }) => {
    try {
      const { q: partialQuery, limit = "10" } = query as any;

      if (!partialQuery) {
        return { error: "Query parameter 'q' is required" };
      }

      const maxSuggestions = parseInt(limit.toString()) || 10;
      const suggestions = synonymService.getAutocompleteSuggestions(
        partialQuery,
        maxSuggestions,
      );

      return {
        success: true,
        data: {
          query: partialQuery,
          suggestions,
        },
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymsAPI.suggestions", error);
      return {
        success: false,
        error: ErrorHandler.getErrorMessage(error),
      };
    }
  })

  /**
   * Get specific synonyms for a term
   */
  .get("/term/:term", async ({ params }) => {
    try {
      const { term } = params;
      const synonyms = synonymService.getSynonyms(term);

      return {
        success: true,
        data: {
          term,
          synonyms,
        },
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymsAPI.term", error);
      return {
        success: false,
        error: ErrorHandler.getErrorMessage(error),
      };
    }
  })

  /**
   * Test search with and without synonym expansion
   */
  .get("/test-search", async ({ query }) => {
    try {
      const { q: searchQuery, limit = "5" } = query as any;

      if (!searchQuery) {
        return { error: "Query parameter 'q' is required" };
      }

      const searchLimit = parseInt(limit.toString()) || 5;

      // Search without synonyms
      const basicResults = await ticketSearchService.searchTickets(
        { query: searchQuery, limit: searchLimit },
        {},
        { enableSynonymExpansion: false },
      );

      // Search with synonyms
      const expandedResults = await ticketSearchService.searchWithSynonyms({
        query: searchQuery,
        limit: searchLimit,
      });

      // Get synonym expansion info
      const expansion = synonymService.expandQuery(searchQuery, {
        maxExpansions: 5,
        includeCategories: ["technical", "status", "priority", "general"],
      });

      return {
        success: true,
        data: {
          originalQuery: searchQuery,
          expansion,
          results: {
            basic: {
              count: basicResults.length,
              tickets: basicResults,
            },
            expanded: {
              count: expandedResults.length,
              tickets: expandedResults,
            },
          },
        },
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymsAPI.testSearch", error);
      return {
        success: false,
        error: ErrorHandler.getErrorMessage(error),
      };
    }
  })

  /**
   * Get synonym service health status
   */
  .get("/health", async () => {
    try {
      const synonymHealth = synonymService.getHealthStatus();
      const searchHealth = await ticketSearchService.getHealthStatus();

      return {
        success: true,
        data: {
          synonymService: synonymHealth,
          searchService: {
            healthy: searchHealth.healthy,
            message: searchHealth.message,
            totalTickets: Object.values(searchHealth.collections).reduce(
              (sum, count) => sum + count,
              0,
            ),
          },
        },
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymsAPI.health", error);
      return {
        success: false,
        error: ErrorHandler.getErrorMessage(error),
      };
    }
  })

  /**
   * Add custom synonym group (for testing)
   */
  .post("/custom", async ({ body }) => {
    try {
      const {
        primary,
        synonyms,
        category = "general",
        score = 0.8,
      } = body as any;

      if (!primary || !synonyms || !Array.isArray(synonyms)) {
        return {
          error:
            "Required fields: primary (string), synonyms (array), optional: category, score",
        };
      }

      synonymService.addSynonymGroup({
        primary,
        synonyms,
        category,
        score,
      });

      return {
        success: true,
        data: {
          message: `Added synonym group for '${primary}' with ${synonyms.length} synonyms`,
          group: { primary, synonyms, category, score },
        },
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymsAPI.custom", error);
      return {
        success: false,
        error: ErrorHandler.getErrorMessage(error),
      };
    }
  })

  /**
   * Reload synonym database
   */
  .post("/reload", async () => {
    try {
      synonymService.reload();
      const health = synonymService.getHealthStatus();

      return {
        success: true,
        data: {
          message: "Synonym database reloaded successfully",
          health,
        },
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymsAPI.reload", error);
      return {
        success: false,
        error: ErrorHandler.getErrorMessage(error),
      };
    }
  });
