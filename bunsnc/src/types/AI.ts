/**
 * AI Services Type Definitions
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface AIRequest {
  type: string;
  data: any;
  context?: AIContext;
}

export interface AIResponse {
  success: boolean;
  data?: any;
  error?: string;
  confidence?: number;
  sources?: string[];
  processing_time_ms?: number;
}

export interface AIContext {
  agent_id?: string;
  support_group?: string;
  ticket_id?: string;
  session_id?: string;
  user_preferences?: Record<string, any>;
}

export interface AIServiceMetrics {
  requests_total: number;
  requests_successful: number;
  avg_response_time_ms: number;
  last_request_time: Date | null;
}

export interface SearchContext {
  support_group?: string;
  technology_stack?: string[];
  ticket_context?: string;
  business_unit?: string;
  priority?: string;
}

export interface SearchOptions {
  size?: number;
  search_type?: 'neural' | 'sparse' | 'hybrid' | 'reranked';
  filters?: Record<string, any>;
  include_source?: boolean;
}

export interface SearchResult {
  id: string;
  score: number;
  title: string;
  content: string;
  file_path: string;
  technology: string[];
  business_unit: string[];
  document_type: string;
  created_date: string;
  modified_date: string;
}

export interface DocumentMetadata {
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  support_group?: string;
  technology?: string[];
  business_unit?: string;
  document_type?: string;
  created_date?: Date;
  modified_date?: Date;
}

export interface ProcessedDocument {
  id: string;
  metadata: DocumentMetadata;
  content: string;
  classification: DocumentClassification;
  embeddings?: number[];
  chunks?: DocumentChunk[];
}

export interface DocumentClassification {
  technology: string[];
  support_group: string;
  document_type: string;
  criticality: string;
  security_level: string;
  confidence_score: number;
}

export interface DocumentChunk {
  id: string;
  parent_document_id: string;
  chunk_index: number;
  chunk_text: string;
  chunk_type: 'paragraph' | 'table' | 'code' | 'list';
  embeddings?: number[];
}

export interface TicketAnalysis {
  ticket_id: string;
  classification: TicketClassification;
  similar_tickets: SimilarTicket[];
  resolution_suggestions: ResolutionSuggestion[];
  estimated_resolution_time: number;
  escalation_risk: number;
}

export interface TicketClassification {
  technology: string[];
  category: string;
  subcategory?: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  support_group: string;
  confidence: number;
}

export interface SimilarTicket {
  ticket_id: string;
  ticket_number: string;
  similarity_score: number;
  resolution_summary?: string;
  resolution_time?: number;
}

export interface ResolutionSuggestion {
  id: string;
  title: string;
  description: string;
  source_type: 'knowledge_base' | 'similar_ticket' | 'procedure';
  source_id: string;
  confidence: number;
  estimated_time: number;
  steps: string[];
}

export interface ChatResponse {
  message: string;
  sources: ChatSource[];
  suggested_actions: string[];
  confidence_score: number;
  requires_escalation: boolean;
}

export interface ChatSource {
  type: 'document' | 'ticket' | 'procedure';
  id: string;
  title: string;
  relevance_score: number;
  excerpt: string;
}

export interface WorkflowGuidance {
  current_step: string;
  next_actions: WorkflowAction[];
  best_practices: string[];
  escalation_criteria: string[];
  quality_checkpoints: string[];
}

export interface WorkflowAction {
  id: string;
  description: string;
  estimated_time: number;
  required_permissions?: string[];
  documentation_link?: string;
  validation_criteria?: string[];
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: 'document' | 'technology' | 'group' | 'procedure';
  properties: Record<string, any>;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  relationship: string;
  weight: number;
}

export enum AIServiceType {
  DOCUMENT_INTELLIGENCE = 'document-intelligence',
  TICKET_INTELLIGENCE = 'ticket-intelligence',
  AGENT_ASSISTANT = 'agent-assistant',
  KNOWLEDGE_GRAPH = 'knowledge-graph'
}