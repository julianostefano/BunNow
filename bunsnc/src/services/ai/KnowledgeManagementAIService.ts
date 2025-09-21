/**
 * Knowledge Management AI Service - Wrapper for Knowledge Graph and Document Lifecycle
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { setImmediate } from "timers/promises";
import { AIService } from "./AIServiceManager";
import { KnowledgeGraphService } from "./KnowledgeGraphService";
import { DocumentLifecycleService } from "./DocumentLifecycleService";
import {
  AIRequest,
  AIResponse,
  DocumentUploadMetadata,
  KnowledgeGraphQuery,
} from "../../types/AI";

export class KnowledgeManagementAIService extends AIService {
  private knowledgeGraph: KnowledgeGraphService;
  private documentLifecycle: DocumentLifecycleService;

  constructor() {
    super("knowledge-management");
    this.knowledgeGraph = new KnowledgeGraphService();
    this.documentLifecycle = new DocumentLifecycleService();
  }

  async initialize(): Promise<void> {
    try {
      console.log("Knowledge Management AI Service: Initializing...");

      // Initialize sub-services
      // Note: Both services initialize themselves in their constructors

      this.initialized = true;
      console.log("Knowledge Management AI Service: Initialized successfully");
    } catch (error) {
      console.error(
        "Knowledge Management AI Service: Initialization failed:",
        error,
      );
      throw error;
    }
  }

  async process(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      switch (request.type) {
        case "process_document":
          return await this.processDocument(request);

        case "analyze_gaps":
          return await this.analyzeGaps(request);

        case "query_graph":
          return await this.queryGraph(request);

        case "get_graph_analytics":
          return await this.getGraphAnalytics(request);

        case "add_document_to_graph":
          return await this.addDocumentToGraph(request);

        default:
          return {
            success: false,
            error: `Unsupported request type: ${request.type}`,
            processing_time_ms: Date.now() - startTime,
          };
      }
    } catch (error: any) {
      console.error(
        "Knowledge Management AI Service: Processing error:",
        error,
      );
      return {
        success: false,
        error: `Processing failed: ${error.message}`,
        processing_time_ms: Date.now() - startTime,
      };
    }
  }

  private async processDocument(request: AIRequest): Promise<AIResponse> {
    const { fileBuffer, metadata } = request.data;

    if (!fileBuffer || !metadata) {
      return {
        success: false,
        error: "Missing required fields: fileBuffer and metadata",
      };
    }

    const result = await this.documentLifecycle.processNewDocument(
      fileBuffer,
      metadata as DocumentUploadMetadata,
    );

    return {
      success: result.success,
      data: result,
      processing_time_ms: result.processing_time_ms,
      ...(result.errors && { error: result.errors.join(", ") }),
    };
  }

  private async analyzeGaps(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const gaps = await this.documentLifecycle.detectDocumentationGaps();

      return {
        success: true,
        data: gaps,
        processing_time_ms: Date.now() - startTime,
        confidence: this.calculateGapAnalysisConfidence(gaps),
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Gap analysis failed: ${error.message}`,
        processing_time_ms: Date.now() - startTime,
      };
    }
  }

  private async queryGraph(request: AIRequest): Promise<AIResponse> {
    const { query } = request.data;

    if (!query) {
      return {
        success: false,
        error: "Missing required field: query",
      };
    }

    return await this.knowledgeGraph.queryKnowledgeGraph(
      query as KnowledgeGraphQuery,
    );
  }

  private async getGraphAnalytics(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const analytics = await this.knowledgeGraph.getGraphAnalytics();

      return {
        success: true,
        data: analytics,
        processing_time_ms: Date.now() - startTime,
        confidence: this.calculateAnalyticsConfidence(analytics),
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Analytics retrieval failed: ${error.message}`,
        processing_time_ms: Date.now() - startTime,
      };
    }
  }

  private async addDocumentToGraph(request: AIRequest): Promise<AIResponse> {
    const { documentId, metadata, relationships } = request.data;

    if (!documentId || !metadata) {
      return {
        success: false,
        error: "Missing required fields: documentId and metadata",
      };
    }

    const startTime = Date.now();

    try {
      await this.knowledgeGraph.addDocumentNode(
        documentId,
        metadata,
        relationships || [],
      );

      return {
        success: true,
        data: { document_id: documentId, status: "added_to_graph" },
        processing_time_ms: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to add document to graph: ${error.message}`,
        processing_time_ms: Date.now() - startTime,
      };
    }
  }

  private calculateGapAnalysisConfidence(gaps: any): number {
    // Calculate confidence based on data completeness and quality
    let confidence = 0.5; // Base confidence

    if (gaps.missing_topics && gaps.missing_topics.length > 0) {
      confidence += 0.2;
    }

    if (gaps.coverage_score > 70) {
      confidence += 0.2;
    }

    if (gaps.update_candidates && gaps.update_candidates.length > 0) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.9);
  }

  private calculateAnalyticsConfidence(analytics: any): number {
    // Calculate confidence based on data richness
    let confidence = 0.6; // Base confidence

    if (analytics.total_nodes > 50) {
      confidence += 0.2;
    }

    if (analytics.total_edges > 100) {
      confidence += 0.1;
    }

    if (analytics.cluster_analysis && analytics.cluster_analysis.length > 3) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.95);
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Test basic functionality of both services
      const testQuery = {
        query_type: "find_related_documents" as const,
        parameters: { max_results: 1 },
      };

      const graphResult =
        await this.knowledgeGraph.queryKnowledgeGraph(testQuery);

      // Check if services are responsive
      return graphResult.success !== undefined; // Just check if we get a response
    } catch (error) {
      console.error(
        "Knowledge Management AI Service: Health check failed:",
        error,
      );
      return false;
    }
  }

  // Additional utility methods for integration

  async processDocumentWithGraph(
    fileBuffer: Buffer,
    metadata: DocumentUploadMetadata,
  ): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // 1. Process document through lifecycle
      const processingResult = await this.documentLifecycle.processNewDocument(
        fileBuffer,
        metadata,
      );

      if (!processingResult.success) {
        return {
          success: false,
          error:
            processingResult.errors?.join(", ") || "Document processing failed",
          processing_time_ms: Date.now() - startTime,
        };
      }

      // 2. Add to knowledge graph asynchronously
      setImmediate(async () => {
        try {
          if (processingResult.document_id) {
            await this.knowledgeGraph.addDocumentNode(
              processingResult.document_id,
              {
                ...metadata,
                classification: processingResult.classification,
              },
              [], // Relationships will be extracted by the lifecycle service
            );
          }
        } catch (error) {
          console.error("Failed to add document to knowledge graph:", error);
        }
      });

      return {
        success: true,
        data: {
          processing_result: processingResult,
          graph_integration: "scheduled",
        },
        processing_time_ms: Date.now() - startTime,
        confidence: 0.85,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Integrated processing failed: ${error.message}`,
        processing_time_ms: Date.now() - startTime,
      };
    }
  }

  async getKnowledgeInsights(): Promise<{
    graph_analytics: any;
    gap_analysis: any;
    recommendations: string[];
  }> {
    const [analytics, gaps] = await Promise.all([
      this.knowledgeGraph.getGraphAnalytics(),
      this.documentLifecycle.detectDocumentationGaps(),
    ]);

    const recommendations = [
      ...gaps.recommendations,
      `Knowledge graph has ${analytics.total_nodes} nodes with ${analytics.total_edges} connections`,
      `${analytics.orphaned_documents.length} documents need better integration`,
      `Top technologies: ${analytics.most_connected_technologies
        .slice(0, 3)
        .map((t) => t.name)
        .join(", ")}`,
    ];

    return {
      graph_analytics: analytics,
      gap_analysis: gaps,
      recommendations,
    };
  }
}
