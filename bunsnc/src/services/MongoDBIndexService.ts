/**
 * MongoDB Index Service - Creates and manages indexes for all collections
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient, Db, Collection, IndexDescription } from 'mongodb';
import { TicketTypeManager } from './TicketTypeManager';

interface IndexConfig {
  collectionName: string;
  indexes: Array<{
    key: Record<string, any>;
    options?: {
      unique?: boolean;
      sparse?: boolean;
      background?: boolean;
      partialFilterExpression?: Record<string, any>;
      name?: string;
    };
  }>;
}

export class MongoDBIndexService {
  private db: Db | null = null;
  private ticketTypeManager: TicketTypeManager;

  constructor() {
    this.ticketTypeManager = TicketTypeManager.getInstance();
  }

  async initialize(): Promise<void> {
    try {
      const mongoUrl = process.env.MONGODB_URL || 
        `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}?authSource=${process.env.MONGODB_AUTH_SOURCE}`;
      const dbName = process.env.MONGODB_DATABASE || 'bunsnc';
      
      console.log('📊 Initializing MongoDB Index Service...');
      console.log(`   URL: ${mongoUrl}`);
      console.log(`   Database: ${dbName}`);

      const client = new MongoClient(mongoUrl);
      await client.connect();
      this.db = client.db(dbName);

      console.log('✅ MongoDB Index Service initialized');

    } catch (error) {
      console.error('❌ Failed to initialize MongoDB Index Service:', error);
      throw error;
    }
  }

  async createAllIndexes(): Promise<void> {
    if (!this.db) {
      throw new Error('MongoDB not connected. Call initialize() first.');
    }

    console.log('🔧 Creating indexes for all collections...');

    const indexConfigs = this.generateAllIndexConfigs();
    
    for (const config of indexConfigs) {
      await this.createCollectionIndexes(config);
    }

    console.log('✅ All indexes created successfully');
  }

  private generateAllIndexConfigs(): IndexConfig[] {
    const configs: IndexConfig[] = [];

    // Indexes for ticket collections
    const ticketTypes = this.ticketTypeManager.getAllTicketTypes();
    
    for (const ticketType of ticketTypes) {
      const collectionName = this.ticketTypeManager.getCollectionName(ticketType);
      configs.push(this.generateTicketCollectionIndexes(collectionName));
    }

    // Indexes for SLM collection
    configs.push(this.generateSLMCollectionIndexes());

    // Indexes for system collections
    configs.push(...this.generateSystemCollectionIndexes());

    return configs;
  }

  private generateTicketCollectionIndexes(collectionName: string): IndexConfig {
    return {
      collectionName,
      indexes: [
        // Primary unique indexes
        {
          key: { sys_id: 1 },
          options: { unique: true, background: true, name: 'idx_sys_id' }
        },
        {
          key: { number: 1 },
          options: { unique: true, background: true, name: 'idx_number' }
        },

        // Core query indexes
        {
          key: { table: 1 },
          options: { background: true, name: 'idx_table' }
        },
        {
          key: { 'raw_data.state': 1 },
          options: { background: true, name: 'idx_state' }
        },
        {
          key: { 'raw_data.priority': 1 },
          options: { background: true, name: 'idx_priority' }
        },

        // Assignment indexes
        {
          key: { 'raw_data.assignment_group.value': 1 },
          options: { sparse: true, background: true, name: 'idx_assignment_group' }
        },
        {
          key: { 'raw_data.assigned_to.value': 1 },
          options: { sparse: true, background: true, name: 'idx_assigned_to' }
        },
        {
          key: { 'raw_data.caller_id.value': 1 },
          options: { sparse: true, background: true, name: 'idx_caller_id' }
        },

        // Temporal indexes
        {
          key: { 'raw_data.sys_created_on': 1 },
          options: { background: true, name: 'idx_created_on' }
        },
        {
          key: { 'raw_data.sys_updated_on': -1 },
          options: { background: true, name: 'idx_updated_on_desc' }
        },
        {
          key: { 'metadata.sync_timestamp': -1 },
          options: { background: true, name: 'idx_sync_timestamp' }
        },

        // System indexes
        {
          key: { created_at: -1 },
          options: { background: true, name: 'idx_created_at' }
        },
        {
          key: { updated_at: -1 },
          options: { background: true, name: 'idx_updated_at' }
        },

        // Partitioning index
        {
          key: { 'metadata.sys_id_prefix': 1 },
          options: { background: true, name: 'idx_sys_id_prefix' }
        },

        // Compound indexes for common queries
        {
          key: { 'raw_data.state': 1, 'raw_data.priority': 1, 'raw_data.sys_updated_on': -1 },
          options: { background: true, name: 'idx_state_priority_updated' }
        },
        {
          key: { 'raw_data.assignment_group.value': 1, 'raw_data.state': 1 },
          options: { sparse: true, background: true, name: 'idx_group_state' }
        },
        {
          key: { table: 1, 'raw_data.sys_updated_on': -1 },
          options: { background: true, name: 'idx_table_updated' }
        },

        // SLM-related indexes
        {
          key: { 'slm_data.has_breached': 1 },
          options: { sparse: true, background: true, name: 'idx_slm_breached' }
        },
        {
          key: { 'slm_data.active': 1, 'slm_data.business_percentage': -1 },
          options: { sparse: true, background: true, name: 'idx_slm_active_percentage' }
        },

        // Text search index
        {
          key: { 
            'raw_data.short_description': 'text', 
            'raw_data.description': 'text',
            number: 'text'
          },
          options: { background: true, name: 'idx_text_search' }
        },

        // Notes indexes (if notes_data exists)
        {
          key: { 'notes_data.sys_created_on': -1 },
          options: { sparse: true, background: true, name: 'idx_notes_created' }
        }
      ]
    };
  }

  private generateSLMCollectionIndexes(): IndexConfig {
    return {
      collectionName: 'slms_complete',
      indexes: [
        // Primary indexes
        {
          key: { sys_id: 1 },
          options: { unique: true, background: true, name: 'idx_slm_sys_id' }
        },

        // Task reference indexes
        {
          key: { task_sys_id: 1 },
          options: { background: true, name: 'idx_task_sys_id' }
        },
        {
          key: { task_number: 1 },
          options: { background: true, name: 'idx_task_number' }
        },

        // SLA status indexes
        {
          key: { active: 1 },
          options: { background: true, name: 'idx_active' }
        },
        {
          key: { has_breached: 1 },
          options: { background: true, name: 'idx_breached' }
        },
        {
          key: { stage: 1 },
          options: { background: true, name: 'idx_stage' }
        },

        // Performance indexes
        {
          key: { business_percentage: -1 },
          options: { background: true, name: 'idx_business_percentage' }
        },
        {
          key: { sla_name: 1 },
          options: { background: true, name: 'idx_sla_name' }
        },

        // Temporal indexes
        {
          key: { start_time: 1 },
          options: { background: true, name: 'idx_start_time' }
        },
        {
          key: { planned_end_time: 1 },
          options: { background: true, name: 'idx_planned_end_time' }
        },
        {
          key: { sys_updated_on: -1 },
          options: { background: true, name: 'idx_slm_updated_on' }
        },

        // Compound indexes for monitoring
        {
          key: { active: 1, has_breached: 1, business_percentage: -1 },
          options: { background: true, name: 'idx_monitoring' }
        },
        {
          key: { task_sys_id: 1, active: 1 },
          options: { background: true, name: 'idx_task_active' }
        },

        // Breach analysis indexes
        {
          key: { has_breached: 1, business_percentage: -1 },
          options: { 
            background: true, 
            name: 'idx_breach_analysis',
            partialFilterExpression: { has_breached: true }
          }
        }
      ]
    };
  }

  private generateSystemCollectionIndexes(): IndexConfig[] {
    return [
      // Error logs collection
      {
        collectionName: 'error_logs',
        indexes: [
          {
            key: { timestamp: -1 },
            options: { background: true, name: 'idx_error_timestamp' }
          },
          {
            key: { level: 1, timestamp: -1 },
            options: { background: true, name: 'idx_error_level_time' }
          },
          {
            key: { service: 1, timestamp: -1 },
            options: { background: true, name: 'idx_error_service_time' }
          }
        ]
      },

      // Sync status collection
      {
        collectionName: 'sync_status',
        indexes: [
          {
            key: { table_name: 1, timestamp: -1 },
            options: { background: true, name: 'idx_sync_table_time' }
          },
          {
            key: { status: 1, timestamp: -1 },
            options: { background: true, name: 'idx_sync_status_time' }
          },
          {
            key: { timestamp: -1 },
            options: { background: true, name: 'idx_sync_timestamp' }
          }
        ]
      },

      // Performance metrics collection
      {
        collectionName: 'performance_metrics',
        indexes: [
          {
            key: { timestamp: -1 },
            options: { background: true, name: 'idx_perf_timestamp' }
          },
          {
            key: { operation: 1, timestamp: -1 },
            options: { background: true, name: 'idx_perf_operation_time' }
          },
          {
            key: { endpoint: 1, timestamp: -1 },
            options: { background: true, name: 'idx_perf_endpoint_time' }
          }
        ]
      }
    ];
  }

  private async createCollectionIndexes(config: IndexConfig): Promise<void> {
    if (!this.db) return;

    console.log(`📊 Creating indexes for collection: ${config.collectionName}`);

    try {
      const collection = this.db.collection(config.collectionName);

      // Create collection if it doesn't exist
      try {
        await this.db.createCollection(config.collectionName);
      } catch (error) {
        // Collection might already exist
      }

      // Create indexes
      let createdCount = 0;
      let skippedCount = 0;

      for (const indexSpec of config.indexes) {
        try {
          await collection.createIndex(indexSpec.key, indexSpec.options || {});
          createdCount++;
        } catch (error: any) {
          if (error.message.includes('already exists') || 
              error.message.includes('IndexOptionsConflict') ||
              error.codeName === 'IndexOptionsConflict' ||
              error.code === 85) {
            skippedCount++;
            console.log(`ℹ️ Index already exists for ${config.collectionName}, skipping...`);
          } else {
            console.warn(`⚠️ Failed to create index for ${config.collectionName}:`, error.message);
          }
        }
      }

      console.log(`   ✅ ${config.collectionName}: ${createdCount} created, ${skippedCount} skipped`);

    } catch (error) {
      console.error(`❌ Error creating indexes for ${config.collectionName}:`, error);
    }
  }

  async analyzeIndexUsage(): Promise<Record<string, any>> {
    if (!this.db) {
      throw new Error('MongoDB not connected. Call initialize() first.');
    }

    console.log('📈 Analyzing index usage...');
    
    const analysis: Record<string, any> = {};
    const collections = await this.db.listCollections().toArray();

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      
      try {
        const collection = this.db.collection(collectionName);
        
        // Get index statistics
        const indexStats = await collection.aggregate([
          { $indexStats: {} }
        ]).toArray();

        analysis[collectionName] = {
          total_indexes: indexStats.length,
          indexes: indexStats.map((stat: any) => ({
            name: stat.name,
            usage_count: stat.accesses?.ops || 0,
            since: stat.accesses?.since || null
          }))
        };

      } catch (error) {
        analysis[collectionName] = { error: error.message };
      }
    }

    return analysis;
  }

  async getCollectionStats(): Promise<Record<string, any>> {
    if (!this.db) {
      throw new Error('MongoDB not connected. Call initialize() first.');
    }

    const stats: Record<string, any> = {};
    const collections = await this.db.listCollections().toArray();

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      
      try {
        const collection = this.db.collection(collectionName);
        
        const collStats = await this.db.stats();
        const indexes = await collection.indexes();
        const count = await collection.countDocuments();

        stats[collectionName] = {
          document_count: count,
          index_count: indexes.length,
          indexes: indexes.map(idx => ({
            name: idx.name,
            key: idx.key,
            unique: idx.unique || false,
            sparse: idx.sparse || false
          }))
        };

      } catch (error) {
        stats[collectionName] = { error: error.message };
      }
    }

    return stats;
  }

  async dropUnusedIndexes(dryRun: boolean = true): Promise<Record<string, any>> {
    if (!this.db) {
      throw new Error('MongoDB not connected. Call initialize() first.');
    }

    console.log(`🔍 ${dryRun ? 'Analyzing' : 'Dropping'} unused indexes...`);
    
    const results: Record<string, any> = {};
    const usageStats = await this.analyzeIndexUsage();

    for (const [collectionName, stats] of Object.entries(usageStats)) {
      if (stats.error) continue;

      const unusedIndexes = stats.indexes.filter((idx: any) => 
        idx.usage_count === 0 && 
        idx.name !== '_id_' // Never drop the _id index
      );

      results[collectionName] = {
        total_indexes: stats.total_indexes,
        unused_indexes: unusedIndexes.length,
        unused_names: unusedIndexes.map((idx: any) => idx.name)
      };

      if (!dryRun && unusedIndexes.length > 0) {
        const collection = this.db.collection(collectionName);
        
        for (const idx of unusedIndexes) {
          try {
            await collection.dropIndex(idx.name);
            console.log(`   🗑️ Dropped unused index: ${collectionName}.${idx.name}`);
          } catch (error) {
            console.error(`❌ Failed to drop index ${idx.name}:`, error);
          }
        }
      }
    }

    return results;
  }

  async optimizeIndexes(): Promise<void> {
    console.log('⚡ Optimizing all indexes...');
    
    // Reindex all collections
    if (this.db) {
      const collections = await this.db.listCollections().toArray();
      
      for (const collectionInfo of collections) {
        try {
          const collection = this.db.collection(collectionInfo.name);
          await collection.reIndex();
          console.log(`   ✅ Reindexed: ${collectionInfo.name}`);
        } catch (error) {
          console.error(`❌ Failed to reindex ${collectionInfo.name}:`, error);
        }
      }
    }
    
    console.log('✅ Index optimization completed');
  }
}