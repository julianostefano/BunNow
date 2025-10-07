/**
 * Knowledge Graph Controller Plugin - Elysia Plugin Implementation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v5.6.1: Singleton Lazy Loading Pattern (ElysiaJS Key Concepts #5 + #7)
 * Root cause: PluginKnowledgeGraphController instanciado a cada request via .derive()
 * Solution: Singleton instance com lazy initialization na primeira request
 * Reference: docs/ELYSIA_BEST_PRACTICES.md - "Plugin Deduplication Mechanism"
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Singleton Lazy Loading (v5.6.1)
 * - Global lifecycle scope (.as("global"))
 * - Migrated from KnowledgeGraphService to follow v5.0.0 plugin architecture
 * - Implements relationship mapping, analytics, and knowledge cluster analysis
 */

import { Elysia, t } from "elysia";
import { performance } from "perf_hooks";
import { setImmediate } from "timers/promises";
import {
  AIRequest,
  AIResponse,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  KnowledgeGraphQuery,
  EntityRelationship,
  TechnologyMap,
  SupportGroupMap,
} from "../types/AI";

// Extended interfaces for plugin implementation
export interface GraphAnalytics {
  total_nodes: number;
  total_edges: number;
  most_connected_technologies: Array<{ name: string; connections: number }>;
  orphaned_documents: string[];
  cluster_analysis: Array<{
    cluster_id: string;
    technologies: string[];
    size: number;
  }>;
  relationship_strengths: Array<{
    source: string;
    target: string;
    strength: number;
  }>;
}

export interface KnowledgeCluster {
  id: string;
  name: string;
  technologies: string[];
  support_groups: string[];
  document_count: number;
  expertise_level: "beginner" | "intermediate" | "advanced" | "expert";
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

class PluginKnowledgeGraphController {
  private serviceLocator: any;
  private config: any;

  constructor(serviceLocator: any, config: any) {
    this.serviceLocator = serviceLocator;
    this.config = config;
  }

  async addDocumentNode(
    documentId: string,
    metadata: any,
    relationships: EntityRelationship[],
  ): Promise<{
    success: boolean;
    message: string;
    processing_time_ms: number;
  }> {
    const startTime = performance.now();

    try {
      const { mongo } = this.serviceLocator;
      const db = mongo.getDatabase();

      // Create document node
      const documentNode: KnowledgeGraphNode = {
        node_id: documentId,
        type: "document",
        title: metadata.title || metadata.filename,
        technology: metadata.classification?.technology || [],
        support_group: metadata.classification?.support_groups || [],
        document_type: metadata.classification?.document_type || "general",
        criticality: metadata.classification?.criticality || "low",
        metadata: {
          file_size: metadata.file_size,
          creation_date: metadata.creation_date,
          last_modified: metadata.last_modified,
          complexity_score: metadata.classification?.complexity_score,
          language: metadata.classification?.language,
        },
        connections: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const nodesCollection = db.collection("knowledge_graph_nodes");
      await nodesCollection.replaceOne({ node_id: documentId }, documentNode, {
        upsert: true,
      });

      // Process relationships asynchronously
      setImmediate(async () => {
        try {
          await this.processRelationships(documentId, relationships);
          await this.updateClusterAnalysis();
        } catch (error: unknown) {
          console.error("Relationship processing failed:", error);
        }
      });

      const processingTime = Math.round(performance.now() - startTime);
      console.log(
        `Knowledge graph node added: ${documentId} in ${processingTime}ms`,
      );

      return {
        success: true,
        message: `Document node added successfully`,
        processing_time_ms: processingTime,
      };
    } catch (error: any) {
      console.error("Failed to add document node:", error);
      return {
        success: false,
        message: `Graph node creation failed: ${error.message}`,
        processing_time_ms: Math.round(performance.now() - startTime),
      };
    }
  }

  private async processRelationships(
    documentId: string,
    relationships: EntityRelationship[],
  ): Promise<void> {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const edgesCollection = db.collection("knowledge_graph_edges");

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
        updated_at: new Date(),
      };

      await edgesCollection.replaceOne({ edge_id: edgeId }, edge, {
        upsert: true,
      });
    }

    // Update connection counts
    await this.updateConnectionCounts();
  }

