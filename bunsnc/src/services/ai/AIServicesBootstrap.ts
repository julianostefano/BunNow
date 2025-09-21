/**
 * AI Services Bootstrap - Initialize and configure all AI services
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { AIServiceManager } from "./AIServiceManager";
import { DocumentIntelligenceService } from "./DocumentIntelligenceService";
import { TicketIntelligenceService } from "./TicketIntelligenceService";
import { AgentAssistantService } from "./AgentAssistantService";
import { logger } from "../../utils/Logger";

export interface AIServicesConfig {
  tika: {
    url: string;
    timeout: number;
  };
  opensearch: {
    host: string;
    port: number;
    auth?: {
      username: string;
      password: string;
    };
    ssl?: boolean;
  };
  servicenow: {
    instance_url: string;
    auth_token: string;
  };
  document_intelligence: {
    index_name: string;
    chunk_size: number;
    chunk_overlap: number;
  };
  ticket_intelligence: {
    similarity_threshold: number;
    max_similar_tickets: number;
    max_suggestions: number;
  };
  agent_assistant: {
    max_chat_history: number;
    confidence_threshold: number;
    response_timeout_ms: number;
  };
}

export class AIServicesBootstrap {
  private static instance: AIServicesBootstrap;
  private aiManager: AIServiceManager;
  private config: AIServicesConfig;
  private initialized: boolean = false;

  private constructor() {
    this.aiManager = AIServiceManager.getInstance();
    this.config = this.loadConfiguration();
  }

  static getInstance(): AIServicesBootstrap {
    if (!AIServicesBootstrap.instance) {
      AIServicesBootstrap.instance = new AIServicesBootstrap();
    }
    return AIServicesBootstrap.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info(" [AIServicesBootstrap] Services already initialized");
      return;
    }

    try {
      logger.info(
        " [AIServicesBootstrap] Starting AI services initialization...",
      );

      await this.aiManager.initialize();

      logger.info(
        "📄 [AIServicesBootstrap] Initializing Document Intelligence Service...",
      );
      const documentIntelligence = new DocumentIntelligenceService({
        tika_url: this.config.tika.url,
        opensearch_config: this.config.opensearch,
        index_name: this.config.document_intelligence.index_name,
        chunk_size: this.config.document_intelligence.chunk_size,
        chunk_overlap: this.config.document_intelligence.chunk_overlap,
      });

      await documentIntelligence.initialize();
      this.aiManager.registerService(
        "document-intelligence",
        documentIntelligence,
      );

      logger.info(
        "🎫 [AIServicesBootstrap] Initializing Ticket Intelligence Service...",
      );
      const ticketIntelligence = new TicketIntelligenceService({
        servicenow_config: this.config.servicenow,
        document_intelligence: documentIntelligence,
        similarity_threshold:
          this.config.ticket_intelligence.similarity_threshold,
        max_similar_tickets:
          this.config.ticket_intelligence.max_similar_tickets,
        max_suggestions: this.config.ticket_intelligence.max_suggestions,
      });

      await ticketIntelligence.initialize();
      this.aiManager.registerService("ticket-intelligence", ticketIntelligence);

      logger.info(
        "🤖 [AIServicesBootstrap] Initializing Agent Assistant Service...",
      );
      const agentAssistant = new AgentAssistantService({
        document_intelligence: documentIntelligence,
        ticket_intelligence: ticketIntelligence,
        max_chat_history: this.config.agent_assistant.max_chat_history,
        confidence_threshold: this.config.agent_assistant.confidence_threshold,
        response_timeout_ms: this.config.agent_assistant.response_timeout_ms,
      });

      await agentAssistant.initialize();
      this.aiManager.registerService("agent-assistant", agentAssistant);

      await this.performHealthChecks();

      this.setupEventHandlers();

      this.initialized = true;
      logger.info(
        " [AIServicesBootstrap] AI services initialization completed successfully",
      );
    } catch (error) {
      logger.error(
        " [AIServicesBootstrap] Failed to initialize AI services:",
        error,
      );
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      logger.info(
        " [AIServicesBootstrap] Services not initialized, skipping shutdown",
      );
      return;
    }

    try {
      logger.info(" [AIServicesBootstrap] Shutting down AI services...");
      await this.aiManager.shutdown();
      this.initialized = false;
      logger.info(" [AIServicesBootstrap] AI services shutdown completed");
    } catch (error) {
      logger.error(" [AIServicesBootstrap] Error during shutdown:", error);
      throw error;
    }
  }

  getAIManager(): AIServiceManager {
    return this.aiManager;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async getHealthStatus(): Promise<Record<string, any>> {
    if (!this.initialized) {
      return { status: "not_initialized" };
    }

    try {
      const serviceHealth = await this.aiManager.healthCheck();
      const serviceMetrics = this.aiManager.getServiceMetrics();
      const availableServices = this.aiManager.listServices();

      return {
        status: "running",
        services: availableServices,
        health: serviceHealth,
        metrics: serviceMetrics,
        initialized_at: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(" [AIServicesBootstrap] Health check failed:", error);
      return {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async processAIRequest(serviceId: string, request: any): Promise<any> {
    if (!this.initialized) {
      throw new Error("AI services not initialized. Call initialize() first.");
    }

    return await this.aiManager.processRequest(serviceId, request);
  }

  private loadConfiguration(): AIServicesConfig {
    return {
      tika: {
        url: process.env.TIKA_SERVER_URL || "http://localhost:9998",
        timeout: parseInt(process.env.TIKA_TIMEOUT || "30000"),
      },
      opensearch: {
        host: process.env.OPENSEARCH_HOST || "localhost",
        port: parseInt(process.env.OPENSEARCH_PORT || "9200"),
        auth: process.env.OPENSEARCH_USERNAME
          ? {
              username: process.env.OPENSEARCH_USERNAME,
              password: process.env.OPENSEARCH_PASSWORD || "",
            }
          : undefined,
        ssl: process.env.OPENSEARCH_SSL === "true",
      },
      servicenow: {
        instance_url:
          process.env.SNC_INSTANCE_URL || "https://dev.service-now.com",
        auth_token: process.env.SNC_AUTH_TOKEN || "",
      },
      document_intelligence: {
        index_name: process.env.OPENSEARCH_INDEX || "nex-documents",
        chunk_size: parseInt(process.env.DOCUMENT_CHUNK_SIZE || "1000"),
        chunk_overlap: parseInt(process.env.DOCUMENT_CHUNK_OVERLAP || "200"),
      },
      ticket_intelligence: {
        similarity_threshold: parseFloat(
          process.env.TICKET_SIMILARITY_THRESHOLD || "0.7",
        ),
        max_similar_tickets: parseInt(process.env.MAX_SIMILAR_TICKETS || "5"),
        max_suggestions: parseInt(
          process.env.MAX_RESOLUTION_SUGGESTIONS || "3",
        ),
      },
      agent_assistant: {
        max_chat_history: parseInt(process.env.MAX_CHAT_HISTORY || "50"),
        confidence_threshold: parseFloat(
          process.env.RESPONSE_CONFIDENCE_THRESHOLD || "0.6",
        ),
        response_timeout_ms: parseInt(
          process.env.AGENT_RESPONSE_TIMEOUT || "10000",
        ),
      },
    };
  }

  private async performHealthChecks(): Promise<void> {
    logger.info(" [AIServicesBootstrap] Performing initial health checks...");

    const healthStatus = await this.aiManager.healthCheck();
    const failedServices = Object.entries(healthStatus)
      .filter(([, healthy]) => !healthy)
      .map(([service]) => service);

    if (failedServices.length > 0) {
      logger.warn(
        ` [AIServicesBootstrap] Some services failed health check: ${failedServices.join(", ")}`,
      );
    } else {
      logger.info(" [AIServicesBootstrap] All services passed health checks");
    }
  }

  private setupEventHandlers(): void {
    this.aiManager.on("service-error", (event) => {
      logger.error(
        ` [AIServicesBootstrap] Service error in ${event.serviceId}:`,
        event.error,
      );
    });

    this.aiManager.on("service-metrics", (event) => {
      logger.debug(
        ` [AIServicesBootstrap] Metrics update from ${event.serviceId}:`,
        event.metrics,
      );
    });

    this.aiManager.on("request-processed", (event) => {
      logger.debug(
        ` [AIServicesBootstrap] Request processed by ${event.serviceId}: success=${event.success}, time=${event.processingTime}ms`,
      );
    });

    this.aiManager.on("initialized", () => {
      logger.info("🎉 [AIServicesBootstrap] AI Service Manager initialized");
    });

    this.aiManager.on("shutdown", () => {
      logger.info(
        "👋 [AIServicesBootstrap] AI Service Manager shutdown complete",
      );
    });
  }

  updateConfiguration(newConfig: Partial<AIServicesConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info("⚙️ [AIServicesBootstrap] Configuration updated");
  }

  getConfiguration(): AIServicesConfig {
    return { ...this.config };
  }

  getServiceList(): string[] {
    return this.aiManager.listServices();
  }

  async getServiceMetrics(serviceId?: string): Promise<any> {
    const allMetrics = this.aiManager.getServiceMetrics();

    if (serviceId) {
      return allMetrics[serviceId] || null;
    }

    return allMetrics;
  }

  async testService(serviceId: string, testRequest: any): Promise<any> {
    if (!this.initialized) {
      throw new Error("AI services not initialized");
    }

    logger.info(`🧪 [AIServicesBootstrap] Testing service: ${serviceId}`);

    try {
      const result = await this.processAIRequest(serviceId, testRequest);
      logger.info(` [AIServicesBootstrap] Service test passed: ${serviceId}`);
      return result;
    } catch (error) {
      logger.error(
        ` [AIServicesBootstrap] Service test failed: ${serviceId}`,
        error,
      );
      throw error;
    }
  }
}

export default AIServicesBootstrap;
