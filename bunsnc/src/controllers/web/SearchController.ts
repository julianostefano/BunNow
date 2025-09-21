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

/**
 * Detect ticket type from number format
 */
function detectTicketType(ticketNumber: string): string | null {
  const upperNumber = ticketNumber.toUpperCase();

  if (upperNumber.startsWith("INC")) return "incident";
  if (upperNumber.startsWith("CTASK")) return "change_task";
  if (upperNumber.startsWith("SCTASK")) return "sc_task";

  return null;
}

/**
 * Build search filter based on query
 */
function buildSearchFilter(searchQuery: SearchQuery): string {
  const { query } = searchQuery;

  // Check if query looks like a ticket number
  const ticketType = detectTicketType(query);
  if (ticketType) {
    return `number=${query}`;
  }

  // Check if query is numeric (could be sys_id)
  if (/^[a-f0-9]{32}$/i.test(query)) {
    return `sys_id=${query}`;
  }

  // General text search across multiple fields
  return `short_descriptionLIKE${query}^ORdescriptionLIKE${query}^ORnumberLIKE${query}`;
}

/**
 * Mock search function - replace with actual ServiceNow API call
 * TODO: Integrate with ConsolidatedDataService when circular dependency is resolved
 */
async function performSearch(
  searchQuery: SearchQuery,
): Promise<SearchResult[]> {
  try {
    // This would normally call the ServiceNow API through ConsolidatedDataService
    // For now, return mock data to avoid circular dependency

    console.log(` Searching for: "${searchQuery.query}"`);
    const filter = buildSearchFilter(searchQuery);
    console.log(` Search filter: ${filter}`);

    // Mock results - replace with actual API call
    const mockResults: SearchResult[] = [];

    // If searching for specific ticket number, return focused results
    const ticketType = detectTicketType(searchQuery.query);
    if (ticketType) {
      mockResults.push({
        sys_id: "mock-sys-id-" + Date.now(),
        number: searchQuery.query.toUpperCase(),
        short_description: `Mock ticket for ${searchQuery.query}`,
        state: "in_progress",
        assigned_to: "System User",
        created_on: new Date().toISOString(),
        table: ticketType,
        priority: "3",
        urgency: "3",
      });
    }

    return mockResults;
  } catch (error) {
    console.error("Search error:", error);
    throw new Error(`Search failed: ${error.message}`);
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

    // Perform search
    const results = await performSearch(searchQuery);

    // Generate results HTML
    return generateSearchResultsHTML(results, searchQuery.query);
  } catch (error: unknown) {
    console.error("Error in search handler:", error);
    const query = context.query?.query || "unknown";
    return generateSearchErrorHTML(error.message, query);
  }
}
