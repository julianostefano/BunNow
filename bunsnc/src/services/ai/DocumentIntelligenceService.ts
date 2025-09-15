/**
 * Document Intelligence Service - AI-powered document processing and classification
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { AIService } from './AIServiceManager';
import { TikaClient } from '../../clients/TikaClient';
import { OpenSearchClient } from '../../clients/OpenSearchClient';
import { logger } from '../../utils/Logger';
import {
  AIRequest,
  AIResponse,
  DocumentMetadata,
  ProcessedDocument,
  DocumentClassification,
  DocumentChunk,
  SearchResult,
  SearchOptions,
  SearchContext
} from '../../types/AI';

export interface DocumentProcessingRequest extends AIRequest {
  type: 'process_document' | 'classify_document' | 'search_documents' | 'extract_chunks';
  data: {
    file_buffer?: Buffer;
    file_name?: string;
    document_id?: string;
    query?: string;
    search_options?: SearchOptions;
    context?: SearchContext;
    metadata?: Partial<DocumentMetadata>;
  };
}

export interface DocumentIntelligenceConfig {
  tika_url?: string;
  opensearch_config: {
    host: string;
    port: number;
    auth?: { username: string; password: string };
  };
  index_name: string;
  chunk_size: number;
  chunk_overlap: number;
}

export class DocumentIntelligenceService extends AIService {
  private tikaClient: TikaClient;
  private openSearchClient: OpenSearchClient;
  private config: DocumentIntelligenceConfig;

  constructor(config: DocumentIntelligenceConfig) {
    super('document-intelligence');
    this.config = config;
    this.tikaClient = new TikaClient(config.tika_url);
    this.openSearchClient = new OpenSearchClient(config.opensearch_config);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info(' [DocumentIntelligence] Initializing service...');

      const tikaHealthy = await this.tikaClient.healthCheck();
      if (!tikaHealthy) {
        throw new Error('Tika server is not available');
      }

      const openSearchHealthy = await this.openSearchClient.healthCheck();
      if (!openSearchHealthy) {
        throw new Error('OpenSearch cluster is not healthy');
      }

      this.initialized = true;
      logger.info(' [DocumentIntelligence] Service initialized successfully');

    } catch (error) {
      logger.error(' [DocumentIntelligence] Failed to initialize:', error);
      throw error;
    }
  }

  async process(request: DocumentProcessingRequest): Promise<AIResponse> {
    switch (request.type) {
      case 'process_document':
        return await this.processDocument(request);
      case 'classify_document':
        return await this.classifyDocument(request);
      case 'search_documents':
        return await this.searchDocuments(request);
      case 'extract_chunks':
        return await this.extractChunks(request);
      default:
        return {
          success: false,
          error: `Unsupported request type: ${request.type}`
        };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const tikaHealthy = await this.tikaClient.healthCheck();
      const openSearchHealthy = await this.openSearchClient.healthCheck();
      return tikaHealthy && openSearchHealthy;
    } catch (error) {
      logger.error(' [DocumentIntelligence] Health check failed:', error);
      return false;
    }
  }

  private async processDocument(request: DocumentProcessingRequest): Promise<AIResponse> {
    try {
      const { file_buffer, file_name, metadata } = request.data;

      if (!file_buffer || !file_name) {
        return {
          success: false,
          error: 'File buffer and file name are required'
        };
      }

      const mimeType = this.tikaClient.detectMimeType(file_name, file_buffer);
      const tikaResponse = await this.tikaClient.extractFull(file_buffer, mimeType);

      const processedDoc: ProcessedDocument = {
        id: this.generateDocumentId(file_name),
        metadata: {
          file_name,
          file_path: metadata?.file_path || `documents/${file_name}`,
          file_type: mimeType,
          file_size: file_buffer.length,
          support_group: metadata?.support_group,
          technology: metadata?.technology || [],
          business_unit: metadata?.business_unit,
          document_type: metadata?.document_type,
          created_date: metadata?.created_date || new Date(),
          modified_date: metadata?.modified_date || new Date()
        },
        content: tikaResponse.content,
        classification: await this.classifyContent(tikaResponse.content, file_name),
        chunks: await this.createChunks(tikaResponse.content, processedDoc.id)
      };

      await this.indexDocument(processedDoc);

      return {
        success: true,
        data: processedDoc,
        confidence: processedDoc.classification.confidence_score
      };

    } catch (error) {
      logger.error(' [DocumentIntelligence] Document processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async classifyDocument(request: DocumentProcessingRequest): Promise<AIResponse> {
    try {
      const { document_id, file_name } = request.data;

      if (!document_id && !file_name) {
        return {
          success: false,
          error: 'Document ID or file name is required'
        };
      }

      let content = '';

      if (document_id) {
        const doc = await this.getDocumentById(document_id);
        content = doc?.content || '';
      } else if (request.data.file_buffer && file_name) {
        const mimeType = this.tikaClient.detectMimeType(file_name, request.data.file_buffer);
        const tikaResponse = await this.tikaClient.extractText(request.data.file_buffer, mimeType);
        content = tikaResponse;
      }

      if (!content) {
        return {
          success: false,
          error: 'No content found for classification'
        };
      }

      const classification = await this.classifyContent(content, file_name || document_id || 'unknown');

      return {
        success: true,
        data: classification,
        confidence: classification.confidence_score
      };

    } catch (error) {
      logger.error(' [DocumentIntelligence] Document classification failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async searchDocuments(request: DocumentProcessingRequest): Promise<AIResponse> {
    try {
      const { query, search_options = {}, context } = request.data;

      if (!query) {
        return {
          success: false,
          error: 'Search query is required'
        };
      }

      let results: SearchResult[] = [];

      switch (search_options.search_type) {
        case 'neural':
          results = await this.openSearchClient.neuralSearch(
            this.config.index_name,
            {
              query_string: query,
              model_id: 'msmarco-distilbert-base-tas-b',
              size: search_options.size || 10,
              search_type: 'neural'
            },
            context
          );
          break;
        case 'hybrid':
          results = await this.openSearchClient.hybridSearch(
            this.config.index_name,
            query,
            search_options,
            context
          );
          break;
        case 'reranked':
          results = await this.openSearchClient.rerankSearch(
            this.config.index_name,
            query,
            search_options
          );
          break;
        default:
          results = await this.openSearchClient.hybridSearch(
            this.config.index_name,
            query,
            search_options,
            context
          );
      }

      return {
        success: true,
        data: results,
        sources: results.map(r => r.file_path),
        confidence: results.length > 0 ? results[0].score : 0
      };

    } catch (error) {
      logger.error(' [DocumentIntelligence] Document search failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async extractChunks(request: DocumentProcessingRequest): Promise<AIResponse> {
    try {
      const { document_id, file_buffer, file_name } = request.data;

      let content = '';

      if (document_id) {
        const doc = await this.getDocumentById(document_id);
        content = doc?.content || '';
      } else if (file_buffer && file_name) {
        const mimeType = this.tikaClient.detectMimeType(file_name, file_buffer);
        content = await this.tikaClient.extractText(file_buffer, mimeType);
      }

      if (!content) {
        return {
          success: false,
          error: 'No content found for chunking'
        };
      }

      const chunks = await this.createChunks(
        content,
        document_id || this.generateDocumentId(file_name || 'unknown')
      );

      return {
        success: true,
        data: chunks,
        confidence: 1.0
      };

    } catch (error) {
      logger.error(' [DocumentIntelligence] Chunk extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async classifyContent(content: string, fileName: string): Promise<DocumentClassification> {
    const technologies = this.detectTechnologies(content);
    const supportGroup = this.detectSupportGroup(content, technologies);
    const documentType = this.detectDocumentType(content, fileName);
    const criticality = this.assessCriticality(content);
    const securityLevel = this.assessSecurityLevel(content);

    return {
      technology: technologies,
      support_group: supportGroup,
      document_type: documentType,
      criticality,
      security_level: securityLevel,
      confidence_score: this.calculateClassificationConfidence(content, technologies.length)
    };
  }

  private detectTechnologies(content: string): string[] {
    const techKeywords = {
      'Oracle': ['oracle', 'plsql', 'pl/sql', 'sqlplus', 'toad', 'tns', 'listener'],
      'PostgreSQL': ['postgresql', 'postgres', 'pgadmin', 'psql', 'pg_dump'],
      'AWS': ['aws', 'ec2', 'rds', 's3', 'lambda', 'cloudformation'],
      'Docker': ['docker', 'dockerfile', 'container', 'kubernetes', 'k8s'],
      'Java': ['java', 'spring', 'maven', 'gradle', 'tomcat'],
      'Python': ['python', 'django', 'flask', 'pip', 'conda'],
      'ServiceNow': ['servicenow', 'snow', 'incident', 'change request', 'workflow']
    };

    const detectedTechs: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const [tech, keywords] of Object.entries(techKeywords)) {
      const matches = keywords.filter(keyword => lowerContent.includes(keyword));
      if (matches.length > 0) {
        detectedTechs.push(tech);
      }
    }

    return detectedTechs;
  }

  private detectSupportGroup(content: string, technologies: string[]): string {
    if (technologies.includes('Oracle') || technologies.includes('PostgreSQL')) {
      return 'Database Team';
    }
    if (technologies.includes('AWS') || technologies.includes('Docker')) {
      return 'Infrastructure Team';
    }
    if (technologies.includes('Java') || technologies.includes('Python')) {
      return 'Development Team';
    }
    if (technologies.includes('ServiceNow')) {
      return 'ServiceNow Team';
    }
    return 'General Support';
  }

  private detectDocumentType(content: string, fileName: string): string {
    const lowerContent = content.toLowerCase();
    const lowerFileName = fileName.toLowerCase();

    if (lowerContent.includes('procedure') || lowerContent.includes('step') || lowerContent.includes('instructions')) {
      return 'procedure';
    }
    if (lowerContent.includes('troubleshooting') || lowerContent.includes('error') || lowerContent.includes('issue')) {
      return 'troubleshooting';
    }
    if (lowerFileName.includes('manual') || lowerContent.includes('documentation')) {
      return 'manual';
    }
    if (lowerContent.includes('configuration') || lowerContent.includes('setup')) {
      return 'configuration';
    }
    return 'knowledge_base';
  }

  private assessCriticality(content: string): string {
    const lowerContent = content.toLowerCase();
    const criticalWords = ['critical', 'urgent', 'emergency', 'outage', 'down', 'failure'];
    const highWords = ['important', 'priority', 'escalate', 'major'];

    const criticalCount = criticalWords.filter(word => lowerContent.includes(word)).length;
    const highCount = highWords.filter(word => lowerContent.includes(word)).length;

    if (criticalCount > 0) return 'Critical';
    if (highCount > 0) return 'High';
    return 'Medium';
  }

  private assessSecurityLevel(content: string): string {
    const lowerContent = content.toLowerCase();
    const confidentialWords = ['password', 'credential', 'secret', 'token', 'private key'];

    if (confidentialWords.some(word => lowerContent.includes(word))) {
      return 'Confidential';
    }
    return 'Internal';
  }

  private calculateClassificationConfidence(content: string, techCount: number): number {
    const baseConfidence = 0.7;
    const techBonus = Math.min(techCount * 0.1, 0.2);
    const lengthBonus = Math.min(content.length / 10000, 0.1);
    return Math.min(baseConfidence + techBonus + lengthBonus, 1.0);
  }

  private async createChunks(content: string, documentId: string): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    const chunkSize = this.config.chunk_size;
    const overlap = this.config.chunk_overlap;

    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < content.length) {
      const endIndex = Math.min(startIndex + chunkSize, content.length);
      const chunkText = content.slice(startIndex, endIndex);

      const chunk: DocumentChunk = {
        id: `${documentId}_chunk_${chunkIndex}`,
        parent_document_id: documentId,
        chunk_index: chunkIndex,
        chunk_text: chunkText,
        chunk_type: this.determineChunkType(chunkText)
      };

      chunks.push(chunk);

      startIndex = endIndex - overlap;
      chunkIndex++;

      if (startIndex >= content.length) break;
    }

    return chunks;
  }

  private determineChunkType(text: string): 'paragraph' | 'table' | 'code' | 'list' {
    if (text.includes('|') && text.includes('\n')) return 'table';
    if (text.includes('```') || text.match(/^\s*(function|class|def|SELECT|UPDATE|INSERT)/m)) return 'code';
    if (text.match(/^\s*[-*+]\s/m) || text.match(/^\s*\d+\.\s/m)) return 'list';
    return 'paragraph';
  }

  private generateDocumentId(fileName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `doc_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}_${random}`;
  }

  private async indexDocument(doc: ProcessedDocument): Promise<void> {
    // This would implement OpenSearch indexing
    logger.debug(` [DocumentIntelligence] Would index document: ${doc.id}`);
  }

  private async getDocumentById(documentId: string): Promise<ProcessedDocument | null> {
    // This would implement OpenSearch document retrieval
    logger.debug(` [DocumentIntelligence] Would retrieve document: ${documentId}`);
    return null;
  }
}

export default DocumentIntelligenceService;