/**
 * Group Service - CRUD operations for ServiceNow groups collection
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { GroupDocument, GroupData, COLLECTION_NAMES } from '../config/mongodb-collections';
import { logger } from '../utils/Logger';

export interface GroupFilter {
  nome?: string;
  tags?: string[];
  responsavel?: string;
  temperatura?: number;
  temperaturaMin?: number;
  temperaturaMax?: number;
}

export interface GroupListItem {
  id: number;
  nome: string;
  descricao: string;
  responsavel: string;
  temperatura: number;
  tags: string[];
}

export class GroupService {
  private client: MongoClient;
  private db: Db;
  private collection: Collection<GroupDocument>;
  private cache: Map<string, GroupListItem[]> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes
  private lastCacheUpdate: number = 0;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(client: MongoClient, databaseName: string = 'bunsnc') {
    this.client = client;
    this.db = client.db(databaseName);
    this.collection = this.db.collection<GroupDocument>(COLLECTION_NAMES.GROUPS);
  }

  /**
   * Initialize collection and indexes with retry logic
   */
  async initialize(): Promise<void> {
    // Return existing promise if initialization is in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    // Return immediately if already initialized
    if (this.isInitialized) {
      return;
    }

    this.initializationPromise = this.performInitialization();
    
    try {
      await this.initializationPromise;
      this.isInitialized = true;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Perform the actual initialization with retry logic
   */
  private async performInitialization(): Promise<void> {
    const maxRetries = 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`🏷️ [GroupService] Initializing... (attempt ${attempt}/${maxRetries})`);
        
        // Verify MongoDB connection
        await this.client.db().admin().ping();
        logger.debug('✅ [GroupService] MongoDB connection verified');
        
        // Verify collection access
        await this.collection.countDocuments({}, { limit: 1 });
        logger.debug('✅ [GroupService] Collection access verified');
        
        // Ensure indexes are created
        await this.createIndexes();
        logger.debug('✅ [GroupService] Indexes created/verified');
        
        logger.info('✅ [GroupService] Initialized successfully');
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`⚠️ [GroupService] Initialization attempt ${attempt} failed:`, lastError.message);
        
        if (attempt < maxRetries) {
          const delay = attempt * 1000; // 1s, 2s, 3s delay
          logger.info(`🔄 [GroupService] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    logger.error('❌ [GroupService] All initialization attempts failed');
    throw new Error(`GroupService initialization failed after ${maxRetries} attempts: ${lastError!.message}`);
  }

  /**
   * Create optimized indexes for groups collection
   */
  private async createIndexes(): Promise<void> {
    const indexes = [
      { key: { id: 1 }, name: 'id_1', unique: true },
      { key: { 'data.nome': 1 }, name: 'data_nome_1' },
      { key: { 'data.tags': 1 }, name: 'data_tags_1' },
      { key: { 'data.responsavel': 1 }, name: 'data_responsavel_1' },
      { key: { 'data.temperatura': 1 }, name: 'data_temperatura_1' },
      { key: { created_at: -1 }, name: 'created_at_-1' },
      { key: { updated_at: -1 }, name: 'updated_at_-1' }
    ];

    for (const index of indexes) {
      try {
        await this.collection.createIndex(index.key, { 
          name: index.name, 
          unique: index.unique || false 
        });
      } catch (error: any) {
        if (error.code !== 85) { // Index already exists
          logger.warn(`⚠️ Failed to create index ${index.name}:`, error.message);
        }
      }
    }
  }

  /**
   * Get all groups with optional filtering
   */
  async getAllGroups(filter?: GroupFilter): Promise<GroupListItem[]> {
    try {
      // Check cache first
      const cacheKey = JSON.stringify(filter || {});
      if (this.isCacheValid() && this.cache.has(cacheKey)) {
        logger.info('📋 [CACHE] Returning cached groups');
        return this.cache.get(cacheKey)!;
      }

      // Build MongoDB filter
      const mongoFilter: any = {};
      
      if (filter?.nome) {
        mongoFilter['data.nome'] = { $regex: filter.nome, $options: 'i' };
      }
      
      if (filter?.tags && filter.tags.length > 0) {
        mongoFilter['data.tags'] = { $in: filter.tags };
      }
      
      if (filter?.responsavel) {
        mongoFilter['data.responsavel'] = { $regex: filter.responsavel, $options: 'i' };
      }
      
      if (filter?.temperatura) {
        mongoFilter['data.temperatura'] = filter.temperatura;
      } else if (filter?.temperaturaMin || filter?.temperaturaMax) {
        mongoFilter['data.temperatura'] = {};
        if (filter.temperaturaMin) mongoFilter['data.temperatura'].$gte = filter.temperaturaMin;
        if (filter.temperaturaMax) mongoFilter['data.temperatura'].$lte = filter.temperaturaMax;
      }

      // Execute query
      const documents = await this.collection
        .find(mongoFilter)
        .sort({ 'data.nome': 1 })
        .toArray();

      // Transform to GroupListItem
      const groups: GroupListItem[] = documents.map(doc => ({
        id: doc.id,
        nome: doc.data.nome,
        descricao: doc.data.descricao,
        responsavel: doc.data.responsavel,
        temperatura: doc.data.temperatura,
        tags: doc.data.tags
      }));

      // Update cache
      this.cache.set(cacheKey, groups);
      this.lastCacheUpdate = Date.now();

      logger.info(`📋 [MONGODB] Retrieved ${groups.length} groups`);
      return groups;
    } catch (error) {
      logger.error('❌ Failed to get groups:', error);
      throw error;
    }
  }

  /**
   * Get group by ID
   */
  async getGroupById(id: number): Promise<GroupDocument | null> {
    try {
      const document = await this.collection.findOne({ id });
      if (document) {
        logger.info(`📋 [MONGODB] Found group: ${document.data.nome}`);
      }
      return document;
    } catch (error) {
      logger.error(`❌ Failed to get group ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get group by name
   */
  async getGroupByName(nome: string): Promise<GroupDocument | null> {
    try {
      const document = await this.collection.findOne({ 'data.nome': nome });
      if (document) {
        logger.info(`📋 [MONGODB] Found group by name: ${nome}`);
      }
      return document;
    } catch (error) {
      logger.error(`❌ Failed to get group by name ${nome}:`, error);
      throw error;
    }
  }

  /**
   * Get groups by tag
   */
  async getGroupsByTag(tag: string): Promise<GroupListItem[]> {
    try {
      return await this.getAllGroups({ tags: [tag] });
    } catch (error) {
      logger.error(`❌ Failed to get groups by tag ${tag}:`, error);
      throw error;
    }
  }

  /**
   * Get groups by responsible person
   */
  async getGroupsByResponsavel(responsavel: string): Promise<GroupListItem[]> {
    try {
      return await this.getAllGroups({ responsavel });
    } catch (error) {
      logger.error(`❌ Failed to get groups by responsavel ${responsavel}:`, error);
      throw error;
    }
  }

  /**
   * Create new group
   */
  async createGroup(groupData: GroupData): Promise<GroupDocument> {
    try {
      // Find next available ID
      const lastGroup = await this.collection.findOne({}, { sort: { id: -1 } });
      const nextId = (lastGroup?.id || 0) + 1;

      const document: GroupDocument = {
        id: nextId,
        data: groupData,
        raw_data: JSON.stringify(groupData),
        created_at: new Date(),
        updated_at: new Date()
      };

      const result = await this.collection.insertOne(document);
      document._id = result.insertedId.toString();

      // Clear cache
      this.clearCache();

      logger.info(`✅ [MONGODB] Created group: ${groupData.nome} (ID: ${nextId})`);
      return document;
    } catch (error) {
      logger.error('❌ Failed to create group:', error);
      throw error;
    }
  }

  /**
   * Update existing group
   */
  async updateGroup(id: number, groupData: Partial<GroupData>): Promise<boolean> {
    try {
      const updateDoc: any = {
        updated_at: new Date()
      };

      // Update data fields
      Object.keys(groupData).forEach(key => {
        updateDoc[`data.${key}`] = groupData[key as keyof GroupData];
      });

      // Update raw_data if we have the complete data
      const existingGroup = await this.getGroupById(id);
      if (existingGroup) {
        const mergedData = { ...existingGroup.data, ...groupData };
        updateDoc.raw_data = JSON.stringify(mergedData);
      }

      const result = await this.collection.updateOne(
        { id },
        { $set: updateDoc }
      );

      if (result.modifiedCount > 0) {
        this.clearCache();
        logger.info(`✅ [MONGODB] Updated group ID: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`❌ Failed to update group ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete group
   */
  async deleteGroup(id: number): Promise<boolean> {
    try {
      const result = await this.collection.deleteOne({ id });
      
      if (result.deletedCount > 0) {
        this.clearCache();
        logger.info(`✅ [MONGODB] Deleted group ID: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`❌ Failed to delete group ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{
    totalGroups: number;
    totalTags: number;
    responsaveis: string[];
    temperaturaDistribution: Record<number, number>;
  }> {
    try {
      const totalGroups = await this.collection.countDocuments();
      
      // Get unique tags and responsaveis via aggregation
      const pipeline = [
        {
          $group: {
            _id: null,
            allTags: { $push: '$data.tags' },
            responsaveis: { $addToSet: '$data.responsavel' },
            temperaturas: { $push: '$data.temperatura' }
          }
        }
      ];

      const result = await this.collection.aggregate(pipeline).toArray();
      const stats = result[0] || {};

      // Flatten and count unique tags
      const allTags = (stats.allTags || []).flat();
      const uniqueTags = new Set(allTags);

      // Count temperatura distribution
      const temperaturaDistribution: Record<number, number> = {};
      (stats.temperaturas || []).forEach((temp: number) => {
        temperaturaDistribution[temp] = (temperaturaDistribution[temp] || 0) + 1;
      });

      return {
        totalGroups,
        totalTags: uniqueTags.size,
        responsaveis: stats.responsaveis || [],
        temperaturaDistribution
      };
    } catch (error) {
      logger.error('❌ Failed to get group stats:', error);
      throw error;
    }
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.lastCacheUpdate < this.cacheExpiry;
  }

  /**
   * Clear cache
   */
  private clearCache(): void {
    this.cache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * Get group names for dropdown (optimized for frontend)
   */
  async getGroupNamesForDropdown(): Promise<Array<{value: string, label: string, emoji: string}>> {
    try {
      const groups = await this.getAllGroups();
      
      // Map group names to dropdown format with emojis
      const emojiMap: Record<string, string> = {
        'L2-NE-IT APP AND DATABASE': '💾',
        'L2-NE-IT SAP BASIS': '🏢',
        'L2-NE-IT APP AND SERVICES': '⚙️',
        'L2-NE-IT PROCESSING': '🔄',
        'L2-NE-IT NETWORK SECURITY': '🔐',
        'L2-NE-IT NETWORK': '🌐',
        'L2-NE-CLOUDSERVICES': '☁️',
        'L2-NE-IT MONITORY': '📊',
        'L2-NE-IT SO UNIX': '🐧',
        'L2-NE-IT BOC': '📋',
        'L2-NE-IT MIDDLEWARE': '🔗',
        'L2-NE-IT BACKUP': '💿',
        'L2-NE-IT STORAGE': '🗄️',
        'L2-NE-IT VOIP': '📞',
        'L2-NE-IT NOC': '🖥️',
        'L2-NE-IT PCP PRODUCTION': '🏭'
      };

      return groups.map(group => ({
        value: group.nome,
        label: group.nome,
        emoji: emojiMap[group.nome] || '📁'
      }));
    } catch (error) {
      logger.error('❌ Failed to get group names for dropdown:', error);
      throw error;
    }
  }
}