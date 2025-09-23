/**
 * SearchController - Ticket Search Functionality
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Handles ticket search operations across different ServiceNow tables.
 * Provides unified search interface for incidents, change tasks, and service tasks.
 */

import { Context } from "elysia";
import { getUnifiedStatusConfig } from "../../models/StatusConfig";
import { formatSafeDate } from "../../utils/DateFormatters";
import { ticketSearchService } from "../../services/TicketSearchService";
import { ErrorHandler } from "../../utils/ErrorHandler";

/**
 * Interface for search query parameters
 */
interface SearchQuery {
  query: string;
  limit?: number;
  tables?: string[];
}

/**
 * Interface for search result item
 */
interface SearchResult {
  sys_id: string;
  number: string;
  short_description: string;
  state: string;
  assigned_to: string;
  created_on: string;
  table: string;
  priority?: string;
  urgency?: string;
}

/**
 * Validate and parse search query
 */
function parseSearchQuery(queryParams: Record<string, unknown>): SearchQuery {
  const { query } = queryParams;

  if (!query || typeof query !== "string") {
    throw new Error("Query parameter is required");
  }

  const cleanQuery = query.trim();

  if (cleanQuery.length < 2) {
    throw new Error("Search query must be at least 2 characters long");
  }

  return {
    query: cleanQuery,
    limit: 20, // Default limit
    tables: ["incident", "change_task", "sc_task"], // Search all tables by default
  };
}

// Search functionality is now handled by TicketSearchService

/**
 * Real search function using TicketSearchService
 * Searches MongoDB collections directly without circular dependencies
 */
async function performSearch(
  searchQuery: SearchQuery,
  filters?: {
    table?: string;
    state?: string;
    priority?: string;
    assignmentGroup?: string;
  },
): Promise<SearchResult[]> {
  try {
    // Use the TicketSearchService to search MongoDB directly
    const results = await ticketSearchService.searchTickets(
      searchQuery,
      filters,
    );
    return results;
  } catch (error: unknown) {
    ErrorHandler.logUnknownError("SearchController.performSearch", error);
    throw new Error(`Search failed: ${ErrorHandler.getErrorMessage(error)}`);
  }
}

/**
 * Generate search result HTML
 */
