/**
 * Agent Assistant Service - Real-time AI support for agents
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { AIService } from "./AIServiceManager";
import { DocumentIntelligenceService } from "./DocumentIntelligenceService";
import { TicketIntelligenceService } from "./TicketIntelligenceService";
import { logger } from "../../utils/Logger";
import {
  AIRequest,
  AIResponse,
  ChatResponse,
  ChatSource,
  WorkflowGuidance,
  WorkflowAction,
  AIContext,
} from "../../types/AI";

export interface AgentAssistantRequest extends AIRequest {
  type:
    | "chat_query"
    | "workflow_guidance"
    | "context_help"
    | "quick_search"
    | "auto_complete";
  data: {
    message?: string;
    current_step?: string;
    ticket_context?: any;
    search_query?: string;
    partial_text?: string;
    session_id?: string;
    agent_id?: string;
    max_results?: number;
  };
}

export interface AgentAssistantConfig {
  document_intelligence: DocumentIntelligenceService;
  ticket_intelligence: TicketIntelligenceService;
  max_chat_history: number;
  confidence_threshold: number;
  response_timeout_ms: number;
}

interface ChatSession {
  session_id: string;
  agent_id: string;
  messages: ChatMessage[];
  context: AIContext;
  created_at: Date;
  last_activity: Date;
}

interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: ChatSource[];
  confidence?: number;
}

export class AgentAssistantService extends AIService {
  private config: AgentAssistantConfig;
  private documentIntelligence: DocumentIntelligenceService;
  private ticketIntelligence: TicketIntelligenceService;
  private chatSessions: Map<string, ChatSession> = new Map();

  constructor(config: AgentAssistantConfig) {
    super("agent-assistant");
    this.config = config;
    this.documentIntelligence = config.document_intelligence;
    this.ticketIntelligence = config.ticket_intelligence;
    this.startSessionCleanup();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info("🤖 [AgentAssistant] Initializing service...");

      if (!this.documentIntelligence.isInitialized) {
        await this.documentIntelligence.initialize();
      }

      if (!this.ticketIntelligence.isInitialized) {
        await this.ticketIntelligence.initialize();
      }

      this.initialized = true;
      logger.info(" [AgentAssistant] Service initialized successfully");
    } catch (error: unknown) {
      logger.error(" [AgentAssistant] Failed to initialize:", error);
      throw error;
    }
  }

  async process(request: AgentAssistantRequest): Promise<AIResponse> {
    switch (request.type) {
      case "chat_query":
        return await this.handleChatQuery(request);
      case "workflow_guidance":
        return await this.provideWorkflowGuidance(request);
      case "context_help":
        return await this.provideContextHelp(request);
      case "quick_search":
        return await this.performQuickSearch(request);
      case "auto_complete":
        return await this.provideAutoComplete(request);
      default:
        return {
          success: false,
          error: `Unsupported request type: ${request.type}`,
        };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const docHealthy = await this.documentIntelligence.healthCheck();
      const ticketHealthy = await this.ticketIntelligence.healthCheck();
      return docHealthy && ticketHealthy;
    } catch (error: unknown) {
      logger.error(" [AgentAssistant] Health check failed:", error);
      return false;
    }
  }

  private async handleChatQuery(
    request: AgentAssistantRequest,
  ): Promise<AIResponse> {
    try {
      const { message, session_id, agent_id, ticket_context } = request.data;

      if (!message || !session_id || !agent_id) {
        return {
          success: false,
          error: "Message, session ID, and agent ID are required",
        };
      }

      const session = this.getOrCreateSession(
        session_id,
        agent_id,
        request.context,
      );

      const searchResponse = await this.searchRelevantInfo(
        message,
        ticket_context,
      );
      const chatResponse = await this.generateChatResponse(
        message,
        searchResponse.data || [],
        session,
        ticket_context,
      );

      this.addMessageToSession(session, {
        id: this.generateMessageId(),
        type: "user",
        content: message,
        timestamp: new Date(),
      });

      this.addMessageToSession(session, {
        id: this.generateMessageId(),
        type: "assistant",
        content: chatResponse.message,
        timestamp: new Date(),
        sources: chatResponse.sources,
        confidence: chatResponse.confidence_score,
      });

      return {
        success: true,
        data: chatResponse,
        confidence: chatResponse.confidence_score,
        sources: chatResponse.sources?.map((s) => s.id),
      };
    } catch (error: unknown) {
      logger.error(" [AgentAssistant] Chat query failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async provideWorkflowGuidance(
    request: AgentAssistantRequest,
  ): Promise<AIResponse> {
    try {
      const { current_step, ticket_context } = request.data;

      if (!current_step) {
        return {
          success: false,
          error: "Current step is required",
        };
      }

      const guidance = await this.generateWorkflowGuidance(
        current_step,
        ticket_context,
      );

      return {
        success: true,
        data: guidance,
        confidence: 0.8,
      };
    } catch (error: unknown) {
      logger.error(" [AgentAssistant] Workflow guidance failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async provideContextHelp(
    request: AgentAssistantRequest,
  ): Promise<AIResponse> {
    try {
      const { ticket_context } = request.data;

      if (!ticket_context) {
        return {
          success: false,
          error: "Ticket context is required",
        };
      }

      const analysis = await this.ticketIntelligence.execute({
        type: "analyze_ticket",
        data: { ticket_data: ticket_context },
      });

      if (!analysis.success) {
        return analysis;
      }

      const contextHelp = this.formatContextHelp(analysis.data, ticket_context);

      return {
        success: true,
        data: contextHelp,
        confidence: analysis.confidence || 0.7,
        sources: analysis.sources,
      };
    } catch (error: unknown) {
      logger.error(" [AgentAssistant] Context help failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async performQuickSearch(
    request: AgentAssistantRequest,
  ): Promise<AIResponse> {
    try {
      const { search_query, max_results = 5 } = request.data;

      if (!search_query) {
        return {
          success: false,
          error: "Search query is required",
        };
      }

      const searchResponse = await this.documentIntelligence.execute({
        type: "search_documents",
        data: {
          query: search_query,
          search_options: {
            size: max_results,
            search_type: "hybrid",
          },
        },
      });

      if (!searchResponse.success) {
        return searchResponse;
      }

      const quickResults = this.formatQuickSearchResults(searchResponse.data);

      return {
        success: true,
        data: quickResults,
        confidence: searchResponse.confidence || 0.8,
        sources: searchResponse.sources,
      };
    } catch (error: unknown) {
      logger.error(" [AgentAssistant] Quick search failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async provideAutoComplete(
    request: AgentAssistantRequest,
  ): Promise<AIResponse> {
    try {
      const { partial_text, ticket_context } = request.data;

      if (!partial_text) {
        return {
          success: false,
          error: "Partial text is required",
        };
      }

      const suggestions = await this.generateAutoCompleteSuggestions(
        partial_text,
        ticket_context,
      );

      return {
        success: true,
        data: { suggestions },
        confidence: 0.9,
      };
    } catch (error: unknown) {
      logger.error(" [AgentAssistant] Auto complete failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async searchRelevantInfo(
    query: string,
    context?: any,
  ): Promise<AIResponse> {
    return await this.documentIntelligence.execute({
      type: "search_documents",
      data: {
        query,
        search_options: {
          size: 5,
          search_type: "hybrid",
        },
        context: context
          ? {
              support_group: context.assignment_group,
              technology_stack: this.extractTechnologies(query),
              business_unit: context.business_unit,
            }
          : undefined,
      },
    });
  }

  private async generateChatResponse(
    message: string,
    searchResults: any[],
    session: ChatSession,
    ticketContext?: any,
  ): Promise<ChatResponse> {
    const sources = searchResults.map((result, index) => ({
      type: this.determineSourceType(result.document_type),
      id: result.id,
      title: result.title,
      relevance_score: result.score,
      excerpt: result.content.substring(0, 200) + "...",
    })) as ChatSource[];

    let response = this.generateResponseFromSources(message, searchResults);

    const suggestedActions = this.generateSuggestedActions(
      message,
      ticketContext,
    );
    const requiresEscalation = this.assessEscalationNeed(
      message,
      ticketContext,
    );
    const confidence = this.calculateResponseConfidence(searchResults, message);

    if (sources.length === 0) {
      response =
        "I couldn't find specific documentation for your query. Let me suggest some general troubleshooting steps or you might want to escalate to a specialist.";
    }

    return {
      message: response,
      sources,
      suggested_actions: suggestedActions,
      confidence_score: confidence,
      requires_escalation: requiresEscalation,
    };
  }

  private async generateWorkflowGuidance(
    currentStep: string,
    ticketContext?: any,
  ): Promise<WorkflowGuidance> {
    const nextActions = this.getNextActions(currentStep, ticketContext);
    const bestPractices = this.getBestPractices(currentStep);
    const escalationCriteria = this.getEscalationCriteria(currentStep);
    const qualityCheckpoints = this.getQualityCheckpoints(currentStep);

    return {
      current_step: currentStep,
      next_actions: nextActions,
      best_practices: bestPractices,
      escalation_criteria: escalationCriteria,
      quality_checkpoints: qualityCheckpoints,
    };
  }

  private formatContextHelp(ticketAnalysis: any, ticketContext: any): any {
    return {
      classification: ticketAnalysis.classification,
      similar_cases: ticketAnalysis.similar_tickets?.slice(0, 3),
      quick_actions: ticketAnalysis.resolution_suggestions?.slice(0, 3),
      estimated_time: ticketAnalysis.estimated_resolution_time,
      escalation_risk: {
        level:
          ticketAnalysis.escalation_risk > 0.7
            ? "High"
            : ticketAnalysis.escalation_risk > 0.4
              ? "Medium"
              : "Low",
        score: ticketAnalysis.escalation_risk,
      },
    };
  }

  private formatQuickSearchResults(searchResults: any[]): any[] {
    return searchResults.map((result) => ({
      id: result.id,
      title: result.title,
      summary: result.content.substring(0, 150) + "...",
      relevance: result.score,
      type: result.document_type,
      source: result.file_path,
    }));
  }

  private async generateAutoCompleteSuggestions(
    partialText: string,
    context?: any,
  ): Promise<string[]> {
    const commonPhrases = [
      "Please check the system logs for",
      "Have you tried restarting the",
      "This appears to be related to",
      "The issue might be caused by",
      "Please verify the configuration for",
      "Try executing the following command:",
      "Contact the system administrator if",
      "This is a known issue with",
      "Please update the documentation with",
      "The root cause appears to be",
    ];

    return commonPhrases
      .filter((phrase) =>
        phrase.toLowerCase().startsWith(partialText.toLowerCase()),
      )
      .slice(0, 5);
  }

  private getOrCreateSession(
    sessionId: string,
    agentId: string,
    context?: AIContext,
  ): ChatSession {
    let session = this.chatSessions.get(sessionId);

    if (!session) {
      session = {
        session_id: sessionId,
        agent_id: agentId,
        messages: [],
        context: context || {},
        created_at: new Date(),
        last_activity: new Date(),
      };
      this.chatSessions.set(sessionId, session);
    } else {
      session.last_activity = new Date();
    }

    return session;
  }

  private addMessageToSession(
    session: ChatSession,
    message: ChatMessage,
  ): void {
    session.messages.push(message);

    if (session.messages.length > this.config.max_chat_history) {
      session.messages.shift();
    }

    session.last_activity = new Date();
  }

  private generateResponseFromSources(query: string, sources: any[]): string {
    if (sources.length === 0) {
      return "I couldn't find relevant information in our knowledge base. Could you provide more details?";
    }

    const bestMatch = sources[0];
    const excerpt = bestMatch.content.substring(0, 300);

    return `Based on our documentation, ${excerpt}... Would you like me to provide more specific guidance for your situation?`;
  }

  private generateSuggestedActions(message: string, context?: any): string[] {
    const actions = [];
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("error") || lowerMessage.includes("issue")) {
      actions.push("Check system logs");
      actions.push("Verify recent changes");
    }

    if (lowerMessage.includes("performance") || lowerMessage.includes("slow")) {
      actions.push("Monitor system resources");
      actions.push("Check database performance");
    }

    if (
      lowerMessage.includes("connection") ||
      lowerMessage.includes("network")
    ) {
      actions.push("Test network connectivity");
      actions.push("Verify firewall rules");
    }

    actions.push("Document findings");

    return actions.slice(0, 4);
  }

  private assessEscalationNeed(message: string, context?: any): boolean {
    const escalationKeywords = [
      "critical",
      "urgent",
      "outage",
      "production",
      "escalate",
    ];
    const lowerMessage = message.toLowerCase();

    return escalationKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  private calculateResponseConfidence(sources: any[], query: string): number {
    if (sources.length === 0) return 0.3;

    const avgScore =
      sources.reduce((sum, source) => sum + source.score, 0) / sources.length;
    const queryLength = query.length;

    return Math.min(avgScore + (queryLength > 50 ? 0.1 : 0), 1.0);
  }

  private extractTechnologies(text: string): string[] {
    const techKeywords = [
      "oracle",
      "postgres",
      "aws",
      "docker",
      "java",
      "python",
    ];
    const lowerText = text.toLowerCase();

    return techKeywords.filter((tech) => lowerText.includes(tech));
  }

  private determineSourceType(
    documentType: string,
  ): "document" | "ticket" | "procedure" {
    if (documentType.includes("procedure")) return "procedure";
    if (documentType.includes("ticket")) return "ticket";
    return "document";
  }

  private getNextActions(currentStep: string, context?: any): WorkflowAction[] {
    const actions: WorkflowAction[] = [];

    switch (currentStep.toLowerCase()) {
      case "initial_analysis":
        actions.push({
          id: "gather_info",
          description: "Gather additional information from the user",
          estimated_time: 10,
        });
        actions.push({
          id: "check_similar",
          description: "Search for similar resolved tickets",
          estimated_time: 5,
        });
        break;

      case "investigation":
        actions.push({
          id: "reproduce_issue",
          description: "Attempt to reproduce the reported issue",
          estimated_time: 20,
        });
        actions.push({
          id: "check_logs",
          description: "Review system and application logs",
          estimated_time: 15,
        });
        break;

      case "resolution":
        actions.push({
          id: "implement_fix",
          description: "Implement the identified solution",
          estimated_time: 30,
        });
        actions.push({
          id: "test_fix",
          description: "Test the implemented solution",
          estimated_time: 15,
        });
        break;
    }

    return actions;
  }

  private getBestPractices(currentStep: string): string[] {
    const practices: { [key: string]: string[] } = {
      initial_analysis: [
        "Always gather complete information before proceeding",
        "Document all symptoms and error messages",
        "Verify the business impact of the issue",
      ],
      investigation: [
        "Follow systematic troubleshooting approach",
        "Check recent changes before the issue occurred",
        "Maintain detailed investigation notes",
      ],
      resolution: [
        "Test solutions in non-production environment first",
        "Communicate changes to affected users",
        "Document the resolution for future reference",
      ],
    };

    return (
      practices[currentStep.toLowerCase()] || [
        "Follow established procedures",
        "Document all actions taken",
        "Communicate with stakeholders",
      ]
    );
  }

  private getEscalationCriteria(currentStep: string): string[] {
    return [
      "Unable to resolve within SLA timeframe",
      "Solution requires elevated permissions",
      "Issue affects critical business processes",
      "Root cause requires specialist expertise",
    ];
  }

  private getQualityCheckpoints(currentStep: string): string[] {
    return [
      "All information properly documented",
      "Solution tested and verified",
      "User confirmation received",
      "Knowledge base updated if needed",
    ];
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private startSessionCleanup(): void {
    setInterval(
      () => {
        const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

        for (const [sessionId, session] of this.chatSessions.entries()) {
          if (session.last_activity < cutoffTime) {
            this.chatSessions.delete(sessionId);
            logger.debug(
              `🧹 [AgentAssistant] Cleaned up session: ${sessionId}`,
            );
          }
        }
      },
      60 * 60 * 1000,
    ); // Run every hour
  }
}

export default AgentAssistantService;