  private async createEntityNode(
    entityName: string,
    sourceDocument: string,
  ): Promise<void> {
    const entityId = `entity_${entityName.toLowerCase().replace(/\s+/g, "_")}`;
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const nodesCollection = db.collection("knowledge_graph_nodes");

    const existingNode = await nodesCollection.findOne({
      node_id: entityId,
    });

    if (existingNode) {
      // Update existing node
      await nodesCollection.updateOne(
        { node_id: entityId },
        {
          $addToSet: { related_documents: sourceDocument },
          $set: { updated_at: new Date() },
        },
      );
    } else {
      // Create new entity node
      const entityNode: KnowledgeGraphNode = {
        node_id: entityId,
        type: "entity",
        title: entityName,
        technology: this.inferTechnology(entityName),
        support_group: this.inferSupportGroup(entityName),
        document_type: "entity",
        criticality: "medium",
        metadata: {
          entity_type: this.classifyEntity(entityName),
        },
        related_documents: [sourceDocument],
        connections: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await nodesCollection.insertOne(entityNode);
    }
  }

  private calculateRelationshipStrength(
    relationship: EntityRelationship,
  ): number {
    const strengthMap: Record<string, number> = {
      depends: 0.9,
      connects: 0.8,
      uses: 0.7,
      part_of: 0.8,
      configures: 0.6,
      monitors: 0.5,
      related: 0.3,
    };

    return strengthMap[relationship.relationship] || 0.5;
  }

  private inferTechnology(entityName: string): string[] {
    const entityLower = entityName.toLowerCase();
    const technologies = [];

    if (entityLower.includes("oracle") || entityLower.includes("sql"))
      technologies.push("Oracle");
    if (entityLower.includes("postgres") || entityLower.includes("pg_"))
      technologies.push("PostgreSQL");
    if (entityLower.includes("mongo")) technologies.push("MongoDB");
    if (entityLower.includes("aws") || entityLower.includes("ec2"))
      technologies.push("AWS");
    if (entityLower.includes("docker") || entityLower.includes("container"))
      technologies.push("Docker");
    if (entityLower.includes("kubernetes") || entityLower.includes("k8s"))
      technologies.push("Kubernetes");
    if (entityLower.includes("network") || entityLower.includes("cisco"))
      technologies.push("Network");

    return technologies.length > 0 ? technologies : ["General"];
  }

  private inferSupportGroup(entityName: string): string[] {
    const entityLower = entityName.toLowerCase();
    const groups = [];

    if (entityLower.includes("database") || entityLower.includes("sql"))
      groups.push("Database");
    if (
      entityLower.includes("server") ||
      entityLower.includes("infrastructure")
    )
      groups.push("Infrastructure");
    if (entityLower.includes("cloud") || entityLower.includes("aws"))
      groups.push("Cloud");
    if (entityLower.includes("security") || entityLower.includes("firewall"))
      groups.push("Security");
    if (entityLower.includes("application") || entityLower.includes("app"))
      groups.push("Application");
    if (entityLower.includes("network") || entityLower.includes("router"))
      groups.push("Network");

    return groups.length > 0 ? groups : ["General"];
  }

  private classifyEntity(entityName: string): string {
    const entityLower = entityName.toLowerCase();

    if (entityLower.includes("server") || entityLower.includes("host"))
      return "infrastructure";
    if (entityLower.includes("database") || entityLower.includes("table"))
      return "data";
    if (entityLower.includes("application") || entityLower.includes("service"))
      return "application";
    if (entityLower.includes("network") || entityLower.includes("interface"))
      return "network";
    if (entityLower.includes("config") || entityLower.includes("setting"))
      return "configuration";

    return "general";
  }

  private async updateConnectionCounts(): Promise<void> {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const edgesCollection = db.collection("knowledge_graph_edges");
    const nodesCollection = db.collection("knowledge_graph_nodes");

    const pipeline = [
      {
        $group: {
          _id: "$source",
          connections: { $sum: 1 },
        },
      },
    ];

    const sourceCounts = await edgesCollection.aggregate(pipeline).toArray();

    for (const count of sourceCounts) {
      await nodesCollection.updateOne(
        { node_id: count._id },
        { $set: { connections: count.connections } },
      );
    }
  }

  async queryKnowledgeGraph(query: KnowledgeGraphQuery): Promise<AIResponse> {
    const startTime = performance.now();

    try {
      let results: any = {};

      switch (query.query_type) {
        case "find_related_documents":
          results = await this.findRelatedDocuments(query.parameters);
          break;

        case "get_technology_map":
          results = await this.getTechnologyMap(query.parameters);
          break;

        case "analyze_support_coverage":
          results = await this.analyzeSupportCoverage(query.parameters);
          break;

        case "find_knowledge_clusters":
          results = await this.findKnowledgeClusters(query.parameters);
          break;

        case "get_expertise_mapping":
          results = await this.getExpertiseMapping(query.parameters);
          break;

        default:
          throw new Error(`Unsupported query type: ${query.query_type}`);
      }

      return {
        success: true,
        data: results,
        processing_time_ms: performance.now() - startTime,
        confidence: this.calculateQueryConfidence(results),
      };
    } catch (error: any) {
      console.error("Knowledge graph query failed:", error);
      return {
        success: false,
        error: `Query failed: ${error.message}`,
        processing_time_ms: performance.now() - startTime,
      };
    }
  }

  private async findRelatedDocuments(parameters: any): Promise<any> {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const nodesCollection = db.collection("knowledge_graph_nodes");
    const edgesCollection = db.collection("knowledge_graph_edges");

    const {
      document_id,
      technology,
      support_group,
      max_results = 10,
    } = parameters;

    const matchStage: any = {};

    if (document_id) {
      const edges = await edgesCollection
        .find({
          $or: [{ source: document_id }, { target: document_id }],
        })
        .toArray();

      const relatedIds = edges.map((edge) =>
        edge.source === document_id ? edge.target : edge.source,
      );

      matchStage.node_id = { $in: relatedIds };
    }

    if (technology) {
      matchStage.technology = {
        $in: Array.isArray(technology) ? technology : [technology],
      };
    }

    if (support_group) {
      matchStage.support_group = {
        $in: Array.isArray(support_group) ? support_group : [support_group],
      };
    }

    const documents = await nodesCollection
      .find(matchStage)
      .sort({ connections: -1 })
      .limit(max_results)
      .toArray();

    return {
      related_documents: documents,
      total_found: documents.length,
    };
  }

  private async getTechnologyMap(parameters: any): Promise<TechnologyMap> {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const nodesCollection = db.collection("knowledge_graph_nodes");

    const { support_group } = parameters;

    const pipeline: any[] = [{ $match: { type: "document" } }];

    if (support_group) {
      pipeline.push({ $match: { support_group: support_group } });
    }

    pipeline.push(
      { $unwind: "$technology" },
      {
        $group: {
          _id: "$technology",
          document_count: { $sum: 1 },
          avg_complexity: { $avg: "$metadata.complexity_score" },
          support_groups: { $addToSet: "$support_group" },
        },
      },
      { $sort: { document_count: -1 } },
    );

    const technologies = await nodesCollection.aggregate(pipeline).toArray();

    return {
      technologies: technologies.map((tech) => ({
        name: tech._id,
        document_count: tech.document_count,
        complexity_score: Math.round(tech.avg_complexity || 0),
        support_groups: tech.support_groups.flat(),
      })),
      total_technologies: technologies.length,
    };
  }

  private async analyzeSupportCoverage(
    parameters: any,
  ): Promise<SupportGroupMap> {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const nodesCollection = db.collection("knowledge_graph_nodes");

    const { technology } = parameters;

    const pipeline: any[] = [{ $match: { type: "document" } }];

    if (technology) {
      pipeline.push({ $match: { technology: technology } });
    }

    pipeline.push(
      { $unwind: "$support_group" },
      {
        $group: {
          _id: "$support_group",
          document_count: { $sum: 1 },
          technologies: { $addToSet: "$technology" },
          avg_criticality: {
            $avg: {
              $switch: {
                branches: [
                  { case: { $eq: ["$criticality", "low"] }, then: 1 },
                  { case: { $eq: ["$criticality", "medium"] }, then: 2 },
                  { case: { $eq: ["$criticality", "high"] }, then: 3 },
                  { case: { $eq: ["$criticality", "critical"] }, then: 4 },
                ],
                default: 1,
              },
            },
          },
        },
      },
      { $sort: { document_count: -1 } },
    );

    const groups = await nodesCollection.aggregate(pipeline).toArray();

    return {
      support_groups: groups.map((group) => ({
        name: group._id,
        document_count: group.document_count,
        technologies_covered: group.technologies.flat(),
        criticality_level: this.mapCriticalityScore(group.avg_criticality),
        coverage_score: this.calculateCoverageScore(
          group.document_count,
          group.technologies.flat().length,
        ),
      })),
      total_groups: groups.length,
    };
  }

  private async findKnowledgeClusters(
    parameters: any,
  ): Promise<KnowledgeCluster[]> {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const clustersCollection = db.collection("knowledge_clusters");

    const clusters = await clustersCollection
      .find(parameters)
      .sort({ document_count: -1 })
      .toArray();

    return clusters;
  }

  private async getExpertiseMapping(
    parameters: any,
  ): Promise<ExpertiseMapping[]> {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const expertiseCollection = db.collection("expertise_mapping");

    const mapping = await expertiseCollection
      .find(parameters)
      .sort({ knowledge_depth: -1 })
      .toArray();

    return mapping;
  }

  private async updateClusterAnalysis(): Promise<void> {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const nodesCollection = db.collection("knowledge_graph_nodes");
    const clustersCollection = db.collection("knowledge_clusters");

    const technologies = await nodesCollection.distinct("technology");

    for (const tech of technologies) {
      const techNodes = await nodesCollection
        .find({ technology: tech })
        .toArray();

      if (techNodes.length >= 3) {
        const cluster: KnowledgeCluster = {
          id: `cluster_${tech.toLowerCase().replace(/\s+/g, "_")}`,
          name: `${tech} Knowledge Cluster`,
          technologies: [tech],
          support_groups: [
            ...new Set(techNodes.flatMap((node) => node.support_group || [])),
          ],
          document_count: techNodes.length,
          expertise_level: this.assessExpertiseLevel(techNodes),
          last_updated: new Date(),
        };

        await clustersCollection.replaceOne({ id: cluster.id }, cluster, {
          upsert: true,
        });
      }
    }
  }

  private assessExpertiseLevel(
    nodes: KnowledgeGraphNode[],
  ): "beginner" | "intermediate" | "advanced" | "expert" {
    const avgComplexity =
      nodes.reduce(
        (sum, node) => sum + (node.metadata?.complexity_score || 0),
        0,
      ) / nodes.length;

    if (avgComplexity >= 80) return "expert";
    if (avgComplexity >= 60) return "advanced";
    if (avgComplexity >= 40) return "intermediate";
    return "beginner";
  }

  private mapCriticalityScore(score: number): string {
    if (score >= 3.5) return "critical";
    if (score >= 2.5) return "high";
    if (score >= 1.5) return "medium";
    return "low";
  }

  private calculateCoverageScore(
    documentCount: number,
    technologyCount: number,
  ): number {
    return Math.min(Math.round((documentCount * technologyCount) / 10), 100);
  }

  private calculateQueryConfidence(results: any): number {
    if (!results || (Array.isArray(results) && results.length === 0)) {
      return 0.1;
    }

    let confidence = 0.7;

    if (results.total_found && results.total_found > 5) confidence += 0.2;
    if (results.document_count && results.document_count > 10)
      confidence += 0.1;

    return Math.min(confidence, 0.95);
  }

  async getGraphAnalytics(): Promise<GraphAnalytics> {
    const startTime = performance.now();

    try {
      const { mongo } = this.serviceLocator;
      const db = mongo.getDatabase();
      const nodesCollection = db.collection("knowledge_graph_nodes");
      const edgesCollection = db.collection("knowledge_graph_edges");
      const clustersCollection = db.collection("knowledge_clusters");

      const [totalNodes, totalEdges, mostConnected, orphanedDocs, clusters] =
        await Promise.all([
          nodesCollection.countDocuments(),
          edgesCollection.countDocuments(),
          this.getMostConnectedTechnologies(),
          this.getOrphanedDocuments(),
          clustersCollection.find().toArray(),
        ]);

      return {
        total_nodes: totalNodes,
        total_edges: totalEdges,
        most_connected_technologies: mostConnected,
        orphaned_documents: orphanedDocs,
        cluster_analysis: clusters.map((c) => ({
          cluster_id: c.id,
          technologies: c.technologies,
          size: c.document_count,
        })),
        relationship_strengths: await this.getRelationshipStrengths(),
      };
    } catch (error: any) {
      console.error("Graph analytics failed:", error);
      throw new Error(`Analytics failed: ${error.message}`);
    }
  }

  private async getMostConnectedTechnologies(): Promise<
    Array<{ name: string; connections: number }>
  > {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const nodesCollection = db.collection("knowledge_graph_nodes");

    const pipeline = [
      { $match: { type: "document" } },
      { $unwind: "$technology" },
      {
        $group: {
          _id: "$technology",
          connections: { $sum: "$connections" },
        },
      },
      { $sort: { connections: -1 } },
      { $limit: 10 },
    ];

    const result = await nodesCollection.aggregate(pipeline).toArray();
    return result.map((item) => ({
      name: item._id,
      connections: item.connections,
    }));
  }

  private async getOrphanedDocuments(): Promise<string[]> {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const nodesCollection = db.collection("knowledge_graph_nodes");

    const orphaned = await nodesCollection
      .find({
        type: "document",
        connections: { $lte: 1 },
      })
      .project({ node_id: 1 })
      .toArray();

    return orphaned.map((doc) => doc.node_id);
  }

  private async getRelationshipStrengths(): Promise<
    Array<{ source: string; target: string; strength: number }>
  > {
    const { mongo } = this.serviceLocator;
    const db = mongo.getDatabase();
    const edgesCollection = db.collection("knowledge_graph_edges");

    const pipeline = [
      {
        $group: {
          _id: { source: "$source", target: "$target" },
          avg_strength: { $avg: "$strength" },
        },
      },
      { $sort: { avg_strength: -1 } },
      { $limit: 20 },
    ];

    const result = await edgesCollection.aggregate(pipeline).toArray();
    return result.map((item) => ({
      source: item._id.source,
      target: item._id.target,
      strength: Math.round(item.avg_strength * 100) / 100,
    }));
  }
}

// TypeBox validation schemas
const EntityRelationshipSchema = t.Object({
  source: t.String(),
  target: t.String(),
  relationship: t.String(),
});

const DocumentMetadataSchema = t.Object({
  title: t.Optional(t.String()),
  filename: t.Optional(t.String()),
  file_size: t.Optional(t.Number()),
  creation_date: t.Optional(t.String()),
  last_modified: t.Optional(t.String()),
  classification: t.Optional(
    t.Object({
      technology: t.Optional(t.Array(t.String())),
      support_groups: t.Optional(t.Array(t.String())),
      document_type: t.Optional(t.String()),
      criticality: t.Optional(t.String()),
      complexity_score: t.Optional(t.Number()),
      language: t.Optional(t.String()),
    }),
  ),
});

const KnowledgeGraphQuerySchema = t.Object({
  query_type: t.Union([
    t.Literal("find_related_documents"),
    t.Literal("get_technology_map"),
    t.Literal("analyze_support_coverage"),
    t.Literal("find_knowledge_clusters"),
    t.Literal("get_expertise_mapping"),
  ]),
  parameters: t.Object({
    document_id: t.Optional(t.String()),
    technology: t.Optional(t.Union([t.String(), t.Array(t.String())])),
    support_group: t.Optional(t.Union([t.String(), t.Array(t.String())])),
    max_results: t.Optional(t.Number()),
  }),
});

// FIX v5.6.1: Singleton Lazy Loading Pattern
let _knowledgeGraphControllerSingleton: PluginKnowledgeGraphController | null =
  null;

const getKnowledgeGraphController = async (
  serviceLocator: any,
  config: any,
) => {
  if (_knowledgeGraphControllerSingleton) {
    return { knowledgeGraphController: _knowledgeGraphControllerSingleton };
  }

  console.log(
    "📦 Creating PluginKnowledgeGraphController (SINGLETON - first initialization)",
  );
  _knowledgeGraphControllerSingleton = new PluginKnowledgeGraphController(
    serviceLocator,
    config,
  );
  console.log(
    "✅ PluginKnowledgeGraphController created (SINGLETON - reused across all requests)",
  );

  return { knowledgeGraphController: _knowledgeGraphControllerSingleton };
};

export const knowledgeGraphControllerPlugin = new Elysia({
  name: "knowledge-graph-controller",
})
  .onStart(() =>
    console.log(
      "🔧 Knowledge Graph Controller Plugin starting - Singleton Lazy Loading pattern",
    ),
  )
  .derive(async ({ config, services, ...serviceLocator }) => {
    const { knowledgeGraphController } = await getKnowledgeGraphController(
      { services, ...serviceLocator },
      config,
    );

    return {
      knowledgeGraphController,
      addDocumentNode: knowledgeGraphController.addDocumentNode.bind(
        knowledgeGraphController,
      ),
      queryKnowledgeGraph: knowledgeGraphController.queryKnowledgeGraph.bind(
        knowledgeGraphController,
      ),
      getGraphAnalytics: knowledgeGraphController.getGraphAnalytics.bind(
        knowledgeGraphController,
      ),
    };
  })