function generateSearchResultHTML(result: SearchResult): string {
  const statusConfig = getUnifiedStatusConfig(result.state);
  const formattedDate = formatSafeDate(result.created_on);

  // Get table-specific icon and label
  const tableConfig = {
    incident: {
      icon: "alert-circle",
      label: "Incident",
      color: "text-red-400",
    },
    change_task: {
      icon: "git-branch",
      label: "Change Task",
      color: "text-blue-400",
    },
    sc_task: {
      icon: "shopping-cart",
      label: "Service Task",
      color: "text-green-400",
    },
  };

  const config =
    tableConfig[result.table as keyof typeof tableConfig] ||
    tableConfig.incident;

  return `
    <div class="card-gradient rounded-lg border border-gray-600 p-6 hover:border-gray-500 transition-all duration-300">
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center space-x-3">
          <div class="flex-shrink-0">
            <div class="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
              <i data-lucide="${config.icon}" class="w-5 h-5 ${config.color}"></i>
            </div>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-white hover:text-elysia-blue transition-colors">
              ${result.number}
            </h3>
            <p class="text-sm text-gray-300">${config.label}</p>
          </div>
        </div>
        
        <div class="text-right">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusConfig.bgColor}">
            ${statusConfig.label}
          </span>
          ${
            result.priority && result.priority !== "0"
              ? `
          <div class="mt-1">
            <span class="text-xs text-gray-400">Priority: ${result.priority}</span>
          </div>
          `
              : ""
          }
        </div>
      </div>
      
      <p class="text-gray-300 mb-4 line-clamp-2">${result.short_description}</p>
      
      <div class="flex items-center justify-between text-sm">
        <div class="text-gray-400">
          <span>Assignee: </span>
          <span class="text-gray-300">${result.assigned_to || "Unassigned"}</span>
        </div>
        
        <div class="flex items-center space-x-4">
          <span class="text-gray-400">${formattedDate}</span>
          
          <button onclick="showTicketDetails('${result.sys_id}', '${result.table}')"
                  class="px-4 py-2 bg-elysia-blue text-white text-sm rounded-lg hover:bg-elysia-blue-dark transition-colors">
            <i data-lucide="eye" class="w-4 h-4 inline mr-2"></i>
            Ver Detalhes
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate search results container HTML
 */
function generateSearchResultsHTML(
  results: SearchResult[],
  query: string,
): string {
  if (results.length === 0) {
    return `
      <div class="text-center py-12 text-gray-400">
        <i data-lucide="search-x" class="w-16 h-16 mx-auto mb-4 text-gray-500"></i>
        <h3 class="text-lg font-medium text-gray-300 mb-2">Nenhum resultado encontrado</h3>
        <p class="text-gray-400 mb-4">
          Não encontramos tickets correspondentes à busca por <strong>"${query}"</strong>
        </p>
        <div class="text-sm text-gray-500">
          <p class="mb-2">Dicas de busca:</p>
          <ul class="text-left inline-block space-y-1">
            <li>• Use números completos de ticket (INC0012345, SCTASK0067890)</li>
            <li>• Tente palavras-chave diferentes</li>
            <li>• Verifique a ortografia</li>
          </ul>
        </div>
      </div>
    `;
  }

  const resultsHTML = results
    .map((result) => generateSearchResultHTML(result))
    .join("\n");

  return `
    <div class="mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-white">
          Resultados da busca por "${query}"
        </h3>
        <span class="text-sm text-gray-400">
          ${results.length} resultado${results.length !== 1 ? "s" : ""} encontrado${results.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
    
    <div class="space-y-4">
      ${resultsHTML}
    </div>
  `;
}

/**
 * Generate search error HTML
 */
function generateSearchErrorHTML(error: string, query: string): string {
  return `
    <div class="text-center py-12">
      <i data-lucide="alert-triangle" class="w-16 h-16 mx-auto mb-4 text-red-400"></i>
      <h3 class="text-lg font-medium text-red-400 mb-2">Erro na busca</h3>
      <p class="text-red-300 mb-4">
        Não foi possível realizar a busca por "${query}"
      </p>
      <p class="text-sm text-gray-400 mb-4">${error}</p>
      <button onclick="htmx.ajax('GET', '/clean/search?query=${encodeURIComponent(query)}', {target: '#search-results'})" 
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
        <i data-lucide="refresh-cw" class="w-4 h-4 inline mr-2"></i>
        Tentar Novamente
      </button>
    </div>
  `;
}

/**
 * Generate "too short" query HTML
 */
function generateTooShortQueryHTML(): string {
  return `
    <div class="text-center py-12 text-gray-400">
      <i data-lucide="type" class="w-16 h-16 mx-auto mb-4 text-gray-500"></i>
      <p class="text-lg">Digite pelo menos 2 caracteres para buscar</p>
      <p class="text-sm mt-2 text-gray-500">
        Exemplos: <span class="font-mono text-elysia-cyan">INC001</span>, 
        <span class="font-mono text-elysia-cyan">falha</span>, 
        <span class="font-mono text-elysia-cyan">rede</span>
      </p>
    </div>
  `;
}

/**
 * Search endpoint handler
 */
export async function handleSearchRequest(context: Context): Promise<string> {
  try {
    const queryParams = context.query;

    // Handle empty or too short queries
    if (!queryParams.query || queryParams.query.trim().length < 2) {
      return generateTooShortQueryHTML();
    }

    // Parse and validate query
    const searchQuery = parseSearchQuery(queryParams);

    // Extract additional filters from query params
    const filters = {
      table: queryParams.table as string,
      state: queryParams.state as string,
      priority: queryParams.priority as string,
      assignmentGroup: queryParams.assignmentGroup as string,
    };

    // Remove undefined values
    Object.keys(filters).forEach((key) => {
      if (!filters[key as keyof typeof filters]) {
        delete filters[key as keyof typeof filters];
      }
    });

    // Perform search
    const results = await performSearch(searchQuery, filters);

    // Generate results HTML
    return generateSearchResultsHTML(results, searchQuery.query);
  } catch (error: unknown) {
    ErrorHandler.logUnknownError("SearchController.handleSearchRequest", error);
    const query = context.query?.query || "unknown";
    return generateSearchErrorHTML(ErrorHandler.getErrorMessage(error), query);
  }
}
