/**
 * Ticket Analysis AI Controller
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from "../../utils/Logger";
import { AIServiceManager } from "../../services/ai/AIServiceManager";
import { ServiceNowAuthClient } from "../../services/ServiceNowAuthClient";
import { TikaClient } from "../../clients/TikaClient";
import { EmbeddingClient } from "../../clients/EmbeddingClient";
import { RerankClient } from "../../clients/RerankClient";
import { LLMClient } from "../../clients/LLMClient";
import { OpenSearchClient } from "../../clients/OpenSearchClient";
import type {
  AIRequest,
  AIResponse,
  TicketAnalysisRequest,
  TicketAnalysisResponse,
  TicketPrediction,
  SimilarTicketResult,
} from "../../types/AI";

export interface TicketAnalysisConfig {
  similarity_threshold: number;
  max_similar_tickets: number;
  enable_priority_prediction: boolean;
  enable_category_prediction: boolean;
  enable_assignment_prediction: boolean;
  search_types: string[];
}

export class TicketAnalysisController {
  private serviceNow: ServiceNowAuthClient;
  private aiManager: AIServiceManager;
  private openSearch: OpenSearchClient;
  private embedding: EmbeddingClient;
  private rerank: RerankClient;
  private llm: LLMClient;
  private tika: TikaClient;
  private config: TicketAnalysisConfig;

  constructor() {
    try {
      this.serviceNow = new ServiceNowAuthClient();
      this.aiManager = AIServiceManager.getInstance();

      // Validate OpenSearch environment variables
      const openSearchHost = process.env.OPENSEARCH_HOST;
      const openSearchPort = process.env.OPENSEARCH_PORT;

      if (!openSearchHost || !openSearchPort) {
        logger.warn(
          `⚠️ [TicketAnalysisController] OpenSearch environment variables missing. Using defaults: host=${openSearchHost || "10.219.8.210"}, port=${openSearchPort || "9200"}`,
        );
      }

      this.openSearch = new OpenSearchClient({
        host: openSearchHost || "10.219.8.210",
        port: parseInt(openSearchPort || "9200"),
        ssl: false,
        timeout: 30000,
      });

      this.embedding = new EmbeddingClient();
      this.rerank = new RerankClient();
      this.llm = new LLMClient();
      this.tika = new TikaClient();
    } catch (error) {
      logger.error(
        `❌ [TicketAnalysisController] Failed to initialize: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    }

    this.config = {
      similarity_threshold: 0.75,
      max_similar_tickets: 10,
      enable_priority_prediction: true,
      enable_category_prediction: true,
      enable_assignment_prediction: true,
      search_types: ["hybrid", "semantic", "neural_sparse"],
    };
  }

  async analyzeTicket(
    request: TicketAnalysisRequest,
  ): Promise<TicketAnalysisResponse> {
    const startTime = Date.now();

    try {
      logger.info(
        ` [TicketAnalysis] Starting analysis for ticket: ${request.ticket_number || "new"}`,
      );

      // 1. Extract and enhance ticket content
      const enhancedContent = await this.enhanceTicketContent(request);

      // 2. Generate embeddings for similarity search
      const embeddings = await this.embedding.generateEmbeddings([
        enhancedContent.description,
        enhancedContent.short_description || "",
      ]);

      // 3. Find similar tickets
      const similarTickets = await this.findSimilarTickets(
        enhancedContent.description,
        embeddings.data.embeddings[0],
      );

      // 4. Predict ticket properties
      const predictions = await this.generatePredictions(
        enhancedContent,
        similarTickets,
      );

      // 5. Generate AI recommendations
      const recommendations = await this.generateRecommendations(
        enhancedContent,
        similarTickets,
        predictions,
      );

      const response: TicketAnalysisResponse = {
        ticket_id: request.ticket_id,
        ticket_number: request.ticket_number,
        analysis: {
          enhanced_content: enhancedContent,
          similar_tickets: similarTickets,
          predictions,
          recommendations,
          confidence_score: this.calculateConfidenceScore(
            similarTickets,
            predictions,
          ),
          processing_time_ms: Date.now() - startTime,
        },
        metadata: {
          model_versions: await this.getModelVersions(),
          search_strategy: "hybrid_reranked",
          timestamp: new Date().toISOString(),
        },
      };

      logger.info(
        ` [TicketAnalysis] Completed analysis in ${response.analysis.processing_time_ms}ms`,
      );
      return response;
    } catch (error) {
      logger.error(" [TicketAnalysis] Analysis failed:", error);
      throw error;
    }
  }

  private async enhanceTicketContent(
    request: TicketAnalysisRequest,
  ): Promise<any> {
    const content = {
      description: request.description,
      short_description: request.short_description,
      category: request.category,
      subcategory: request.subcategory,
      priority: request.priority,
      urgency: request.urgency,
      impact: request.impact,
      caller_id: request.caller_id,
      assignment_group: request.assignment_group,
      attachments: request.attachments || [],
    };

    // Process attachments with Tika if present
    if (content.attachments.length > 0) {
      logger.info(
        `📎 [TicketAnalysis] Processing ${content.attachments.length} attachments`,
      );

      const attachmentTexts: string[] = [];
      for (const attachment of content.attachments) {
        try {
          if (attachment.content_buffer) {
            const extractedText = await this.tika.extractText(
              Buffer.from(attachment.content_buffer),
              attachment.content_type,
            );
            attachmentTexts.push(`[${attachment.file_name}]: ${extractedText}`);
          }
        } catch (error) {
          logger.warn(
            ` [TicketAnalysis] Failed to extract text from ${attachment.file_name}:`,
            error,
          );
        }
      }

      if (attachmentTexts.length > 0) {
        content.description = `${content.description}\n\nAttachment Content:\n${attachmentTexts.join("\n\n")}`;
      }
    }

    return content;
  }

  private async findSimilarTickets(
    description: string,
    embedding: number[],
  ): Promise<SimilarTicketResult[]> {
    try {
      // 1. Semantic search using embeddings
      const semanticResults = await this.openSearch.neuralSearch({
        index: "servicenow_tickets",
        query_vector: embedding,
        k: this.config.max_similar_tickets * 2,
        min_score: this.config.similarity_threshold,
      });

      // 2. Hybrid search combining BM25 and semantic
      const hybridResults = await this.openSearch.hybridSearch({
        index: "servicenow_tickets",
        query_text: description,
        query_vector: embedding,
        size: this.config.max_similar_tickets * 2,
        weights: { text: 0.3, semantic: 0.7 },
      });

      // 3. Combine and deduplicate results
      const combinedResults = this.combineSearchResults(
        semanticResults,
        hybridResults,
      );

      // 4. Rerank using neural reranker
      const documents = combinedResults.map((result) => ({
        id: result.sys_id,
        text: `${result.short_description} ${result.description}`.substring(
          0,
          1000,
        ),
      }));

      const rerankResponse = await this.rerank.rerank(description, documents, {
        top_k: this.config.max_similar_tickets,
      });

      // 5. Map reranked results back to ticket data
      const similarTickets: SimilarTicketResult[] = [];
      for (const rerankResult of rerankResponse.results) {
        const originalTicket = combinedResults.find(
          (t) => t.sys_id === rerankResult.document.id,
        );
        if (originalTicket) {
          similarTickets.push({
            sys_id: originalTicket.sys_id,
            number: originalTicket.number,
            short_description: originalTicket.short_description,
            description: originalTicket.description,
            state: originalTicket.state,
            priority: originalTicket.priority,
            category: originalTicket.category,
            assignment_group: originalTicket.assignment_group,
            resolved_by: originalTicket.resolved_by,
            resolution_notes: originalTicket.resolution_notes,
            similarity_score: rerankResult.relevance_score,
            search_score: originalTicket._score,
          });
        }
      }

      return similarTickets;
    } catch (error) {
      logger.error(" [TicketAnalysis] Similar ticket search failed:", error);
      return [];
    }
  }

  private async generatePredictions(
    content: any,
    similarTickets: SimilarTicketResult[],
  ): Promise<TicketPrediction[]> {
    const predictions: TicketPrediction[] = [];

    try {
      // Priority prediction based on similar tickets
      if (this.config.enable_priority_prediction) {
        const priorityPrediction = await this.predictTicketProperty(
          "priority",
          content,
          similarTickets,
          [
            "1 - Critical",
            "2 - High",
            "3 - Moderate",
            "4 - Low",
            "5 - Planning",
          ],
        );
        predictions.push(priorityPrediction);
      }

      // Category prediction
      if (this.config.enable_category_prediction) {
        const categoryPrediction = await this.predictTicketProperty(
          "category",
          content,
          similarTickets,
          [
            "Hardware",
            "Software",
            "Network",
            "Security",
            "Database",
            "Application",
          ],
        );
        predictions.push(categoryPrediction);
      }

      // Assignment group prediction
      if (this.config.enable_assignment_prediction) {
        const assignmentPrediction = await this.predictAssignmentGroup(
          content,
          similarTickets,
        );
        predictions.push(assignmentPrediction);
      }
    } catch (error) {
      logger.error(" [TicketAnalysis] Prediction generation failed:", error);
    }

    return predictions;
  }

  private async predictTicketProperty(
    property: string,
    content: any,
    similarTickets: SimilarTicketResult[],
    possibleValues: string[],
  ): Promise<TicketPrediction> {
    // Analyze similar tickets for patterns
    const propertyFrequency = new Map<
      string,
      { count: number; totalScore: number }
    >();

    for (const ticket of similarTickets) {
      const value = ticket[property as keyof SimilarTicketResult] as string;
      if (value && possibleValues.includes(value)) {
        const current = propertyFrequency.get(value) || {
          count: 0,
          totalScore: 0,
        };
        current.count++;
        current.totalScore += ticket.similarity_score;
        propertyFrequency.set(value, current);
      }
    }

    // Calculate weighted scores
    const predictions = Array.from(propertyFrequency.entries())
      .map(([value, stats]) => ({
        value,
        confidence: Math.min(
          0.95,
          (stats.totalScore / stats.count) * 0.8 +
            (stats.count / similarTickets.length) * 0.2,
        ),
        frequency: stats.count,
      }))
      .sort((a, b) => b.confidence - a.confidence);

    return {
      property,
      predicted_value: predictions[0]?.value || "Unknown",
      confidence: predictions[0]?.confidence || 0.0,
      alternatives: predictions.slice(1, 3),
      reasoning: `Based on ${similarTickets.length} similar tickets with ${predictions[0]?.frequency || 0} matches`,
    };
  }

  private async predictAssignmentGroup(
    content: any,
    similarTickets: SimilarTicketResult[],
  ): Promise<TicketPrediction> {
    // Get unique assignment groups from similar tickets
    const groups = similarTickets
      .filter((t) => t.assignment_group)
      .map((t) => ({ group: t.assignment_group, score: t.similarity_score }));

    if (groups.length === 0) {
      return {
        property: "assignment_group",
        predicted_value: "Service Desk",
        confidence: 0.3,
        alternatives: [],
        reasoning: "No similar tickets found with assignment groups",
      };
    }

    // Calculate group frequencies and scores
    const groupStats = new Map<string, { count: number; totalScore: number }>();
    groups.forEach(({ group, score }) => {
      const current = groupStats.get(group) || { count: 0, totalScore: 0 };
      current.count++;
      current.totalScore += score;
      groupStats.set(group, current);
    });

    const predictions = Array.from(groupStats.entries())
      .map(([group, stats]) => ({
        value: group,
        confidence: Math.min(0.9, (stats.totalScore / stats.count) * 0.9),
        frequency: stats.count,
      }))
      .sort((a, b) => b.confidence - a.confidence);

    return {
      property: "assignment_group",
      predicted_value: predictions[0].value,
      confidence: predictions[0].confidence,
      alternatives: predictions.slice(1, 2),
      reasoning: `Based on ${groups.length} similar tickets, ${predictions[0].value} handled ${predictions[0].frequency} similar cases`,
    };
  }

  private async generateRecommendations(
    content: any,
    similarTickets: SimilarTicketResult[],
    predictions: TicketPrediction[],
  ): Promise<string[]> {
    const recommendations: string[] = [];

    try {
      // Get resolution patterns from similar tickets
      const resolutions = similarTickets
        .filter((t) => t.resolution_notes && t.state === "Resolved")
        .map((t) => t.resolution_notes)
        .slice(0, 5);

      if (resolutions.length > 0) {
        const prompt = `Based on this ticket: "${content.short_description} - ${content.description}"
        and similar resolved tickets, provide 3 concise action recommendations:

        Similar resolutions:
        ${resolutions.join("\n---\n")}

        Provide specific, actionable recommendations in Portuguese:`;

        const llmResponse = await this.llm.generateResponse(
          [{ role: "user", content: prompt }],
          {
            max_tokens: 300,
            temperature: 0.3,
          },
        );

        if (llmResponse.success && llmResponse.content) {
          const recs = llmResponse.content
            .split("\n")
            .filter((line) => line.trim().length > 20)
            .slice(0, 3);
          recommendations.push(...recs);
        }
      }

      // Add prediction-based recommendations
      const highConfidencePredictions = predictions.filter(
        (p) => p.confidence > 0.7,
      );
      if (highConfidencePredictions.length > 0) {
        recommendations.push(
          `Recomendação de atribuição: ${highConfidencePredictions.find((p) => p.property === "assignment_group")?.predicted_value || "Service Desk"}`,
        );
      }
    } catch (error) {
      logger.warn(" [TicketAnalysis] Recommendation generation failed:", error);
      recommendations.push(
        "Consultar tickets similares para estratégias de resolução",
      );
    }

    return recommendations.length > 0
      ? recommendations
      : ["Analisar contexto e aplicar procedimentos padrão"];
  }

  private combineSearchResults(
    semanticResults: any[],
    hybridResults: any[],
  ): any[] {
    const resultsMap = new Map<string, any>();

    // Add semantic results
    semanticResults.forEach((result) => {
      resultsMap.set(result.sys_id, { ...result, search_type: "semantic" });
    });

    // Add hybrid results (prefer hybrid if duplicate)
    hybridResults.forEach((result) => {
      resultsMap.set(result.sys_id, { ...result, search_type: "hybrid" });
    });

    return Array.from(resultsMap.values());
  }

  private calculateConfidenceScore(
    similarTickets: SimilarTicketResult[],
    predictions: TicketPrediction[],
  ): number {
    if (similarTickets.length === 0) return 0.0;

    const avgSimilarity =
      similarTickets.reduce((sum, t) => sum + t.similarity_score, 0) /
      similarTickets.length;
    const avgPredictionConfidence =
      predictions.length > 0
        ? predictions.reduce((sum, p) => sum + p.confidence, 0) /
          predictions.length
        : 0.0;

    return Math.min(0.95, avgSimilarity * 0.6 + avgPredictionConfidence * 0.4);
  }

  private async getModelVersions(): Promise<Record<string, string>> {
    return {
      embedding_model: "bge-large-en-v1.5",
      rerank_model: "bge-reranker-v2-m3",
      llm_model: "deepseek-coder:1.3b",
      search_engine: "opensearch-3.1.0",
    };
  }

  async getConfig(): Promise<TicketAnalysisConfig> {
    return this.config;
  }

  async updateConfig(newConfig: Partial<TicketAnalysisConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    logger.info(" [TicketAnalysis] Configuration updated");
  }
}
