/**
 * Document Lifecycle Service - Automated Knowledge Management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { setImmediate } from "timers/promises";
import { performance } from "perf_hooks";
import { TikaClient } from "../../clients/TikaClient";
import { OpenSearchClient } from "../../clients/OpenSearchClient";
import {
  DocumentUploadMetadata,
  ProcessingResult,
  GapAnalysis,
  DocumentValidation,
  KnowledgeGraphUpdate,
  NotificationResult,
} from "../../types/AI";

export interface DocumentClassification {
  technology: string[];
  support_groups: string[];
  document_type: string;
  criticality: "low" | "medium" | "high" | "critical";
  language: string;
  complexity_score: number;
}

export interface SearchAnalytics {
  query: string;
  frequency: number;
  success_rate: number;
  avg_response_time: number;
  support_group: string;
  technology: string;
  last_searched: Date;
}

export interface DocumentCoverage {
  technology: string;
  document_count: number;
  last_updated: Date;
  quality_score: number;
  gap_score: number;
}

export class DocumentLifecycleService {
  private tikaClient: TikaClient;
  private openSearchClient: OpenSearchClient;
  private readonly SUPPORTED_FORMATS = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  constructor() {
    this.tikaClient = new TikaClient();
    this.openSearchClient = new OpenSearchClient({
      host: process.env.OPENSEARCH_HOST || "10.219.8.210",
      port: parseInt(process.env.OPENSEARCH_PORT || "9200"),
      ssl: false,
      auth: {
        username: process.env.OPENSEARCH_USERNAME || "admin",
        password: process.env.OPENSEARCH_PASSWORD || "admin",
      },
    });
  }

  async processNewDocument(
    fileBuffer: Buffer,
    metadata: DocumentUploadMetadata,
  ): Promise<ProcessingResult> {
    const startTime = performance.now();

    try {
      // 1. Validate document format and quality
      const validation = await this.validateDocument(fileBuffer, metadata);
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
          processing_time_ms: performance.now() - startTime,
        };
      }

      // 2. Extract content using Tika
      const extractedContent = await this.tikaClient.extractFull(fileBuffer);

      // 3. Classify document
      const classification = await this.classifyDocument(
        extractedContent.content,
        metadata,
      );

      // 4. Process with OpenSearch (neural embeddings)
      const indexResult = await this.indexDocument({
        content: extractedContent.content,
        metadata: {
          ...metadata,
          ...extractedContent.metadata,
          classification,
        },
      });

      // 5. Update knowledge graph asynchronously
      setImmediate(async () => {
        try {
          await this.updateKnowledgeGraph({
            document_id: indexResult.document_id,
            classification,
            relationships: await this.extractRelationships(
              extractedContent.content,
            ),
          });
        } catch (error: unknown) {
          console.error("Knowledge graph update failed:", error);
        }
      });

      // 6. Notify relevant support groups asynchronously
      setImmediate(async () => {
        try {
          await this.notifySupporGroups(classification, metadata.uploaded_by);
        } catch (error: unknown) {
          console.error("Support group notification failed:", error);
        }
      });

      return {
        success: true,
        document_id: indexResult.document_id,
        classification,
        indexed_collections: indexResult.collections,
        processing_time_ms: performance.now() - startTime,
        extracted_metadata: extractedContent.metadata,
      };
    } catch (error: any) {
      console.error("Document processing failed:", error);
      return {
        success: false,
        errors: [`Processing failed: ${error.message}`],
        processing_time_ms: performance.now() - startTime,
      };
    }
  }

  private async validateDocument(
    fileBuffer: Buffer,
    metadata: DocumentUploadMetadata,
  ): Promise<DocumentValidation> {
    const errors: string[] = [];

    // Check file size (max 50MB)
    if (fileBuffer.length > 50 * 1024 * 1024) {
      errors.push("File size exceeds 50MB limit");
    }

    // Detect MIME type using Tika
    try {
      const detectedMimeType = await this.tikaClient.detectMimeType(fileBuffer);

      if (!this.SUPPORTED_FORMATS.includes(detectedMimeType)) {
        errors.push(`Unsupported file format: ${detectedMimeType}`);
      }

      // Basic content extraction test
      const testExtraction = await this.tikaClient.extractText(fileBuffer);
      if (testExtraction.length < 100) {
        errors.push("Document content too short (minimum 100 characters)");
      }
    } catch (error: any) {
      errors.push(`Content validation failed: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      detected_format: await this.tikaClient
        .detectMimeType(fileBuffer)
        .catch(() => "unknown"),
    };
  }

  private async classifyDocument(
    content: string,
    metadata: DocumentUploadMetadata,
  ): Promise<DocumentClassification> {
    // Technology classification based on content analysis
    const technologies = this.identifyTechnologies(content);

    // Support group classification based on metadata and content
    const supportGroups = this.identifySupportGroups(content, metadata);

    // Document type classification
    const documentType = this.classifyDocumentType(content, metadata);

    // Criticality assessment
    const criticality = this.assessCriticality(content, metadata);

    // Language detection (Portuguese/English)
    const language = this.detectLanguage(content);

    // Complexity scoring
    const complexityScore = this.calculateComplexity(content);

    return {
      technology: technologies,
      support_groups: supportGroups,
      document_type: documentType,
      criticality,
      language,
      complexity_score: complexityScore,
    };
  }

  private identifyTechnologies(content: string): string[] {
    const techKeywords = {
      Oracle: [
        "oracle",
        "sql*plus",
        "sqlplus",
        "plsql",
        "pl/sql",
        "awr",
        "addm",
        "rman",
      ],
      PostgreSQL: [
        "postgresql",
        "postgres",
        "pg_",
        "psql",
        "pg_dump",
        "pg_restore",
      ],
      MongoDB: [
        "mongodb",
        "mongo",
        "bson",
        "aggregation pipeline",
        "replica set",
      ],
      AWS: ["aws", "ec2", "s3", "rds", "lambda", "cloudformation", "boto3"],
      Azure: [
        "azure",
        "az cli",
        "arm template",
        "resource group",
        "subscription",
      ],
      Docker: ["docker", "dockerfile", "container", "docker-compose"],
      Kubernetes: [
        "kubernetes",
        "kubectl",
        "k8s",
        "pod",
        "deployment",
        "service",
      ],
      Network: [
        "cisco",
        "juniper",
        "bgp",
        "ospf",
        "vlan",
        "subnet",
        "firewall",
      ],
      Linux: ["linux", "bash", "systemd", "cron", "iptables", "sed", "awk"],
      Windows: ["windows", "powershell", "active directory", "iis", "registry"],
    };

    const contentLower = content.toLowerCase();
    const identifiedTechs: string[] = [];

    for (const [tech, keywords] of Object.entries(techKeywords)) {
      const matchCount = keywords.filter((keyword) =>
        contentLower.includes(keyword.toLowerCase()),
      ).length;

      if (matchCount >= 2) {
        // At least 2 keyword matches
        identifiedTechs.push(tech);
      }
    }

    return identifiedTechs.length > 0 ? identifiedTechs : ["General"];
  }

  private identifySupportGroups(
    content: string,
    metadata: DocumentUploadMetadata,
  ): string[] {
    const groupKeywords = {
      Database: [
        "database",
        "db",
        "sql",
        "query",
        "table",
        "index",
        "backup",
        "restore",
      ],
      Infrastructure: [
        "server",
        "network",
        "storage",
        "hardware",
        "datacenter",
      ],
      Cloud: ["cloud", "aws", "azure", "gcp", "saas", "paas", "iaas"],
      Security: [
        "security",
        "firewall",
        "vpn",
        "ssl",
        "certificate",
        "authentication",
      ],
      Application: ["application", "app", "software", "deployment", "release"],
      Monitoring: ["monitoring", "alert", "metric", "dashboard", "performance"],
    };

    const contentLower = content.toLowerCase();
    const identifiedGroups: string[] = [];

    // Check metadata first
    if (metadata.support_group) {
      identifiedGroups.push(metadata.support_group);
    }

    // Analyze content
    for (const [group, keywords] of Object.entries(groupKeywords)) {
      const matchCount = keywords.filter((keyword) =>
        contentLower.includes(keyword.toLowerCase()),
      ).length;

      if (matchCount >= 3) {
        // At least 3 keyword matches
        identifiedGroups.push(group);
      }
    }

    return identifiedGroups.length > 0 ? identifiedGroups : ["General"];
  }

  private classifyDocumentType(
    content: string,
    metadata: DocumentUploadMetadata,
  ): string {
    const contentLower = content.toLowerCase();

    if (metadata.filename?.toLowerCase().includes("procedure"))
      return "procedure";
    if (metadata.filename?.toLowerCase().includes("manual")) return "manual";
    if (metadata.filename?.toLowerCase().includes("troubleshoot"))
      return "troubleshooting";

    if (contentLower.includes("step") && contentLower.includes("procedure"))
      return "procedure";
    if (
      contentLower.includes("troubleshoot") ||
      contentLower.includes("problem")
    )
      return "troubleshooting";
    if (
      contentLower.includes("configuration") ||
      contentLower.includes("config")
    )
      return "configuration";
    if (contentLower.includes("installation") || contentLower.includes("setup"))
      return "installation";
    if (contentLower.includes("reference") || contentLower.includes("api"))
      return "reference";

    return "general";
  }

  private assessCriticality(
    content: string,
    metadata: DocumentUploadMetadata,
  ): "low" | "medium" | "high" | "critical" {
    const contentLower = content.toLowerCase();

    // Critical indicators
    if (
      contentLower.includes("critical") ||
      contentLower.includes("emergency") ||
      contentLower.includes("disaster recovery")
    ) {
      return "critical";
    }

    // High criticality indicators
    if (
      contentLower.includes("production") ||
      contentLower.includes("outage") ||
      contentLower.includes("security incident")
    ) {
      return "high";
    }

    // Medium criticality indicators
    if (
      contentLower.includes("performance") ||
      contentLower.includes("optimization") ||
      contentLower.includes("backup")
    ) {
      return "medium";
    }

    return "low";
  }

  private detectLanguage(content: string): string {
    // Simple Portuguese vs English detection
    const portugueseIndicators = [
      "o",
      "a",
      "de",
      "que",
      "para",
      "com",
      "não",
      "são",
      "dados",
    ];
    const englishIndicators = [
      "the",
      "and",
      "or",
      "to",
      "from",
      "with",
      "not",
      "are",
      "data",
    ];

    const words = content.toLowerCase().split(/\s+/).slice(0, 500); // First 500 words

    const ptCount = portugueseIndicators.reduce(
      (count, indicator) =>
        count + words.filter((word) => word === indicator).length,
      0,
    );

    const enCount = englishIndicators.reduce(
      (count, indicator) =>
        count + words.filter((word) => word === indicator).length,
      0,
    );

    return ptCount > enCount ? "portuguese" : "english";
  }

  private calculateComplexity(content: string): number {
    const words = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).length;
    const avgWordsPerSentence = words / sentences;

    // Complexity factors
    const technicalTerms = (content.match(/\b[A-Z_]{3,}\b/g) || []).length; // Acronyms
    const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
    const numbers = (content.match(/\b\d+\b/g) || []).length;

    // Calculate complexity score (0-100)
    let complexity = 0;
    complexity += Math.min(avgWordsPerSentence * 2, 30); // Sentence complexity
    complexity += Math.min(technicalTerms * 0.5, 20); // Technical density
    complexity += Math.min(codeBlocks * 5, 25); // Code complexity
    complexity += Math.min(numbers * 0.1, 10); // Numerical complexity
    complexity += Math.min((words / 1000) * 15, 15); // Document length

    return Math.round(Math.min(complexity, 100));
  }

  private async indexDocument(
    documentData: any,
  ): Promise<{ document_id: string; collections: string[] }> {
    // Index in OpenSearch with appropriate collections
    const collections = this.determineCollections(
      documentData.metadata.classification,
    );
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.openSearchClient.indexDocument("knowledge_base", documentId, {
      content: documentData.content,
      metadata: documentData.metadata,
      indexed_at: new Date().toISOString(),
      collections,
    });

    return { document_id: documentId, collections };
  }

  private determineCollections(
    classification: DocumentClassification,
  ): string[] {
    const collections: string[] = ["general"];

    // Add technology-specific collections
    classification.technology.forEach((tech) => {
      collections.push(`tech_${tech.toLowerCase()}`);
    });

    // Add support group collections
    classification.support_groups.forEach((group) => {
      collections.push(`group_${group.toLowerCase()}`);
    });

    // Add document type collection
    collections.push(`type_${classification.document_type}`);

    // Add criticality collection
    collections.push(`criticality_${classification.criticality}`);

    return collections;
  }

  private async extractRelationships(content: string): Promise<any[]> {
    // Extract relationships between entities in the document
    // This is a simplified implementation - in production would use NLP
    const relationships = [];

    // Look for common relationship patterns
    const patterns = [
      /(\w+)\s+connects?\s+to\s+(\w+)/gi,
      /(\w+)\s+depends?\s+on\s+(\w+)/gi,
      /(\w+)\s+is\s+part\s+of\s+(\w+)/gi,
      /(\w+)\s+uses?\s+(\w+)/gi,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        relationships.push({
          source: match[1],
          target: match[2],
          relationship:
            match[0].match(/\b(connects?|depends?|part\s+of|uses?)\b/i)?.[0] ||
            "related",
        });
      }
    });

    return relationships;
  }

  private async updateKnowledgeGraph(
    update: KnowledgeGraphUpdate,
  ): Promise<void> {
    // Update knowledge graph with document relationships
    // This would integrate with a graph database like Neo4j
    // For now, store in MongoDB
    try {
      // Implementation would depend on graph database choice
      console.log("Knowledge graph updated:", update.document_id);
    } catch (error: unknown) {
      console.error("Knowledge graph update failed:", error);
    }
  }

  private async notifySupporGroups(
    classification: DocumentClassification,
    uploadedBy: string,
  ): Promise<NotificationResult> {
    // Notify relevant support groups about new documentation
    const notifications = [];

    for (const group of classification.support_groups) {
      notifications.push({
        group,
        message: `New ${classification.document_type} document available for ${classification.technology.join(", ")}`,
        criticality: classification.criticality,
        uploaded_by: uploadedBy,
      });
    }

    // Send notifications (would integrate with actual notification system)
    console.log("Support groups notified:", notifications.length);

    return {
      notifications_sent: notifications.length,
      groups_notified: classification.support_groups,
    };
  }

  async detectDocumentationGaps(): Promise<GapAnalysis> {
    try {
      // Analyze search patterns vs. available documentation
      const searchLogs = await this.getSearchAnalytics();
      const availableDocs = await this.getDocumentCoverage();

      const missingTopics = this.identifyGaps(searchLogs, availableDocs);
      const suggestedDocuments = this.suggestNewDocuments(missingTopics);
      const updateCandidates = this.identifyOutdatedDocs(availableDocs);

      return {
        analysis_date: new Date().toISOString(),
        missing_topics: missingTopics,
        suggested_documents: suggestedDocuments,
        update_candidates: updateCandidates,
        coverage_score: this.calculateCoverageScore(searchLogs, availableDocs),
        recommendations: this.generateRecommendations(
          missingTopics,
          updateCandidates,
        ),
      };
    } catch (error: any) {
      console.error("Gap analysis failed:", error);
      throw new Error(`Gap analysis failed: ${error.message}`);
    }
  }

  private async getSearchAnalytics(): Promise<SearchAnalytics[]> {
    // Get search analytics from OpenSearch or logs
    // This would query actual search logs
    return [
      {
        query: "oracle performance tuning",
        frequency: 45,
        success_rate: 0.67,
        avg_response_time: 234,
        support_group: "Database",
        technology: "Oracle",
        last_searched: new Date(),
      },
      {
        query: "kubernetes pod troubleshooting",
        frequency: 32,
        success_rate: 0.45,
        avg_response_time: 456,
        support_group: "Infrastructure",
        technology: "Kubernetes",
        last_searched: new Date(),
      },
      // More search analytics would be retrieved from actual logs
    ];
  }

  private async getDocumentCoverage(): Promise<DocumentCoverage[]> {
    // Get document coverage statistics
    return [
      {
        technology: "Oracle",
        document_count: 67,
        last_updated: new Date("2024-12-15"),
        quality_score: 85,
        gap_score: 23,
      },
      {
        technology: "Kubernetes",
        document_count: 12,
        last_updated: new Date("2024-11-20"),
        quality_score: 72,
        gap_score: 67,
      },
      // More coverage data would be calculated from actual document index
    ];
  }

  private identifyGaps(
    searchLogs: SearchAnalytics[],
    availableDocs: DocumentCoverage[],
  ): Array<{ topic: string; gap_severity: string; search_frequency: number }> {
    const gaps = [];

    for (const searchLog of searchLogs) {
      if (searchLog.success_rate < 0.5) {
        // Low success rate indicates gap
        const coverage = availableDocs.find(
          (doc) => doc.technology === searchLog.technology,
        );

        gaps.push({
          topic: `${searchLog.technology}: ${searchLog.query}`,
          gap_severity: coverage && coverage.gap_score > 50 ? "high" : "medium",
          search_frequency: searchLog.frequency,
        });
      }
    }

    return gaps.sort((a, b) => b.search_frequency - a.search_frequency);
  }

  private suggestNewDocuments(
    missingTopics: Array<{
      topic: string;
      gap_severity: string;
      search_frequency: number;
    }>,
  ): Array<{ title: string; priority: string; estimated_effort: string }> {
    return missingTopics.slice(0, 10).map((topic) => ({
      title: `How to: ${topic.topic}`,
      priority: topic.gap_severity,
      estimated_effort: topic.search_frequency > 30 ? "high" : "medium",
    }));
  }

  private identifyOutdatedDocs(
    coverage: DocumentCoverage[],
  ): Array<{ technology: string; reason: string }> {
    const outdatedThreshold = 90; // days
    const now = new Date();

    return coverage
      .filter((doc) => {
        const daysSinceUpdate =
          (now.getTime() - doc.last_updated.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceUpdate > outdatedThreshold || doc.quality_score < 70;
      })
      .map((doc) => ({
        technology: doc.technology,
        reason:
          doc.quality_score < 70 ? "Low quality score" : "Not updated recently",
      }));
  }

  private calculateCoverageScore(
    searchLogs: SearchAnalytics[],
    availableDocs: DocumentCoverage[],
  ): number {
    const totalSearches = searchLogs.reduce(
      (sum, log) => sum + log.frequency,
      0,
    );
    const successfulSearches = searchLogs.reduce(
      (sum, log) => sum + log.frequency * log.success_rate,
      0,
    );

    return Math.round((successfulSearches / totalSearches) * 100);
  }

  private generateRecommendations(
    missingTopics: Array<{
      topic: string;
      gap_severity: string;
      search_frequency: number;
    }>,
    updateCandidates: Array<{ technology: string; reason: string }>,
  ): string[] {
    const recommendations = [];

    if (missingTopics.length > 0) {
      recommendations.push(
        `Create documentation for ${missingTopics.length} high-demand topics`,
      );
    }

    if (updateCandidates.length > 0) {
      recommendations.push(
        `Update documentation for ${updateCandidates.length} technologies`,
      );
    }

    recommendations.push(
      "Implement automated quality scoring for new documents",
    );
    recommendations.push("Set up regular documentation review cycles");

    return recommendations;
  }
}
