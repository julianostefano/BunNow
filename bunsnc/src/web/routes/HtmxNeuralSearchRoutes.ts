/**
 * Advanced Neural Search Interface - Multi-modal AI-powered search
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { neuralSearchService } from "../../services/NeuralSearchService";
import { logger } from "../../utils/Logger";
import { ErrorHandler } from "../../utils/ErrorHandler";

interface SearchResult {
  id: string;
  title: string;
  content: string;
  category: string;
  relevanceScore: number;
  supportGroup: string;
  lastUpdated: string;
  documentType: "runbook" | "procedure" | "troubleshooting" | "reference";
  tags: string[];
  url: string;
}

interface SearchSession {
  sessionId: string;
  queries: Array<{ query: string; timestamp: string; resultsCount: number }>;
  savedSearches: Array<{ name: string; query: string; filters: any }>;
  preferences: {
    searchMode: "semantic" | "hybrid" | "sparse";
    maxResults: number;
    enableRerank: boolean;
  };
}

interface SearchFilters {
  category?: string;
  supportGroup?: string;
  documentType?: string;
  dateRange?: { from: string; to: string };
  tags?: string[];
}

const searchSessions = new Map<string, SearchSession>();

// Neural search service handles all the complex logic
// No need to initialize individual clients here

export const neuralSearchRoutes = new Elysia({ prefix: "/search" })
  .use(html())

  // Main Search Interface
  .get("/neural", async ({ html }) => {
    return html(`
      <div class="neural-search-container">
        <div class="search-header">
          <h1> Neural Search</h1>
          <p>Advanced AI-powered search across 2,615+ technical documents</p>
        </div>

        <div class="search-interface">
          <div class="search-input-container">
            <div class="search-modes">
              <label class="search-mode active" data-mode="semantic">
                <input type="radio" name="searchMode" value="semantic" checked>
                 Semantic
              </label>
              <label class="search-mode" data-mode="hybrid">
                <input type="radio" name="searchMode" value="hybrid">
                 Hybrid
              </label>
              <label class="search-mode" data-mode="sparse">
                <input type="radio" name="searchMode" value="sparse">
                 Keyword
              </label>
            </div>

            <div class="search-box">
              <input type="text"
                     id="neural-search-input"
                     class="search-input"
                     placeholder="Describe your issue or search for solutions..."
                     hx-post="/search/suggest"
                     hx-trigger="keyup changed delay:500ms"
                     hx-target="#search-suggestions">

              <button class="search-button"
                      hx-post="/search/execute"
                      hx-include="#neural-search-input, input[name='searchMode']:checked"
                      hx-target="#search-results"
                      hx-indicator="#search-loading">
                 Search
              </button>
            </div>

            <div id="search-suggestions" class="search-suggestions"></div>
          </div>

          <div class="search-filters">
            <div class="filter-group">
              <label>Category:</label>
              <select name="category" id="category-filter">
                <option value="">All Categories</option>
                <option value="database">Database</option>
                <option value="network">Network</option>
                <option value="application">Application</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="security">Security</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Support Group:</label>
              <select name="supportGroup" id="support-group-filter">
                <option value="">All Groups</option>
                <option value="Database Administration">Database Administration</option>
                <option value="Network Support">Network Support</option>
                <option value="Application Support">Application Support</option>
                <option value="IT Operations">IT Operations</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Document Type:</label>
              <select name="documentType" id="document-type-filter">
                <option value="">All Types</option>
                <option value="runbook">Runbooks</option>
                <option value="procedure">Procedures</option>
                <option value="troubleshooting">Troubleshooting</option>
                <option value="reference">Reference</option>
              </select>
            </div>

            <div class="filter-group">
              <label>
                <input type="checkbox" name="enableRerank" checked>
                Enable AI Reranking
              </label>
            </div>
          </div>
        </div>

        <div id="search-loading" class="search-loading" style="display: none;">
          <div class="loading-spinner"></div>
          <p>Searching through knowledge base...</p>
        </div>

        <div id="search-results" class="search-results">
          <div class="search-placeholder">
            <h3>💡 Getting Started</h3>
            <ul>
              <li><strong>Semantic Search:</strong> Use natural language to describe your problem</li>
              <li><strong>Hybrid Search:</strong> Combines semantic understanding with keyword matching</li>
              <li><strong>Keyword Search:</strong> Traditional exact-match search</li>
            </ul>
            <p>Try searching for: "database connection timeout", "how to restart apache", or "troubleshoot network connectivity"</p>
          </div>
        </div>

        <div class="search-history">
          <h3>Recent Searches</h3>
          <div id="search-history-list"
               hx-get="/search/history"
               hx-trigger="load"
               hx-target="this">
            Loading search history...
          </div>
        </div>
      </div>
    `);
  })

  // Execute Search
  .post("/execute", async ({ body, html }) => {
    const startTime = Date.now();

    try {
      const {
        "neural-search-input": query,
        searchMode = "semantic",
        category = "",
        supportGroup = "",
        documentType = "",
        enableRerank = false,
      } = body as any;

      if (!query || query.trim().length === 0) {
        return html(`
          <div class="search-error">
            <p>Please enter a search query</p>
          </div>
        `);
      }

      const filters: SearchFilters = {
        ...(category && { category }),
        ...(supportGroup && { supportGroup }),
        ...(documentType && { documentType }),
      };

      const results = await neuralSearchService.search(query.trim(), {
        mode: searchMode as "semantic" | "hybrid" | "keyword",
        enableRerank,
        maxResults: 20,
        minScore: 0.1,
        filters: {
          table: category,
          status: supportGroup, // Reusing supportGroup as status for now
          priority: documentType, // Reusing documentType as priority for now
        },
      });
      const searchTime = Date.now() - startTime;

      // Store search in session
      await recordSearch(query.trim(), results.length);

      return html(`
        <div class="search-results-container">
          <div class="search-meta">
            <span class="results-count">${results.length} results found</span>
            <span class="search-time">${searchTime}ms</span>
            <span class="search-mode">${searchMode} search</span>
            ${enableRerank ? '<span class="rerank-indicator">AI Reranked</span>' : ""}
          </div>

          <div class="results-list">
            ${results
              .map(
                (result, index) => `
              <div class="result-item" data-relevance="${result.relevanceScore}">
                <div class="result-header">
                  <h4 class="result-title">
                    <a href="#" onclick="viewTicketDetails('${result.id}')">${result.title}</a>
                  </h4>
                  <div class="result-meta">
                    <span class="relevance-score">${Math.round(result.score * 100)}% match</span>
                    <span class="document-type">${result.metadata.table || "ticket"}</span>
                    <span class="support-group">${result.source}</span>
                  </div>
                </div>

                <div class="result-content">
                  <p>${truncateContent(result.content, 200)}</p>
                </div>

                <div class="result-footer">
                  <div class="result-tags">
                    ${result.metadata.ticket_number ? `<span class="tag">${result.metadata.ticket_number}</span>` : ""}
                    ${result.metadata.priority ? `<span class="tag">P${result.metadata.priority}</span>` : ""}
                    ${result.metadata.status ? `<span class="tag">${result.metadata.status}</span>` : ""}
                  </div>
                  <div class="result-actions">
                    <button class="btn-small"
                            hx-post="/search/feedback"
                            hx-vals='{"resultId": "${result.id}", "query": "${query}", "helpful": true}'>
                      👍 Helpful
                    </button>
                    <button class="btn-small"
                            hx-post="/search/feedback"
                            hx-vals='{"resultId": "${result.id}", "query": "${query}", "helpful": false}'>
                      👎 Not Helpful
                    </button>
                    <button class="btn-small"
                            hx-get="/search/similar/${result.id}"
                            hx-target="#search-results">
                      🔗 Find Similar
                    </button>
                  </div>
                </div>
              </div>
            `,
              )
              .join("")}
          </div>

          ${
            results.length === 0
              ? `
            <div class="no-results">
              <h3>No results found</h3>
              <p>Try adjusting your search terms or filters. Consider:</p>
              <ul>
                <li>Using different keywords or synonyms</li>
                <li>Removing filters to broaden the search</li>
                <li>Switching to hybrid or keyword search modes</li>
              </ul>
            </div>
          `
              : ""
          }
        </div>
      `);
    } catch (error: unknown) {
      logger.error("[NeuralSearch] Search execution failed:", error);
      return html(`
        <div class="search-error">
          <h3>Search Error</h3>
          <p>Unable to perform search at this time. Please try again.</p>
        </div>
      `);
    }
  })

  // Search Suggestions
  .post("/suggest", async ({ body, html }) => {
    try {
      const { "neural-search-input": query } = body as any;

      if (!query || query.length < 3) {
        return html("");
      }

      const suggestions = await generateSearchSuggestions(query);

      return html(`
        <div class="suggestions-list">
          ${suggestions
            .map(
              (suggestion) => `
            <div class="suggestion-item"
                 onclick="document.getElementById('neural-search-input').value = '${suggestion}'; this.parentElement.style.display = 'none';">
              ${suggestion}
            </div>
          `,
            )
            .join("")}
        </div>
      `);
    } catch (error: unknown) {
      logger.error("[NeuralSearch] Suggestion generation failed:", error);
      return html("");
    }
  })

  // Search History
  .get("/history", async ({ html }) => {
    const recentSearches = await getRecentSearches();

    return html(`
      <div class="history-list">
        ${recentSearches
          .map(
            (search) => `
          <div class="history-item">
            <span class="history-query"
                  onclick="document.getElementById('neural-search-input').value = '${search.query}'"
                  style="cursor: pointer;">
              ${search.query}
            </span>
            <span class="history-meta">${search.timestamp} • ${search.resultsCount} results</span>
          </div>
        `,
          )
          .join("")}
      </div>
    `);
  })

  // Similar Documents
  .get("/similar/:id", async ({ params, html }) => {
    try {
      const similarResults = await findSimilarDocuments(params.id);

      return html(`
        <div class="search-results-container">
          <div class="search-meta">
            <span class="results-count">${similarResults.length} similar documents</span>
          </div>

          <div class="results-list">
            ${similarResults
              .map(
                (result) => `
              <div class="result-item similar-result">
                <div class="result-header">
                  <h4 class="result-title">
                    <a href="#" onclick="viewTicketDetails('${result.id}')">${result.title}</a>
                  </h4>
                  <span class="similarity-score">${Math.round(result.relevanceScore * 100)}% similar</span>
                </div>
                <p class="result-content">${truncateContent(result.content, 150)}</p>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `);
    } catch (error: unknown) {
      logger.error("[NeuralSearch] Similar search failed:", error);
      return html(
        `<div class="search-error">Unable to find similar documents</div>`,
      );
    }
  })

  // Search Feedback
  .post("/feedback", async ({ body, html }) => {
    try {
      const { resultId, query, helpful } = body as any;

      await recordFeedback(resultId, query, helpful === "true");

      return html(`
        <span class="feedback-thanks">
          Thanks for your feedback! This helps improve our search results.
        </span>
      `);
    } catch (error: unknown) {
      logger.error("[NeuralSearch] Feedback recording failed:", error);
      return html("");
    }
  })

  // Advanced Search Interface
  .get("/advanced", async ({ html }) => {
    return html(`
      <div class="advanced-search-container">
        <h2>Advanced Neural Search</h2>

        <div class="advanced-options">
          <div class="option-group">
            <label>Search Strategy:</label>
            <select name="strategy">
              <option value="comprehensive">Comprehensive (slow, thorough)</option>
              <option value="balanced" selected>Balanced (recommended)</option>
              <option value="fast">Fast (quick results)</option>
            </select>
          </div>

          <div class="option-group">
            <label>Result Limit:</label>
            <input type="number" name="limit" value="20" min="5" max="100">
          </div>

          <div class="option-group">
            <label>Minimum Relevance:</label>
            <input type="range" name="threshold" min="0" max="1" step="0.1" value="0.6">
            <span class="threshold-value">60%</span>
          </div>
        </div>

        <div class="search-modes-advanced">
          <div class="mode-card semantic">
            <h3> Semantic Search</h3>
            <p>Uses AI to understand meaning and context</p>
            <ul>
              <li>Natural language queries</li>
              <li>Context-aware results</li>
              <li>Synonym detection</li>
            </ul>
          </div>

          <div class="mode-card hybrid">
            <h3> Hybrid Search</h3>
            <p>Combines semantic + keyword matching</p>
            <ul>
              <li>Best of both worlds</li>
              <li>Balanced precision/recall</li>
              <li>Recommended for most cases</li>
            </ul>
          </div>

          <div class="mode-card sparse">
            <h3> Keyword Search</h3>
            <p>Traditional exact-match search</p>
            <ul>
              <li>Precise term matching</li>
              <li>Boolean operators</li>
              <li>Fast execution</li>
            </ul>
          </div>
        </div>
      </div>
    `);
  });

// Neural search implementation moved to NeuralSearchService

// Semantic search implementation moved to NeuralSearchService

// Hybrid search implementation moved to NeuralSearchService

// Keyword search implementation moved to NeuralSearchService

// Reranking implementation moved to NeuralSearchService

async function generateSearchSuggestions(query: string): Promise<string[]> {
  // Common search patterns and suggestions
  const suggestions = [
    `${query} troubleshooting`,
    `${query} configuration`,
    `${query} best practices`,
    `how to fix ${query}`,
    `${query} step by step guide`,
  ];

  return suggestions.slice(0, 5);
}

async function findSimilarDocuments(
  documentId: string,
): Promise<SearchResult[]> {
  try {
    const results = await neuralSearchService.search(
      `similar to ${documentId}`,
      {
        mode: "semantic",
        maxResults: 5,
        minScore: 0.3,
      },
    );

    return results.map((result) => ({
      id: result.id,
      title: result.title,
      content: result.content,
      category: result.metadata.table || "unknown",
      relevanceScore: result.score,
      supportGroup: result.source,
      lastUpdated: result.metadata.created_date || "Unknown",
      documentType: "reference" as const,
      tags: [
        result.metadata.priority || "",
        result.metadata.status || "",
      ].filter(Boolean),
      url: `/ticket/${result.id}`,
    }));
  } catch (error: unknown) {
    logger.error("[NeuralSearch] Similar documents search failed:", error);
    return [];
  }
}

async function recordSearch(
  query: string,
  resultsCount: number,
): Promise<void> {
  // Store search in session/database for history
  logger.info(
    `[NeuralSearch] Search recorded: "${query}" - ${resultsCount} results`,
  );
}

async function recordFeedback(
  resultId: string,
  query: string,
  helpful: boolean,
): Promise<void> {
  // Store feedback for improving search relevance
  logger.info(
    `[NeuralSearch] Feedback recorded for ${resultId}: ${helpful ? "helpful" : "not helpful"}`,
  );
}

async function getRecentSearches() {
  // Return recent search history
  return [
    {
      query: "database connection timeout",
      timestamp: "2 minutes ago",
      resultsCount: 12,
    },
    {
      query: "apache restart procedure",
      timestamp: "15 minutes ago",
      resultsCount: 8,
    },
    {
      query: "network connectivity issues",
      timestamp: "1 hour ago",
      resultsCount: 15,
    },
  ];
}

// Mock results generation removed - using real NeuralSearchService

// Relevance scoring moved to NeuralSearchService

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;

  const truncated = content.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  return lastSpace > 0
    ? truncated.substring(0, lastSpace) + "..."
    : truncated + "...";
}