  // Add document node to knowledge graph
  .post(
    "/api/knowledge-graph/nodes",
    async ({ body, addDocumentNode, set }) => {
      try {
        const { document_id, metadata, relationships } = body;

        if (!document_id || !metadata) {
          set.status = 400;
          return {
            success: false,
            error: "Missing required fields: document_id, metadata",
          };
        }

        const result = await addDocumentNode(
          document_id,
          metadata,
          relationships || [],
        );

        if (!result.success) {
          set.status = 500;
          return result;
        }

        return result;
      } catch (error: any) {
        set.status = 500;
        return {
          success: false,
          error: `Failed to add document node: ${error.message}`,
        };
      }
    },
    {
      body: t.Object({
        document_id: t.String(),
        metadata: DocumentMetadataSchema,
        relationships: t.Optional(t.Array(EntityRelationshipSchema)),
      }),
    },
  )

  // Query knowledge graph
  .post(
    "/api/knowledge-graph/query",
    async ({ body, queryKnowledgeGraph, set }) => {
      try {
        const result = await queryKnowledgeGraph(body);

        if (!result.success) {
          set.status = 500;
          return result;
        }

        return result;
      } catch (error: any) {
        set.status = 500;
        return {
          success: false,
          error: `Query failed: ${error.message}`,
        };
      }
    },
    {
      body: KnowledgeGraphQuerySchema,
    },
  )

