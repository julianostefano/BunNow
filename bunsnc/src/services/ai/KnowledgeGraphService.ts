/**
 * Knowledge Graph Service - Relationship Mapping and Analysis
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { setImmediate } from 'timers/promises';
import { performance } from 'perf_hooks';
import { MongoClient, Db, Collection } from 'mongodb';
import {
  AIRequest,
  AIResponse,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  KnowledgeGraphQuery,
  EntityRelationship,
  TechnologyMap,
  SupportGroupMap
} from '../../types/AI';

export interface GraphAnalytics {
  total_nodes: number;
  total_edges: number;
  most_connected_technologies: Array<{ name: string; connections: number }>;
  orphaned_documents: string[];
  cluster_analysis: Array<{ cluster_id: string; technologies: string[]; size: number }>;
  relationship_strengths: Array<{ source: string; target: string; strength: number }>;
}

export interface KnowledgeCluster {
  id: string;
  name: string;
  technologies: string[];
  support_groups: string[];
  document_count: number;
  expertise_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  last_updated: Date;
}

export interface ExpertiseMapping {
  technology: string;
  support_group: string;
  expert_agents: string[];
  document_coverage: number;
  knowledge_depth: number;
  recent_activity: number;
}

export class KnowledgeGraphService {
  private db: Db | null = null;
  private nodesCollection: Collection<KnowledgeGraphNode> | null = null;
  private edgesCollection: Collection<KnowledgeGraphEdge> | null = null;
  private clustersCollection: Collection<KnowledgeCluster> | null = null;
  private expertiseCollection: Collection<ExpertiseMapping> | null = null;
  private initializationPromise: Promise<void>;

  constructor() {
    this.initializationPromise = this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      const mongoUrl = process.env.MONGODB_URL || 'mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin';
      const client = new MongoClient(mongoUrl);
      await client.connect();

      this.db = client.db('bunsnc');
      this.nodesCollection = this.db.collection('knowledge_graph_nodes');
      this.edgesCollection = this.db.collection('knowledge_graph_edges');
      this.clustersCollection = this.db.collection('knowledge_clusters');
      this.expertiseCollection = this.db.collection('expertise_mapping');

      // Create indexes for performance
      await this.createIndexes();

      console.log('Knowledge Graph Service initialized with MongoDB');
    } catch (error) {
      console.error('Knowledge Graph Service initialization failed:', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    try {
      if (!this.nodesCollection || !this.edgesCollection || !this.clustersCollection || !this.expertiseCollection) {
        throw new Error('Collections not initialized');
      }

      await Promise.all([
        this.nodesCollection.createIndex({ node_id: 1 }, { unique: true }),
        this.nodesCollection.createIndex({ type: 1 }),
        this.nodesCollection.createIndex({ technology: 1 }),
        this.nodesCollection.createIndex({ support_group: 1 }),
        this.edgesCollection.createIndex({ source: 1, target: 1 }),
        this.edgesCollection.createIndex({ relationship_type: 1 }),
        this.clustersCollection.createIndex({ technologies: 1 }),
        this.expertiseCollection.createIndex({ technology: 1, support_group: 1 })
      ]);
    } catch (error) {
      console.error('Index creation failed:', error);
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
    if (!this.nodesCollection || !this.edgesCollection || !this.clustersCollection || !this.expertiseCollection) {
      throw new Error('Knowledge Graph Service not properly initialized');
    }
  }

  async addDocumentNode(
    documentId: string,
    metadata: any,
    relationships: EntityRelationship[]
  ): Promise<void> {
    const startTime = performance.now();

    try {
      // Create document node
      const documentNode: KnowledgeGraphNode = {
        node_id: documentId,
        type: 'document',
        title: metadata.title || metadata.filename,
        technology: metadata.classification?.technology || [],
        support_group: metadata.classification?.support_groups || [],
        document_type: metadata.classification?.document_type || 'general',
        criticality: metadata.classification?.criticality || 'low',
        metadata: {
          file_size: metadata.file_size,
          creation_date: metadata.creation_date,
          last_modified: metadata.last_modified,
          complexity_score: metadata.classification?.complexity_score,
          language: metadata.classification?.language
        },
        connections: 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.nodesCollection.replaceOne(
        { node_id: documentId },
        documentNode,
        { upsert: true }
      );

      // Process relationships asynchronously
      setImmediate(async () => {
        try {
          await this.processRelationships(documentId, relationships);
          await this.updateClusterAnalysis();
        } catch (error) {
          console.error('Relationship processing failed:', error);
        }
      });

      console.log(`Knowledge graph node added: ${documentId} in ${Math.round(performance.now() - startTime)}ms`);

    } catch (error: any) {
      console.error('Failed to add document node:', error);
      throw new Error(`Graph node creation failed: ${error.message}`);
    }
  }

  private async processRelationships(
    documentId: string,
    relationships: EntityRelationship[]
  ): Promise<void> {
    for (const relationship of relationships) {
      // Create or update entity nodes
      await this.createEntityNode(relationship.source, documentId);
      await this.createEntityNode(relationship.target, documentId);

      // Create relationship edge
      const edgeId = `${relationship.source}_${relationship.relationship}_${relationship.target}`;
      const edge: KnowledgeGraphEdge = {
        edge_id: edgeId,
        source: relationship.source,
        target: relationship.target,
        relationship_type: relationship.relationship,
        strength: this.calculateRelationshipStrength(relationship),
        source_document: documentId,
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.edgesCollection.replaceOne(
        { edge_id: edgeId },
        edge,
        { upsert: true }
      );
    }

    // Update connection counts
    await this.updateConnectionCounts();
  }

  private async createEntityNode(entityName: string, sourceDocument: string): Promise<void> {
    const entityId = `entity_${entityName.toLowerCase().replace(/\s+/g, '_')}`;

    const existingNode = await this.nodesCollection.findOne({ node_id: entityId });

    if (existingNode) {
      // Update existing node
      await this.nodesCollection.updateOne(
        { node_id: entityId },
        {
          $addToSet: { related_documents: sourceDocument },
          $set: { updated_at: new Date() }
        }
      );
    } else {
      // Create new entity node
      const entityNode: KnowledgeGraphNode = {
        node_id: entityId,
        type: 'entity',
        title: entityName,
        technology: this.inferTechnology(entityName),
        support_group: this.inferSupportGroup(entityName),
        document_type: 'entity',
        criticality: 'medium',
        metadata: {
          entity_type: this.classifyEntity(entityName)
        },
        related_documents: [sourceDocument],
        connections: 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.nodesCollection.insertOne(entityNode);
    }
  }

  private calculateRelationshipStrength(relationship: EntityRelationship): number {
    // Calculate relationship strength based on type and context
    const strengthMap: Record<string, number> = {
      'depends': 0.9,
      'connects': 0.8,
      'uses': 0.7,
      'part_of': 0.8,
      'configures': 0.6,
      'monitors': 0.5,
      'related': 0.3
    };

    return strengthMap[relationship.relationship] || 0.5;
  }

  private inferTechnology(entityName: string): string[] {
    const entityLower = entityName.toLowerCase();
    const technologies = [];

    if (entityLower.includes('oracle') || entityLower.includes('sql')) technologies.push('Oracle');
    if (entityLower.includes('postgres') || entityLower.includes('pg_')) technologies.push('PostgreSQL');
    if (entityLower.includes('mongo')) technologies.push('MongoDB');
    if (entityLower.includes('aws') || entityLower.includes('ec2')) technologies.push('AWS');
    if (entityLower.includes('docker') || entityLower.includes('container')) technologies.push('Docker');
    if (entityLower.includes('kubernetes') || entityLower.includes('k8s')) technologies.push('Kubernetes');
    if (entityLower.includes('network') || entityLower.includes('cisco')) technologies.push('Network');

    return technologies.length > 0 ? technologies : ['General'];
  }

  private inferSupportGroup(entityName: string): string[] {
    const entityLower = entityName.toLowerCase();
    const groups = [];

    if (entityLower.includes('database') || entityLower.includes('sql')) groups.push('Database');
    if (entityLower.includes('server') || entityLower.includes('infrastructure')) groups.push('Infrastructure');
    if (entityLower.includes('cloud') || entityLower.includes('aws')) groups.push('Cloud');
    if (entityLower.includes('security') || entityLower.includes('firewall')) groups.push('Security');
    if (entityLower.includes('application') || entityLower.includes('app')) groups.push('Application');
    if (entityLower.includes('network') || entityLower.includes('router')) groups.push('Network');

    return groups.length > 0 ? groups : ['General'];
  }

  private classifyEntity(entityName: string): string {
    const entityLower = entityName.toLowerCase();

    if (entityLower.includes('server') || entityLower.includes('host')) return 'infrastructure';
    if (entityLower.includes('database') || entityLower.includes('table')) return 'data';
    if (entityLower.includes('application') || entityLower.includes('service')) return 'application';
    if (entityLower.includes('network') || entityLower.includes('interface')) return 'network';
    if (entityLower.includes('config') || entityLower.includes('setting')) return 'configuration';

    return 'general';
  }

  private async updateConnectionCounts(): Promise<void> {
    // Update connection counts for all nodes
    const pipeline = [
      {
        $group: {
          _id: '$source',
          connections: { $sum: 1 }
        }
      }
    ];

    const sourceCounts = await this.edgesCollection.aggregate(pipeline).toArray();

    for (const count of sourceCounts) {
      await this.nodesCollection.updateOne(
        { node_id: count._id },
        { $set: { connections: count.connections } }
      );
    }
  }

  async queryKnowledgeGraph(query: KnowledgeGraphQuery): Promise<AIResponse> {
    const startTime = performance.now();

    try {
      let results: any = {};

      switch (query.query_type) {
        case 'find_related_documents':
          results = await this.findRelatedDocuments(query.parameters);
          break;

        case 'get_technology_map':
          results = await this.getTechnologyMap(query.parameters);
          break;

        case 'analyze_support_coverage':
          results = await this.analyzeSupportCoverage(query.parameters);
          break;

        case 'find_knowledge_clusters':
          results = await this.findKnowledgeClusters(query.parameters);
          break;

        case 'get_expertise_mapping':
          results = await this.getExpertiseMapping(query.parameters);
          break;

        default:
          throw new Error(`Unsupported query type: ${query.query_type}`);
      }

      return {
        success: true,
        data: results,
        processing_time_ms: performance.now() - startTime,
        confidence: this.calculateQueryConfidence(results)
      };

    } catch (error: any) {
      console.error('Knowledge graph query failed:', error);
      return {
        success: false,
        error: `Query failed: ${error.message}`,
        processing_time_ms: performance.now() - startTime
      };
    }
  }

  private async findRelatedDocuments(parameters: any): Promise<any> {
    await this.ensureInitialized();

    const { document_id, technology, support_group, max_results = 10 } = parameters;

    const matchStage: any = {};

    if (document_id) {
      // Find documents connected to this document
      const edges = await this.edgesCollection!.find({
        $or: [{ source: document_id }, { target: document_id }]
      }).toArray();

      const relatedIds = edges.map(edge =>
        edge.source === document_id ? edge.target : edge.source
      );

      matchStage.node_id = { $in: relatedIds };
    }

    if (technology) {
      matchStage.technology = { $in: Array.isArray(technology) ? technology : [technology] };
    }

    if (support_group) {
      matchStage.support_group = { $in: Array.isArray(support_group) ? support_group : [support_group] };
    }

    const documents = await this.nodesCollection!
      .find(matchStage)
      .sort({ connections: -1 })
      .limit(max_results)
      .toArray();

    return {
      related_documents: documents,
      total_found: documents.length
    };
  }

  private async getTechnologyMap(parameters: any): Promise<TechnologyMap> {
    await this.ensureInitialized();

    const { support_group } = parameters;

    const pipeline: any[] = [
      { $match: { type: 'document' } }
    ];

    if (support_group) {
      pipeline.push({ $match: { support_group: support_group } });
    }

    pipeline.push(
      { $unwind: '$technology' },
      {
        $group: {
          _id: '$technology',
          document_count: { $sum: 1 },
          avg_complexity: { $avg: '$metadata.complexity_score' },
          support_groups: { $addToSet: '$support_group' }
        }
      },
      { $sort: { document_count: -1 } }
    );

    const technologies = await this.nodesCollection!.aggregate(pipeline).toArray();

    return {
      technologies: technologies.map(tech => ({
        name: tech._id,
        document_count: tech.document_count,
        complexity_score: Math.round(tech.avg_complexity || 0),
        support_groups: tech.support_groups.flat()
      })),
      total_technologies: technologies.length
    };
  }

  private async analyzeSupportCoverage(parameters: any): Promise<SupportGroupMap> {
    await this.ensureInitialized();

    const { technology } = parameters;

    const pipeline: any[] = [
      { $match: { type: 'document' } }
    ];

    if (technology) {
      pipeline.push({ $match: { technology: technology } });
    }

    pipeline.push(
      { $unwind: '$support_group' },
      {
        $group: {
          _id: '$support_group',
          document_count: { $sum: 1 },
          technologies: { $addToSet: '$technology' },
          avg_criticality: { $avg: { $switch: {
            branches: [
              { case: { $eq: ['$criticality', 'low'] }, then: 1 },
              { case: { $eq: ['$criticality', 'medium'] }, then: 2 },
              { case: { $eq: ['$criticality', 'high'] }, then: 3 },
              { case: { $eq: ['$criticality', 'critical'] }, then: 4 }
            ],
            default: 1
          }}}
        }
      },
      { $sort: { document_count: -1 } }
    );

    const groups = await this.nodesCollection!.aggregate(pipeline).toArray();

    return {
      support_groups: groups.map(group => ({
        name: group._id,
        document_count: group.document_count,
        technologies_covered: group.technologies.flat(),
        criticality_level: this.mapCriticalityScore(group.avg_criticality),
        coverage_score: this.calculateCoverageScore(group.document_count, group.technologies.flat().length)
      })),
      total_groups: groups.length
    };
  }

  private async findKnowledgeClusters(parameters: any): Promise<KnowledgeCluster[]> {
    await this.ensureInitialized();

    // Find clusters of related knowledge
    const clusters = await this.clustersCollection!
      .find(parameters)
      .sort({ document_count: -1 })
      .toArray();

    return clusters;
  }

  private async getExpertiseMapping(parameters: any): Promise<ExpertiseMapping[]> {
    await this.ensureInitialized();

    const mapping = await this.expertiseCollection!
      .find(parameters)
      .sort({ knowledge_depth: -1 })
      .toArray();

    return mapping;
  }

  private async updateClusterAnalysis(): Promise<void> {
    // Perform clustering analysis to identify knowledge clusters
    // This is a simplified implementation - production would use advanced clustering algorithms

    const technologies = await this.nodesCollection.distinct('technology');

    for (const tech of technologies) {
      const techNodes = await this.nodesCollection
        .find({ technology: tech })
        .toArray();

      if (techNodes.length >= 3) { // Minimum cluster size
        const cluster: KnowledgeCluster = {
          id: `cluster_${tech.toLowerCase().replace(/\s+/g, '_')}`,
          name: `${tech} Knowledge Cluster`,
          technologies: [tech],
          support_groups: [...new Set(techNodes.flatMap(node => node.support_group || []))],
          document_count: techNodes.length,
          expertise_level: this.assessExpertiseLevel(techNodes),
          last_updated: new Date()
        };

        await this.clustersCollection.replaceOne(
          { id: cluster.id },
          cluster,
          { upsert: true }
        );
      }
    }
  }

  private assessExpertiseLevel(nodes: KnowledgeGraphNode[]): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
    const avgComplexity = nodes.reduce((sum, node) =>
      sum + (node.metadata?.complexity_score || 0), 0
    ) / nodes.length;

    if (avgComplexity >= 80) return 'expert';
    if (avgComplexity >= 60) return 'advanced';
    if (avgComplexity >= 40) return 'intermediate';
    return 'beginner';
  }

  private mapCriticalityScore(score: number): string {
    if (score >= 3.5) return 'critical';
    if (score >= 2.5) return 'high';
    if (score >= 1.5) return 'medium';
    return 'low';
  }

  private calculateCoverageScore(documentCount: number, technologyCount: number): number {
    // Simple coverage score calculation
    return Math.min(Math.round((documentCount * technologyCount) / 10), 100);
  }

  private calculateQueryConfidence(results: any): number {
    // Calculate confidence based on result quality and completeness
    if (!results || (Array.isArray(results) && results.length === 0)) {
      return 0.1;
    }

    // Simple confidence calculation
    let confidence = 0.7; // Base confidence

    if (results.total_found && results.total_found > 5) confidence += 0.2;
    if (results.document_count && results.document_count > 10) confidence += 0.1;

    return Math.min(confidence, 0.95);
  }

  async getGraphAnalytics(): Promise<GraphAnalytics> {
    try {
      await this.ensureInitialized();

      const [
        totalNodes,
        totalEdges,
        mostConnected,
        orphanedDocs,
        clusters
      ] = await Promise.all([
        this.nodesCollection!.countDocuments(),
        this.edgesCollection!.countDocuments(),
        this.getMostConnectedTechnologies(),
        this.getOrphanedDocuments(),
        this.clustersCollection!.find().toArray()
      ]);

      return {
        total_nodes: totalNodes,
        total_edges: totalEdges,
        most_connected_technologies: mostConnected,
        orphaned_documents: orphanedDocs,
        cluster_analysis: clusters.map(c => ({
          cluster_id: c.id,
          technologies: c.technologies,
          size: c.document_count
        })),
        relationship_strengths: await this.getRelationshipStrengths()
      };

    } catch (error: any) {
      console.error('Graph analytics failed:', error);
      throw new Error(`Analytics failed: ${error.message}`);
    }
  }

  private async getMostConnectedTechnologies(): Promise<Array<{ name: string; connections: number }>> {
    await this.ensureInitialized();

    const pipeline = [
      { $match: { type: 'document' } },
      { $unwind: '$technology' },
      {
        $group: {
          _id: '$technology',
          connections: { $sum: '$connections' }
        }
      },
      { $sort: { connections: -1 } },
      { $limit: 10 }
    ];

    const result = await this.nodesCollection!.aggregate(pipeline).toArray();
    return result.map(item => ({
      name: item._id,
      connections: item.connections
    }));
  }

  private async getOrphanedDocuments(): Promise<string[]> {
    await this.ensureInitialized();

    const orphaned = await this.nodesCollection!
      .find({
        type: 'document',
        connections: { $lte: 1 }
      })
      .project({ node_id: 1 })
      .toArray();

    return orphaned.map(doc => doc.node_id);
  }

  private async getRelationshipStrengths(): Promise<Array<{ source: string; target: string; strength: number }>> {
    await this.ensureInitialized();

    const pipeline = [
      {
        $group: {
          _id: { source: '$source', target: '$target' },
          avg_strength: { $avg: '$strength' }
        }
      },
      { $sort: { avg_strength: -1 } },
      { $limit: 20 }
    ];

    const result = await this.edgesCollection!.aggregate(pipeline).toArray();
    return result.map(item => ({
      source: item._id.source,
      target: item._id.target,
      strength: Math.round(item.avg_strength * 100) / 100
    }));
  }
}