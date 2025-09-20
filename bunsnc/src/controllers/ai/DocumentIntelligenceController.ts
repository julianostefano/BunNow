/**
 * Document Intelligence AI Controller
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from '../../utils/Logger';
import { TikaClient } from '../../clients/TikaClient';
import { EmbeddingClient } from '../../clients/EmbeddingClient';
import { RerankClient } from '../../clients/RerankClient';
import { OpenSearchClient } from '../../clients/OpenSearchClient';
import type {
  DocumentProcessingRequest,
  DocumentProcessingResponse,
  DocumentSearchRequest,
  DocumentSearchResponse,
  DocumentClassificationResult,
  DocumentNERResult,
  KnowledgeExtractionResult
} from '../../types/AI';

export interface DocumentIntelligenceConfig {
  max_document_size: number;
  supported_formats: string[];
  extraction_timeout: number;
  classification_threshold: number;
  ner_confidence_threshold: number;
  chunk_size: number;
  chunk_overlap: number;
}

export class DocumentIntelligenceController {
  private tika: TikaClient;
  private embedding: EmbeddingClient;
  private rerank: RerankClient;
  private openSearch: OpenSearchClient;
  private config: DocumentIntelligenceConfig;

  constructor() {
    try {
      this.tika = new TikaClient();
      this.embedding = new EmbeddingClient();
      this.rerank = new RerankClient();

      // Validate OpenSearch environment variables
      const openSearchHost = process.env.OPENSEARCH_HOST;
      const openSearchPort = process.env.OPENSEARCH_PORT;

      if (!openSearchHost || !openSearchPort) {
        logger.warn(`⚠️ [DocumentIntelligenceController] OpenSearch environment variables missing. Using defaults: host=${openSearchHost || '10.219.8.210'}, port=${openSearchPort || '9200'}`);
      }

      this.openSearch = new OpenSearchClient({
        host: openSearchHost || '10.219.8.210',
        port: parseInt(openSearchPort || '9200'),
        ssl: false,
        timeout: 30000
      });
    } catch (error) {
      logger.error(`❌ [DocumentIntelligenceController] Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }

    this.config = {
      max_document_size: 50 * 1024 * 1024, // 50MB
      supported_formats: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/html',
        'application/rtf'
      ],
      extraction_timeout: 60000,
      classification_threshold: 0.7,
      ner_confidence_threshold: 0.8,
      chunk_size: 1000,
      chunk_overlap: 200
    };
  }

  async processDocument(request: DocumentProcessingRequest): Promise<DocumentProcessingResponse> {
    const startTime = Date.now();

    try {
      logger.info(`📄 [DocumentIntelligence] Processing document: ${request.filename}`);

      // 1. Validate document
      this.validateDocument(request);

      // 2. Extract content and metadata with Tika
      const tikaResult = await this.tika.extractFull(
        Buffer.from(request.content_buffer),
        request.content_type
      );

      // 3. Perform NER (Named Entity Recognition)
      const nerResults = await this.extractNamedEntities(tikaResult.metadata);

      // 4. Classify document
      const classification = await this.classifyDocument(tikaResult.content, request.filename);

      // 5. Chunk document for embedding
      const chunks = this.chunkDocument(tikaResult.content);

      // 6. Generate embeddings for chunks
      const embeddings = await this.embedding.generateEmbeddings(
        chunks.map(chunk => chunk.text)
      );

      // 7. Extract knowledge elements
      const knowledgeExtraction = await this.extractKnowledge(tikaResult.content, classification);

      const response: DocumentProcessingResponse = {
        document_id: request.document_id || this.generateDocumentId(),
        filename: request.filename,
        processing_result: {
          content: tikaResult.content,
          metadata: tikaResult.metadata,
          ner_results: nerResults,
          classification,
          chunks: chunks.map((chunk, index) => ({
            ...chunk,
            embedding: embeddings.data.embeddings[index]
          })),
          knowledge_extraction: knowledgeExtraction,
          processing_time_ms: Date.now() - startTime
        },
        indexing_info: {
          chunks_created: chunks.length,
          embedding_model: embeddings.model,
          index_strategy: 'vector_hybrid'
        }
      };

      // 8. Index document in OpenSearch
      await this.indexDocument(response);

      logger.info(` [DocumentIntelligence] Processed ${request.filename} in ${response.processing_result.processing_time_ms}ms`);
      return response;

    } catch (error) {
      logger.error(' [DocumentIntelligence] Document processing failed:', error);
      throw error;
    }
  }

  async searchDocuments(request: DocumentSearchRequest): Promise<DocumentSearchResponse> {
    const startTime = Date.now();

    try {
      logger.info(` [DocumentIntelligence] Searching documents: "${request.query}"`);

      // 1. Generate query embedding
      const queryEmbedding = await this.embedding.generateEmbeddings([request.query]);

      // 2. Perform hybrid search
      const searchResults = await this.openSearch.hybridSearch({
        index: 'technical_documents',
        query_text: request.query,
        query_vector: queryEmbedding.data.embeddings[0],
        size: (request.max_results || 20) * 2, // Get more for reranking
        filters: this.buildSearchFilters(request),
        weights: { text: 0.3, semantic: 0.7 }
      });

      // 3. Rerank results for better relevance
      const documents = searchResults.map(result => ({
        id: result._id,
        text: `${result._source.title || ''} ${result._source.content}`.substring(0, 1000)
      }));

      const rerankResponse = await this.rerank.rerank(
        request.query,
        documents,
        { top_k: request.max_results || 10 }
      );

      // 4. Build response with enhanced metadata
      const enhancedResults = await this.enhanceSearchResults(
        rerankResponse.results,
        searchResults,
        request.query
      );

      const response: DocumentSearchResponse = {
        query: request.query,
        results: enhancedResults,
        metadata: {
          total_found: searchResults.length,
          reranked: rerankResponse.results.length,
          processing_time_ms: Date.now() - startTime,
          search_strategy: 'hybrid_reranked',
          filters_applied: Object.keys(request.filters || {}).length
        }
      };

      logger.info(` [DocumentIntelligence] Found ${response.results.length} relevant documents in ${response.metadata.processing_time_ms}ms`);
      return response;

    } catch (error) {
      logger.error(' [DocumentIntelligence] Document search failed:', error);
      throw error;
    }
  }

  private validateDocument(request: DocumentProcessingRequest): void {
    if (!request.content_buffer || request.content_buffer.length === 0) {
      throw new Error('Document content is required');
    }

    if (request.content_buffer.length > this.config.max_document_size) {
      throw new Error(`Document size exceeds limit of ${this.config.max_document_size} bytes`);
    }

    if (!this.config.supported_formats.includes(request.content_type)) {
      throw new Error(`Unsupported document format: ${request.content_type}`);
    }
  }

  private async extractNamedEntities(metadata: any): Promise<DocumentNERResult[]> {
    const nerResults: DocumentNERResult[] = [];

    try {
      // Extract Portuguese entities from Tika metadata
      const nerFields = Object.keys(metadata).filter(key =>
        key.toLowerCase().includes('ner') ||
        key.toLowerCase().includes('entity') ||
        ['cpf', 'cnpj', 'email', 'phone'].some(entity => key.toLowerCase().includes(entity))
      );

      for (const field of nerFields) {
        const entities = metadata[field];
        if (Array.isArray(entities)) {
          entities.forEach(entity => {
            nerResults.push({
              entity_type: this.mapNERField(field),
              value: entity,
              confidence: this.config.ner_confidence_threshold,
              position: { start: -1, end: -1 } // Tika doesn't provide positions
            });
          });
        } else if (typeof entities === 'string' && entities.length > 0) {
          nerResults.push({
            entity_type: this.mapNERField(field),
            value: entities,
            confidence: this.config.ner_confidence_threshold,
            position: { start: -1, end: -1 }
          });
        }
      }

    } catch (error) {
      logger.warn(' [DocumentIntelligence] NER extraction failed:', error);
    }

    return nerResults;
  }

  private mapNERField(field: string): string {
    const fieldLower = field.toLowerCase();
    if (fieldLower.includes('person') || fieldLower.includes('people')) return 'PERSON';
    if (fieldLower.includes('organization') || fieldLower.includes('company')) return 'ORG';
    if (fieldLower.includes('location') || fieldLower.includes('place')) return 'LOC';
    if (fieldLower.includes('cpf')) return 'CPF';
    if (fieldLower.includes('cnpj')) return 'CNPJ';
    if (fieldLower.includes('email')) return 'EMAIL';
    if (fieldLower.includes('phone')) return 'PHONE';
    if (fieldLower.includes('money') || fieldLower.includes('currency')) return 'MONEY';
    if (fieldLower.includes('date')) return 'DATE';
    return 'MISC';
  }

  private async classifyDocument(content: string, filename: string): Promise<DocumentClassificationResult> {
    // Enhanced classification based on content analysis
    const categories = [
      'Oracle Database',
      'AWS Cloud',
      'PostgreSQL',
      'Network Infrastructure',
      'Security Policies',
      'Application Development',
      'System Administration',
      'Troubleshooting Guide'
    ];

    // Simple keyword-based classification (can be enhanced with ML)
    const contentLower = content.toLowerCase();
    const filenameLower = filename.toLowerCase();

    const scores = categories.map(category => {
      let score = 0;
      const keywords = this.getCategoryKeywords(category);

      keywords.forEach(keyword => {
        const keywordLower = keyword.toLowerCase();
        const contentMatches = (contentLower.match(new RegExp(keywordLower, 'g')) || []).length;
        const filenameMatches = filenameLower.includes(keywordLower) ? 5 : 0;
        score += contentMatches * 0.1 + filenameMatches;
      });

      return { category, score: Math.min(1.0, score / keywords.length) };
    }).sort((a, b) => b.score - a.score);

    return {
      primary_category: scores[0].category,
      confidence: scores[0].score,
      all_scores: scores.slice(0, 5),
      technology_stack: this.extractTechnologyStack(content),
      document_type: this.inferDocumentType(content, filename)
    };
  }

  private getCategoryKeywords(category: string): string[] {
    const keywordMap: Record<string, string[]> = {
      'Oracle Database': ['oracle', 'sqlplus', 'plsql', 'tnsnames', 'tablespace', 'dbms', 'rman'],
      'AWS Cloud': ['aws', 'ec2', 'lambda', 's3', 'cloudformation', 'vpc', 'iam'],
      'PostgreSQL': ['postgresql', 'postgres', 'psql', 'pgadmin', 'vacuum', 'analyze'],
      'Network Infrastructure': ['cisco', 'switch', 'router', 'vlan', 'firewall', 'vpn'],
      'Security Policies': ['security', 'access', 'authentication', 'authorization', 'compliance'],
      'Application Development': ['javascript', 'python', 'java', 'api', 'rest', 'microservice'],
      'System Administration': ['linux', 'windows', 'server', 'monitoring', 'backup', 'patch'],
      'Troubleshooting Guide': ['error', 'troubleshoot', 'solution', 'fix', 'debug', 'resolve']
    };

    return keywordMap[category] || [];
  }

  private extractTechnologyStack(content: string): string[] {
    const technologies = [
      'Oracle', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
      'Java', 'Python', 'JavaScript', 'TypeScript', 'C#',
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes',
      'Linux', 'Windows', 'Ubuntu', 'CentOS', 'RHEL'
    ];

    return technologies.filter(tech =>
      content.toLowerCase().includes(tech.toLowerCase())
    );
  }

  private inferDocumentType(content: string, filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (['md', 'txt'].includes(ext || '') && content.includes('#')) return 'Documentation';
    if (content.includes('SELECT') || content.includes('CREATE TABLE')) return 'SQL Script';
    if (content.includes('function') || content.includes('class')) return 'Code Documentation';
    if (content.includes('Step') || content.includes('Procedure')) return 'Process Guide';
    if (content.includes('Error') || content.includes('Problem')) return 'Troubleshooting';

    return 'Technical Document';
  }

  private chunkDocument(content: string): Array<{ text: string; metadata: any }> {
    const chunks: Array<{ text: string; metadata: any }> = [];
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 50);

    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length > this.config.chunk_size && currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          metadata: {
            chunk_index: chunkIndex++,
            word_count: currentChunk.split(/\s+/).length,
            char_count: currentChunk.length
          }
        });

        // Handle overlap
        const words = currentChunk.split(/\s+/);
        const overlapWords = Math.floor(this.config.chunk_overlap / (currentChunk.length / words.length));
        currentChunk = words.slice(-overlapWords).join(' ') + ' ';
      }

      currentChunk += paragraph + '\n\n';
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        metadata: {
          chunk_index: chunkIndex,
          word_count: currentChunk.split(/\s+/).length,
          char_count: currentChunk.length
        }
      });
    }

    return chunks;
  }

  private async extractKnowledge(content: string, classification: DocumentClassificationResult): Promise<KnowledgeExtractionResult> {
    // Extract key information based on document type
    const knowledge: KnowledgeExtractionResult = {
      key_concepts: [],
      procedures: [],
      commands: [],
      references: [],
      difficulty_level: 'medium'
    };

    try {
      // Extract commands/code blocks
      const codeBlocks = content.match(/```[\s\S]*?```|`[^`]+`/g) || [];
      knowledge.commands = codeBlocks.map(block =>
        block.replace(/```\w*\n?|```|`/g, '').trim()
      ).filter(cmd => cmd.length > 0).slice(0, 10);

      // Extract numbered procedures
      const procedures = content.match(/^\s*\d+\.\s+.*$/gm) || [];
      knowledge.procedures = procedures.slice(0, 10);

      // Extract key concepts (capitalized terms, technical terms)
      const concepts = content.match(/\b[A-Z][A-Za-z]{2,}\b/g) || [];
      knowledge.key_concepts = [...new Set(concepts)]
        .filter(concept => concept.length > 3)
        .slice(0, 20);

      // Extract references (URLs, file paths, etc.)
      const urlRegex = /https?:\/\/[^\s]+/g;
      const pathRegex = /[\/\\][\w\/\\.-]+/g;
      knowledge.references = [
        ...(content.match(urlRegex) || []),
        ...(content.match(pathRegex) || [])
      ].slice(0, 10);

      // Assess difficulty based on technical complexity
      const technicalIndicators = [
        'advanced', 'complex', 'enterprise', 'production',
        'architecture', 'performance', 'optimization', 'troubleshooting'
      ];

      const complexityScore = technicalIndicators.reduce((score, indicator) =>
        score + (content.toLowerCase().includes(indicator) ? 1 : 0), 0
      );

      knowledge.difficulty_level = complexityScore > 3 ? 'advanced' :
                                  complexityScore > 1 ? 'intermediate' : 'basic';

    } catch (error) {
      logger.warn(' [DocumentIntelligence] Knowledge extraction failed:', error);
    }

    return knowledge;
  }

  private async indexDocument(response: DocumentProcessingResponse): Promise<void> {
    try {
      const doc = response.processing_result;

      // Index main document
      await this.openSearch.index({
        index: 'technical_documents',
        id: response.document_id,
        body: {
          filename: response.filename,
          content: doc.content,
          title: doc.metadata.title || response.filename,
          classification: doc.classification,
          ner_entities: doc.ner_results,
          knowledge: doc.knowledge_extraction,
          metadata: doc.metadata,
          indexed_at: new Date().toISOString(),
          chunk_count: doc.chunks.length
        }
      });

      // Index individual chunks with embeddings
      const chunkPromises = doc.chunks.map((chunk, index) =>
        this.openSearch.index({
          index: 'document_chunks',
          id: `${response.document_id}_chunk_${index}`,
          body: {
            document_id: response.document_id,
            filename: response.filename,
            chunk_text: chunk.text,
            chunk_embedding: chunk.embedding,
            chunk_metadata: chunk.metadata,
            document_classification: doc.classification.primary_category,
            indexed_at: new Date().toISOString()
          }
        })
      );

      await Promise.all(chunkPromises);
      logger.info(`📚 [DocumentIntelligence] Indexed document ${response.document_id} with ${doc.chunks.length} chunks`);

    } catch (error) {
      logger.error(' [DocumentIntelligence] Document indexing failed:', error);
      throw error;
    }
  }

  private buildSearchFilters(request: DocumentSearchRequest): Record<string, any> {
    const filters: Record<string, any> = {};

    if (request.filters) {
      if (request.filters.document_type) {
        filters['classification.document_type'] = request.filters.document_type;
      }
      if (request.filters.technology_stack) {
        filters['classification.technology_stack'] = request.filters.technology_stack;
      }
      if (request.filters.date_range) {
        filters['metadata.Creation-Date'] = {
          gte: request.filters.date_range.from,
          lte: request.filters.date_range.to
        };
      }
    }

    return filters;
  }

  private async enhanceSearchResults(
    rerankResults: any[],
    originalResults: any[],
    query: string
  ): Promise<any[]> {
    return rerankResults.map(rerankResult => {
      const original = originalResults.find(r => r._id === rerankResult.document.id);
      if (!original) return null;

      return {
        document_id: original._id,
        filename: original._source.filename,
        title: original._source.title,
        content_preview: this.generateContentPreview(original._source.content, query),
        classification: original._source.classification,
        knowledge_elements: original._source.knowledge,
        relevance_score: rerankResult.relevance_score,
        search_score: original._score,
        metadata: {
          chunk_count: original._source.chunk_count,
          indexed_at: original._source.indexed_at,
          file_type: original._source.metadata['Content-Type']
        }
      };
    }).filter(result => result !== null);
  }

  private generateContentPreview(content: string, query: string, maxLength = 300): string {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);

    // Find sentences containing query terms
    const relevantSentences = sentences.filter(sentence =>
      queryTerms.some(term => sentence.toLowerCase().includes(term))
    );

    if (relevantSentences.length > 0) {
      let preview = relevantSentences[0].trim();
      if (preview.length > maxLength) {
        preview = preview.substring(0, maxLength) + '...';
      }
      return preview;
    }

    // Fallback to first sentences
    let preview = sentences.slice(0, 3).join('. ').trim();
    if (preview.length > maxLength) {
      preview = preview.substring(0, maxLength) + '...';
    }
    return preview;
  }

  private generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  async getConfig(): Promise<DocumentIntelligenceConfig> {
    return this.config;
  }

  async updateConfig(newConfig: Partial<DocumentIntelligenceConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    logger.info(' [DocumentIntelligence] Configuration updated');
  }
}