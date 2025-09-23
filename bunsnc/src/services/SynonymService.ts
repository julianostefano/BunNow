/**
 * Synonym Service - Technical terminology mapping and query expansion
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from "../utils/Logger";
import { ErrorHandler } from "../utils/ErrorHandler";

export interface SynonymGroup {
  primary: string;
  synonyms: string[];
  category: "technical" | "status" | "priority" | "general";
  score: number; // Relevance score for ranking
}

export interface QueryExpansion {
  originalQuery: string;
  expandedTerms: string[];
  suggestions: string[];
  synonymGroups: SynonymGroup[];
}

export class SynonymService {
  private synonymDatabase: Map<string, SynonymGroup[]> = new Map();
  private initialized = false;

  constructor() {
    this.initializeSynonyms();
  }

  private initializeSynonyms(): void {
    try {
      // Technical terms and common ServiceNow terminology
      const synonymGroups: SynonymGroup[] = [
        // Database related
        {
          primary: "database",
          synonyms: [
            "db",
            "banco",
            "bd",
            "banco de dados",
            "database",
            "postgresql",
            "mysql",
            "oracle",
            "sql",
          ],
          category: "technical",
          score: 0.9,
        },
        {
          primary: "connection",
          synonyms: [
            "conexão",
            "conectar",
            "connect",
            "ligação",
            "link",
            "acesso",
            "access",
          ],
          category: "technical",
          score: 0.85,
        },

        // Network related
        {
          primary: "network",
          synonyms: [
            "rede",
            "net",
            "networking",
            "conectividade",
            "connectivity",
          ],
          category: "technical",
          score: 0.9,
        },
        {
          primary: "timeout",
          synonyms: [
            "tempo limite",
            "expirou",
            "expired",
            "time out",
            "hanging",
          ],
          category: "technical",
          score: 0.8,
        },

        // Application related
        {
          primary: "application",
          synonyms: [
            "app",
            "aplicação",
            "aplicativo",
            "sistema",
            "system",
            "software",
          ],
          category: "technical",
          score: 0.85,
        },
        {
          primary: "server",
          synonyms: ["servidor", "host", "máquina", "machine", "service"],
          category: "technical",
          score: 0.9,
        },

        // ServiceNow specific statuses
        {
          primary: "open",
          synonyms: ["aberto", "novo", "new", "ativo", "active"],
          category: "status",
          score: 0.95,
        },
        {
          primary: "in_progress",
          synonyms: [
            "em andamento",
            "work in progress",
            "wip",
            "working",
            "trabalhando",
          ],
          category: "status",
          score: 0.95,
        },
        {
          primary: "resolved",
          synonyms: ["resolvido", "solucionado", "fixed", "corrigido", "done"],
          category: "status",
          score: 0.95,
        },
        {
          primary: "closed",
          synonyms: ["fechado", "finalizado", "completed", "terminado"],
          category: "status",
          score: 0.95,
        },

        // Priority levels
        {
          primary: "critical",
          synonyms: [
            "crítico",
            "crítica",
            "urgent",
            "urgente",
            "high",
            "alta",
            "emergency",
          ],
          category: "priority",
          score: 0.9,
        },
        {
          primary: "high",
          synonyms: ["alta", "alto", "importante", "important", "urgent"],
          category: "priority",
          score: 0.85,
        },
        {
          primary: "medium",
          synonyms: ["média", "médio", "moderate", "moderado", "normal"],
          category: "priority",
          score: 0.8,
        },
        {
          primary: "low",
          synonyms: ["baixa", "baixo", "minor", "menor", "trivial"],
          category: "priority",
          score: 0.75,
        },

        // Common issues
        {
          primary: "error",
          synonyms: [
            "erro",
            "falha",
            "failure",
            "problem",
            "problema",
            "issue",
          ],
          category: "general",
          score: 0.8,
        },
        {
          primary: "crash",
          synonyms: [
            "travou",
            "parou",
            "stopped",
            "freeze",
            "congelou",
            "broke",
          ],
          category: "general",
          score: 0.8,
        },
        {
          primary: "slow",
          synonyms: [
            "lento",
            "devagar",
            "performance",
            "lag",
            "delay",
            "demorado",
          ],
          category: "general",
          score: 0.75,
        },

        // Actions
        {
          primary: "restart",
          synonyms: ["reiniciar", "reboot", "reset", "recomeçar", "reload"],
          category: "general",
          score: 0.85,
        },
        {
          primary: "install",
          synonyms: ["instalar", "setup", "configurar", "configure", "deploy"],
          category: "general",
          score: 0.8,
        },
        {
          primary: "update",
          synonyms: ["atualizar", "upgrade", "patch", "fix", "corrigir"],
          category: "general",
          score: 0.8,
        },

        // ServiceNow ticket types
        {
          primary: "incident",
          synonyms: ["incidente", "inc", "issue", "problema", "falha"],
          category: "technical",
          score: 0.95,
        },
        {
          primary: "change",
          synonyms: ["mudança", "alteração", "modification", "modify", "chg"],
          category: "technical",
          score: 0.9,
        },
        {
          primary: "request",
          synonyms: [
            "solicitação",
            "pedido",
            "req",
            "requisição",
            "service catalog",
          ],
          category: "technical",
          score: 0.9,
        },
      ];

      // Build search index
      for (const group of synonymGroups) {
        // Index by primary term
        this.addToIndex(group.primary.toLowerCase(), group);

        // Index by all synonyms
        for (const synonym of group.synonyms) {
          this.addToIndex(synonym.toLowerCase(), group);
        }
      }

      this.initialized = true;
      logger.info(
        `🔤 [SynonymService] Initialized with ${synonymGroups.length} synonym groups`,
      );
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymService.initializeSynonyms", error);
    }
  }

  private addToIndex(term: string, group: SynonymGroup): void {
    const existing = this.synonymDatabase.get(term) || [];
    existing.push(group);
    this.synonymDatabase.set(term, existing);
  }

  /**
   * Expand a search query with synonyms and related terms
   */
  expandQuery(
    query: string,
    options: {
      maxExpansions?: number;
      includeCategories?: Array<
        "technical" | "status" | "priority" | "general"
      >;
      minScore?: number;
    } = {},
  ): QueryExpansion {
    try {
      const {
        maxExpansions = 10,
        includeCategories = ["technical", "status", "priority", "general"],
        minScore = 0.7,
      } = options;

      const originalQuery = query.toLowerCase().trim();
      const words = originalQuery.split(/\s+/);

      const expandedTerms: string[] = [];
      const suggestions: string[] = [];
      const foundGroups: SynonymGroup[] = [];

      // Process each word in the query
      for (const word of words) {
        const matchingGroups = this.synonymDatabase.get(word) || [];

        for (const group of matchingGroups) {
          if (
            group.score >= minScore &&
            includeCategories.includes(group.category)
          ) {
            foundGroups.push(group);

            // Add synonyms to expanded terms
            for (const synonym of group.synonyms) {
              if (synonym !== word && !expandedTerms.includes(synonym)) {
                expandedTerms.push(synonym);
              }
            }
          }
        }
      }

      // Generate suggestions based on partial matches
      this.generateSuggestions(
        originalQuery,
        suggestions,
        maxExpansions,
        includeCategories,
        minScore,
      );

      // Limit expansions
      const limitedExpansions = expandedTerms.slice(0, maxExpansions);
      const limitedSuggestions = suggestions.slice(0, maxExpansions);

      logger.debug(
        `🔤 [SynonymService] Expanded "${query}" to ${limitedExpansions.length} terms`,
      );

      return {
        originalQuery: query,
        expandedTerms: limitedExpansions,
        suggestions: limitedSuggestions,
        synonymGroups: foundGroups,
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymService.expandQuery", error);
      return {
        originalQuery: query,
        expandedTerms: [],
        suggestions: [],
        synonymGroups: [],
      };
    }
  }

  private generateSuggestions(
    query: string,
    suggestions: string[],
    maxSuggestions: number,
    categories: Array<"technical" | "status" | "priority" | "general">,
    minScore: number,
  ): void {
    const queryLower = query.toLowerCase();

    // Find partial matches in primary terms and synonyms
    for (const [term, groups] of this.synonymDatabase) {
      if (term.includes(queryLower) || queryLower.includes(term)) {
        for (const group of groups) {
          if (group.score >= minScore && categories.includes(group.category)) {
            if (
              !suggestions.includes(group.primary) &&
              suggestions.length < maxSuggestions
            ) {
              suggestions.push(group.primary);
            }
          }
        }
      }
    }
  }

  /**
   * Get synonyms for a specific term
   */
  getSynonyms(term: string): string[] {
    const groups = this.synonymDatabase.get(term.toLowerCase()) || [];
    const synonyms = new Set<string>();

    for (const group of groups) {
      for (const synonym of group.synonyms) {
        synonyms.add(synonym);
      }
    }

    return Array.from(synonyms);
  }

  /**
   * Build search query with expanded terms using OR logic
   */
  buildExpandedSearchQuery(
    originalQuery: string,
    maxExpansions: number = 5,
  ): string {
    const expansion = this.expandQuery(originalQuery, { maxExpansions });

    if (expansion.expandedTerms.length === 0) {
      return originalQuery;
    }

    // Combine original query with expanded terms using OR logic
    const allTerms = [
      originalQuery,
      ...expansion.expandedTerms.slice(0, maxExpansions),
    ];
    return allTerms.join(" OR ");
  }

  /**
   * Get related terms for auto-complete functionality
   */
  getAutocompleteSuggestions(
    partialQuery: string,
    limit: number = 10,
  ): string[] {
    const query = partialQuery.toLowerCase().trim();
    const suggestions: string[] = [];

    if (query.length < 2) {
      return suggestions;
    }

    // Find terms that start with the query
    for (const [term, groups] of this.synonymDatabase) {
      if (term.startsWith(query) && suggestions.length < limit) {
        // Use the primary term for suggestions
        const primaryTerm = groups[0]?.primary;
        if (primaryTerm && !suggestions.includes(primaryTerm)) {
          suggestions.push(primaryTerm);
        }
      }
    }

    return suggestions;
  }

  /**
   * Get service health and statistics
   */
  getHealthStatus(): {
    healthy: boolean;
    totalGroups: number;
    totalTerms: number;
    categories: Record<string, number>;
  } {
    try {
      const categories: Record<string, number> = {};
      const uniqueGroups = new Set<string>();

      for (const groups of this.synonymDatabase.values()) {
        for (const group of groups) {
          uniqueGroups.add(group.primary);
          categories[group.category] = (categories[group.category] || 0) + 1;
        }
      }

      return {
        healthy: this.initialized && this.synonymDatabase.size > 0,
        totalGroups: uniqueGroups.size,
        totalTerms: this.synonymDatabase.size,
        categories,
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymService.getHealthStatus", error);
      return {
        healthy: false,
        totalGroups: 0,
        totalTerms: 0,
        categories: {},
      };
    }
  }

  /**
   * Add custom synonym group (for dynamic expansion)
   */
  addSynonymGroup(group: SynonymGroup): void {
    try {
      // Add to index
      this.addToIndex(group.primary.toLowerCase(), group);
      for (const synonym of group.synonyms) {
        this.addToIndex(synonym.toLowerCase(), group);
      }

      logger.info(
        `🔤 [SynonymService] Added custom synonym group: ${group.primary}`,
      );
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("SynonymService.addSynonymGroup", error);
    }
  }

  /**
   * Clear and reload synonym database
   */
  reload(): void {
    this.synonymDatabase.clear();
    this.initialized = false;
    this.initializeSynonyms();
  }
}

// Export singleton instance
export const synonymService = new SynonymService();
