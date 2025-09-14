/**
 * Ticket Intelligence Service - AI-powered ticket analysis and resolution suggestions
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { AIService } from './AIServiceManager';
import { DocumentIntelligenceService } from './DocumentIntelligenceService';
import { ServiceNowAuthClient } from '../ServiceNowAuthClient';
import { logger } from '../../utils/Logger';
import {
  AIRequest,
  AIResponse,
  TicketAnalysis,
  TicketClassification,
  SimilarTicket,
  ResolutionSuggestion,
  SearchResult,
  SearchOptions
} from '../../types/AI';

export interface TicketIntelligenceRequest extends AIRequest {
  type: 'analyze_ticket' | 'find_similar_tickets' | 'suggest_resolution' | 'estimate_time' | 'assess_escalation_risk';
  data: {
    ticket_id?: string;
    ticket_data?: any;
    description?: string;
    short_description?: string;
    category?: string;
    subcategory?: string;
    assignment_group?: string;
    priority?: string;
    search_options?: SearchOptions;
  };
}

export interface TicketIntelligenceConfig {
  servicenow_config: {
    instance_url: string;
    auth_token: string;
  };
  document_intelligence: DocumentIntelligenceService;
  similarity_threshold: number;
  max_similar_tickets: number;
  max_suggestions: number;
}

interface TicketSimilarityScore {
  ticket_id: string;
  score: number;
  common_keywords: string[];
  category_match: boolean;
  technology_match: boolean;
}

export class TicketIntelligenceService extends AIService {
  private config: TicketIntelligenceConfig;
  private serviceNowService: ServiceNowAuthClient;
  private documentIntelligence: DocumentIntelligenceService;

  constructor(config: TicketIntelligenceConfig) {
    super('ticket-intelligence');
    this.config = config;
    this.serviceNowService = new ServiceNowAuthClient();
    this.documentIntelligence = config.document_intelligence;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('🎫 [TicketIntelligence] Initializing service...');

      if (!this.documentIntelligence.isInitialized) {
        await this.documentIntelligence.initialize();
      }

      const isValid = this.serviceNowService.isAuthValid();
      if (!isValid) {
        throw new Error('ServiceNow authentication is not valid');
      }

      this.initialized = true;
      logger.info('✅ [TicketIntelligence] Service initialized successfully');

    } catch (error) {
      logger.error('❌ [TicketIntelligence] Failed to initialize:', error);
      throw error;
    }
  }

  async process(request: TicketIntelligenceRequest): Promise<AIResponse> {
    switch (request.type) {
      case 'analyze_ticket':
        return await this.analyzeTicket(request);
      case 'find_similar_tickets':
        return await this.findSimilarTickets(request);
      case 'suggest_resolution':
        return await this.suggestResolution(request);
      case 'estimate_time':
        return await this.estimateResolutionTime(request);
      case 'assess_escalation_risk':
        return await this.assessEscalationRisk(request);
      default:
        return {
          success: false,
          error: `Unsupported request type: ${request.type}`
        };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const serviceNowHealthy = this.serviceNowService.isAuthValid();
      const documentIntelligenceHealthy = await this.documentIntelligence.healthCheck();
      return serviceNowHealthy && documentIntelligenceHealthy;
    } catch (error) {
      logger.error('❌ [TicketIntelligence] Health check failed:', error);
      return false;
    }
  }

  private async analyzeTicket(request: TicketIntelligenceRequest): Promise<AIResponse> {
    try {
      const { ticket_id, ticket_data } = request.data;

      let ticketInfo = ticket_data;

      if (ticket_id && !ticket_data) {
        try {
          const response = await this.serviceNowService.makeRequest('incident', 'GET', { sys_id: ticket_id });
          if (response && response.records && response.records.length > 0) {
            ticketInfo = response.records[0];
          } else {
            return {
              success: false,
              error: `Failed to retrieve ticket ${ticket_id}: No records found`
            };
          }
        } catch (error) {
          return {
            success: false,
            error: `Failed to retrieve ticket ${ticket_id}: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }

      if (!ticketInfo) {
        return {
          success: false,
          error: 'Ticket information is required'
        };
      }

      const classification = await this.classifyTicket(ticketInfo);
      const similarTickets = await this.findSimilarTicketsInternal(ticketInfo);
      const resolutionSuggestions = await this.generateResolutionSuggestions(ticketInfo, classification);
      const estimatedTime = await this.estimateResolutionTimeInternal(ticketInfo, classification, similarTickets);
      const escalationRisk = await this.assessEscalationRiskInternal(ticketInfo, classification);

      const analysis: TicketAnalysis = {
        ticket_id: ticket_id || ticketInfo.sys_id || 'unknown',
        classification,
        similar_tickets: similarTickets,
        resolution_suggestions: resolutionSuggestions,
        estimated_resolution_time: estimatedTime,
        escalation_risk: escalationRisk
      };

      return {
        success: true,
        data: analysis,
        confidence: classification.confidence,
        sources: resolutionSuggestions.map(s => s.source_id)
      };

    } catch (error) {
      logger.error('❌ [TicketIntelligence] Ticket analysis failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async findSimilarTickets(request: TicketIntelligenceRequest): Promise<AIResponse> {
    try {
      const { ticket_id, ticket_data, description, short_description } = request.data;

      let ticketInfo = ticket_data;

      if (ticket_id && !ticket_data) {
        try {
          const response = await this.serviceNowService.makeRequest('incident', 'GET', { sys_id: ticket_id });
          if (response && response.records && response.records.length > 0) {
            ticketInfo = response.records[0];
          }
        } catch (error) {
          logger.warn(`⚠️ [TicketIntelligence] Failed to retrieve ticket ${ticket_id}:`, error);
        }
      }

      if (!ticketInfo && !description && !short_description) {
        return {
          success: false,
          error: 'Ticket information, description, or short description is required'
        };
      }

      const searchText = ticketInfo?.short_description ||
                        ticketInfo?.description ||
                        short_description ||
                        description || '';

      const similarTickets = await this.findSimilarTicketsInternal(ticketInfo || {
        short_description: searchText,
        description: searchText
      });

      return {
        success: true,
        data: similarTickets,
        confidence: similarTickets.length > 0 ? similarTickets[0].similarity_score : 0
      };

    } catch (error) {
      logger.error('❌ [TicketIntelligence] Similar tickets search failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async suggestResolution(request: TicketIntelligenceRequest): Promise<AIResponse> {
    try {
      const { ticket_data, description } = request.data;

      if (!ticket_data && !description) {
        return {
          success: false,
          error: 'Ticket data or description is required'
        };
      }

      const ticketInfo = ticket_data || { description, short_description: description };
      const classification = await this.classifyTicket(ticketInfo);
      const suggestions = await this.generateResolutionSuggestions(ticketInfo, classification);

      return {
        success: true,
        data: suggestions,
        confidence: suggestions.length > 0 ? suggestions[0].confidence : 0,
        sources: suggestions.map(s => s.source_id)
      };

    } catch (error) {
      logger.error('❌ [TicketIntelligence] Resolution suggestion failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async estimateResolutionTime(request: TicketIntelligenceRequest): Promise<AIResponse> {
    try {
      const { ticket_data } = request.data;

      if (!ticket_data) {
        return {
          success: false,
          error: 'Ticket data is required'
        };
      }

      const classification = await this.classifyTicket(ticket_data);
      const similarTickets = await this.findSimilarTicketsInternal(ticket_data);
      const estimatedTime = await this.estimateResolutionTimeInternal(ticket_data, classification, similarTickets);

      return {
        success: true,
        data: { estimated_minutes: estimatedTime },
        confidence: 0.8
      };

    } catch (error) {
      logger.error('❌ [TicketIntelligence] Time estimation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async assessEscalationRisk(request: TicketIntelligenceRequest): Promise<AIResponse> {
    try {
      const { ticket_data } = request.data;

      if (!ticket_data) {
        return {
          success: false,
          error: 'Ticket data is required'
        };
      }

      const classification = await this.classifyTicket(ticket_data);
      const escalationRisk = await this.assessEscalationRiskInternal(ticket_data, classification);

      return {
        success: true,
        data: {
          escalation_risk: escalationRisk,
          risk_level: this.getRiskLevel(escalationRisk)
        },
        confidence: 0.75
      };

    } catch (error) {
      logger.error('❌ [TicketIntelligence] Escalation risk assessment failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async classifyTicket(ticketData: any): Promise<TicketClassification> {
    const text = `${ticketData.short_description || ''} ${ticketData.description || ''}`;
    const technologies = this.detectTechnologies(text);
    const category = this.determineCategory(text, ticketData);
    const severity = this.determineSeverity(ticketData);
    const supportGroup = this.determineSupportGroup(technologies, ticketData);

    return {
      technology: technologies,
      category,
      subcategory: ticketData.subcategory || undefined,
      severity,
      support_group: supportGroup,
      confidence: this.calculateClassificationConfidence(text, technologies)
    };
  }

  private async findSimilarTicketsInternal(ticketData: any): Promise<SimilarTicket[]> {
    const searchText = `${ticketData.short_description || ''} ${ticketData.description || ''}`;

    const searchResponse = await this.documentIntelligence.execute({
      type: 'search_documents',
      data: {
        query: searchText,
        search_options: {
          size: this.config.max_similar_tickets,
          search_type: 'hybrid'
        }
      }
    });

    if (!searchResponse.success || !searchResponse.data) {
      return [];
    }

    const searchResults: SearchResult[] = searchResponse.data;
    return searchResults
      .filter(result => result.score >= this.config.similarity_threshold)
      .map(result => ({
        ticket_id: result.id,
        ticket_number: this.extractTicketNumber(result.title),
        similarity_score: result.score,
        resolution_summary: this.extractResolutionSummary(result.content),
        resolution_time: this.estimateTimeFromContent(result.content)
      }));
  }

  private async generateResolutionSuggestions(
    ticketData: any,
    classification: TicketClassification
  ): Promise<ResolutionSuggestion[]> {
    const suggestions: ResolutionSuggestion[] = [];
    const searchText = `${ticketData.short_description || ''} ${classification.technology.join(' ')}`;

    const searchResponse = await this.documentIntelligence.execute({
      type: 'search_documents',
      data: {
        query: searchText,
        search_options: {
          size: this.config.max_suggestions,
          search_type: 'reranked'
        },
        context: {
          support_group: classification.support_group,
          technology_stack: classification.technology
        }
      }
    });

    if (searchResponse.success && searchResponse.data) {
      const results: SearchResult[] = searchResponse.data;

      results.forEach((result, index) => {
        const steps = this.extractSteps(result.content);
        if (steps.length > 0) {
          suggestions.push({
            id: `suggestion_${index + 1}`,
            title: result.title,
            description: this.generateSuggestionDescription(result.content),
            source_type: this.determineSourceType(result.document_type),
            source_id: result.id,
            confidence: result.score,
            estimated_time: this.estimateTimeFromSteps(steps),
            steps
          });
        }
      });
    }

    return suggestions;
  }

  private async estimateResolutionTimeInternal(
    ticketData: any,
    classification: TicketClassification,
    similarTickets: SimilarTicket[]
  ): Promise<number> {
    let baseTime = this.getBaseTimeForSeverity(classification.severity);

    if (similarTickets.length > 0) {
      const avgSimilarTime = similarTickets
        .filter(t => t.resolution_time)
        .reduce((sum, t) => sum + (t.resolution_time || 0), 0) / similarTickets.length;

      if (avgSimilarTime > 0) {
        baseTime = (baseTime + avgSimilarTime) / 2;
      }
    }

    const complexityMultiplier = this.getComplexityMultiplier(classification.technology);
    return Math.round(baseTime * complexityMultiplier);
  }

  private async assessEscalationRiskInternal(
    ticketData: any,
    classification: TicketClassification
  ): Promise<number> {
    let risk = 0;

    if (classification.severity === 'Critical') risk += 0.4;
    else if (classification.severity === 'High') risk += 0.2;

    if (classification.technology.length > 2) risk += 0.1;

    const text = `${ticketData.short_description || ''} ${ticketData.description || ''}`;
    const escalationKeywords = ['urgent', 'escalate', 'manager', 'critical', 'outage', 'down'];
    const keywordMatches = escalationKeywords.filter(keyword =>
      text.toLowerCase().includes(keyword)
    ).length;

    risk += keywordMatches * 0.1;

    if (ticketData.priority === '1 - Critical') risk += 0.3;
    else if (ticketData.priority === '2 - High') risk += 0.15;

    return Math.min(risk, 1.0);
  }

  private detectTechnologies(text: string): string[] {
    const techKeywords = {
      'Oracle': ['oracle', 'plsql', 'toad', 'sqlplus'],
      'PostgreSQL': ['postgresql', 'postgres', 'pgadmin'],
      'AWS': ['aws', 'ec2', 'rds', 's3'],
      'Docker': ['docker', 'container', 'kubernetes'],
      'ServiceNow': ['servicenow', 'snow', 'itsm']
    };

    const detected: string[] = [];
    const lowerText = text.toLowerCase();

    for (const [tech, keywords] of Object.entries(techKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        detected.push(tech);
      }
    }

    return detected;
  }

  private determineCategory(text: string, ticketData: any): string {
    if (ticketData.category) return ticketData.category;

    const lowerText = text.toLowerCase();
    if (lowerText.includes('network') || lowerText.includes('connection')) return 'Network';
    if (lowerText.includes('database') || lowerText.includes('sql')) return 'Database';
    if (lowerText.includes('application') || lowerText.includes('software')) return 'Software';
    if (lowerText.includes('hardware') || lowerText.includes('server')) return 'Hardware';

    return 'General';
  }

  private determineSeverity(ticketData: any): 'Low' | 'Medium' | 'High' | 'Critical' {
    if (ticketData.severity) {
      const severity = ticketData.severity.toString();
      if (severity.includes('1') || severity.toLowerCase().includes('critical')) return 'Critical';
      if (severity.includes('2') || severity.toLowerCase().includes('high')) return 'High';
      if (severity.includes('3') || severity.toLowerCase().includes('medium')) return 'Medium';
    }

    if (ticketData.priority) {
      const priority = ticketData.priority.toString();
      if (priority.includes('1') || priority.toLowerCase().includes('critical')) return 'Critical';
      if (priority.includes('2') || priority.toLowerCase().includes('high')) return 'High';
    }

    return 'Medium';
  }

  private determineSupportGroup(technologies: string[], ticketData: any): string {
    if (ticketData.assignment_group) return ticketData.assignment_group;

    if (technologies.includes('Oracle') || technologies.includes('PostgreSQL')) {
      return 'Database Team';
    }
    if (technologies.includes('AWS') || technologies.includes('Docker')) {
      return 'Infrastructure Team';
    }
    if (technologies.includes('ServiceNow')) {
      return 'ServiceNow Team';
    }

    return 'General Support';
  }

  private calculateClassificationConfidence(text: string, technologies: string[]): number {
    const baseConfidence = 0.6;
    const techBonus = Math.min(technologies.length * 0.1, 0.2);
    const lengthBonus = Math.min(text.length / 1000, 0.2);
    return Math.min(baseConfidence + techBonus + lengthBonus, 1.0);
  }

  private extractTicketNumber(title: string): string {
    const match = title.match(/INC\d+|CHG\d+|REQ\d+/);
    return match ? match[0] : 'Unknown';
  }

  private extractResolutionSummary(content: string): string {
    const sentences = content.split('.').slice(0, 2);
    return sentences.join('.').substring(0, 200) + '...';
  }

  private estimateTimeFromContent(content: string): number {
    const timeKeywords = {
      'minutes': 1,
      'hour': 60,
      'hours': 60,
      'day': 480,
      'days': 480
    };

    for (const [keyword, multiplier] of Object.entries(timeKeywords)) {
      const match = content.toLowerCase().match(new RegExp(`(\\d+)\\s*${keyword}`));
      if (match) {
        return parseInt(match[1]) * multiplier;
      }
    }

    return 120; // Default 2 hours
  }

  private extractSteps(content: string): string[] {
    const stepPatterns = [
      /(\d+\.\s+[^\n]+)/g,
      /(Step\s+\d+[:\s]+[^\n]+)/gi,
      /(-\s+[^\n]+)/g
    ];

    for (const pattern of stepPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        return matches.slice(0, 10); // Max 10 steps
      }
    }

    return [];
  }

  private generateSuggestionDescription(content: string): string {
    return content.substring(0, 300).replace(/\n/g, ' ') + '...';
  }

  private determineSourceType(documentType: string): 'knowledge_base' | 'similar_ticket' | 'procedure' {
    if (documentType.includes('procedure')) return 'procedure';
    if (documentType.includes('ticket')) return 'similar_ticket';
    return 'knowledge_base';
  }

  private estimateTimeFromSteps(steps: string[]): number {
    return Math.max(steps.length * 15, 30); // 15 minutes per step, minimum 30 minutes
  }

  private getBaseTimeForSeverity(severity: string): number {
    switch (severity) {
      case 'Critical': return 60;
      case 'High': return 120;
      case 'Medium': return 240;
      case 'Low': return 480;
      default: return 240;
    }
  }

  private getComplexityMultiplier(technologies: string[]): number {
    if (technologies.length === 0) return 1.0;
    if (technologies.length === 1) return 1.2;
    if (technologies.length === 2) return 1.5;
    return 2.0;
  }

  private getRiskLevel(risk: number): string {
    if (risk >= 0.7) return 'High';
    if (risk >= 0.4) return 'Medium';
    return 'Low';
  }
}

export default TicketIntelligenceService;