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
  search_type?: "neural" | "sparse" | "hybrid" | "reranked";
  filters?: Record<string, any>;
  include_source?: boolean;
}

// Milestone 5: Knowledge Management Integration Types

export interface DocumentUploadMetadata {
  filename?: string;
  title?: string;
  support_group?: string;
  technology?: string;
  document_type?: string;
  file_size?: number;
  uploaded_by: string;
  creation_date?: Date;
  last_modified?: Date;
}

export interface ProcessingResult {
  success: boolean;
  document_id?: string;
  classification?: any;
  indexed_collections?: string[];
  processing_time_ms: number;
  errors?: string[];
  extracted_metadata?: any;
}

export interface DocumentValidation {
  valid: boolean;
  errors: string[];
  detected_format: string;
}

export interface GapAnalysis {
  analysis_date: string;
  missing_topics: Array<{
    topic: string;
    gap_severity: string;
    search_frequency: number;
  }>;
  suggested_documents: Array<{
    title: string;
    priority: string;
    estimated_effort: string;
  }>;
  update_candidates: Array<{
    technology: string;
    reason: string;
  }>;
  coverage_score: number;
  recommendations: string[];
}

export interface KnowledgeGraphUpdate {
  document_id: string;
  classification: any;
  relationships: any[];
}

export interface NotificationResult {
  notifications_sent: number;
  groups_notified: string[];
}

export interface EntityRelationship {
  source: string;
  target: string;
  relationship: string;
}

// Knowledge Graph Types

export interface KnowledgeGraphNode {
  node_id: string;
  type: "document" | "entity";
  title: string;
  technology: string[];
  support_group: string[];
  document_type: string;
  criticality: "low" | "medium" | "high" | "critical";
  metadata: any;
  related_documents?: string[];
  connections: number;
  created_at: Date;
  updated_at: Date;
}

export interface KnowledgeGraphEdge {
  edge_id: string;
  source: string;
  target: string;
  relationship_type: string;
  strength: number;
  source_document: string;
  created_at: Date;
  updated_at: Date;
}

export interface KnowledgeGraphQuery {
  query_type:
    | "find_related_documents"
    | "get_technology_map"
    | "analyze_support_coverage"
    | "find_knowledge_clusters"
    | "get_expertise_mapping";
  parameters: any;
}

export interface TechnologyMap {
  technologies: Array<{
    name: string;
    document_count: number;
    complexity_score: number;
    support_groups: string[];
  }>;
  total_technologies: number;
}

export interface SupportGroupMap {
  support_groups: Array<{
    name: string;
    document_count: number;
    technologies_covered: string[];
    criticality_level: string;
    coverage_score: number;
  }>;
  total_groups: number;
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
  chunk_type: "paragraph" | "table" | "code" | "list";
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
  severity: "Low" | "Medium" | "High" | "Critical";
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
  source_type: "knowledge_base" | "similar_ticket" | "procedure";
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
  type: "document" | "ticket" | "procedure";
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
  type: "document" | "technology" | "group" | "procedure";
  properties: Record<string, any>;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  relationship: string;
  weight: number;
}

export enum AIServiceType {
  DOCUMENT_INTELLIGENCE = "document-intelligence",
  TICKET_INTELLIGENCE = "ticket-intelligence",
  AGENT_ASSISTANT = "agent-assistant",
  KNOWLEDGE_GRAPH = "knowledge-graph",
}