  // Get graph analytics
  .get("/api/knowledge-graph/analytics", async ({ getGraphAnalytics, set }) => {
    try {
      const analytics = await getGraphAnalytics();

      return {
        success: true,
        data: analytics,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      set.status = 500;
      return {
        success: false,
        error: `Analytics failed: ${error.message}`,
      };
    }
  })

  // Get knowledge clusters
  .get(
    "/api/knowledge-graph/clusters",
    async ({ query, knowledgeGraphController, set }) => {
      try {
        const parameters = {
          technology: query.technology,
          support_group: query.support_group,
          expertise_level: query.expertise_level,
        };

        const clusters =
          await knowledgeGraphController.findKnowledgeClusters(parameters);

        return {
          success: true,
          data: {
            clusters,
            total_found: clusters.length,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        set.status = 500;
        return {
          success: false,
          error: `Failed to get clusters: ${error.message}`,
        };
      }
    },
    {
      query: t.Object({
        technology: t.Optional(t.String()),
        support_group: t.Optional(t.String()),
        expertise_level: t.Optional(t.String()),
      }),
    },
  )

  // Get expertise mapping
  .get(
    "/api/knowledge-graph/expertise",
    async ({ query, knowledgeGraphController, set }) => {
      try {
        const parameters = {
          technology: query.technology,
          support_group: query.support_group,
          knowledge_depth: query.knowledge_depth
            ? parseFloat(query.knowledge_depth)
            : undefined,
        };

        const mapping =
          await knowledgeGraphController.getExpertiseMapping(parameters);

        return {
          success: true,
          data: {
            expertise_mapping: mapping,
            total_found: mapping.length,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        set.status = 500;
        return {
          success: false,
          error: `Failed to get expertise mapping: ${error.message}`,
        };
      }
    },
    {
      query: t.Object({
        technology: t.Optional(t.String()),
        support_group: t.Optional(t.String()),
        knowledge_depth: t.Optional(t.String()),
      }),
    },
  )

  .as("global"); // ✅ Global lifecycle scope for plugin deduplication
