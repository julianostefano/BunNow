/**
 * System Group Manager - Consolidated group management
 * Integrates functionality from GroupService
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '../../utils/Logger';

export interface GroupDocument {
  _id?: any;
  sys_id: string;
  name: string;
  description?: string;
  active?: boolean;
  type?: string;
  manager?: string;
  members?: string[];
  email?: string;
  created_at: Date;
  updated_at: Date;
  raw_data?: any;
}

export interface GroupFilter {
  name?: string;
  type?: string;
  active?: boolean;
  manager?: string;
}

export class SystemGroupManager {
  private client: MongoClient;
  private db: Db;
  private collection: Collection<GroupDocument>;
  private cache: Map<string, any> = new Map();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes
  private isInitialized = false;

  constructor(mongoConfig: any) {
    this.client = mongoConfig.client;
    this.db = this.client.db(mongoConfig.database);
    this.collection = this.db.collection<GroupDocument>('sys_user_groups');
  }

  /**
   * Initialize group manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.info('🏷️ [SystemGroups] Initializing group manager...');

      // Create indexes for better performance
      await this.createIndexes();

      this.isInitialized = true;
      logger.info('✅ [SystemGroups] Group manager initialized');
    } catch (error) {
      logger.error('❌ [SystemGroups] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Create database indexes
   */
  private async createIndexes(): Promise<void> {
    try {
      await Promise.all([
        this.collection.createIndex({ sys_id: 1 }, { unique: true }),
        this.collection.createIndex({ name: 1 }),
        this.collection.createIndex({ type: 1 }),
        this.collection.createIndex({ active: 1 }),
        this.collection.createIndex({ manager: 1 }),
        this.collection.createIndex({ updated_at: -1 })
      ]);
      logger.debug('✅ [SystemGroups] Database indexes created');
    } catch (error) {
      logger.warn('⚠️ [SystemGroups] Failed to create indexes (non-critical):', error);
    }
  }

  /**
   * Get groups with filtering
   */
  async getGroups(filters?: GroupFilter): Promise<GroupDocument[]> {
    try {
      const cacheKey = `groups_${JSON.stringify(filters || {})}`;
      const cached = this.getCachedResult(cacheKey);
      if (cached) return cached;

      const query: any = {};

      if (filters) {
        if (filters.name) {
          query.name = new RegExp(filters.name, 'i');
        }
        if (filters.type) {
          query.type = filters.type;
        }
        if (filters.active !== undefined) {
          query.active = filters.active;
        }
        if (filters.manager) {
          query.manager = filters.manager;
        }
      }

      const groups = await this.collection
        .find(query)
        .sort({ name: 1 })
        .limit(1000)
        .toArray();

      this.setCachedResult(cacheKey, groups);
      return groups;

    } catch (error) {
      logger.error('❌ [SystemGroups] Failed to get groups:', error);
      throw error;
    }
  }

  /**
   * Get group by ID
   */
  async getGroup(groupId: string): Promise<GroupDocument | null> {
    try {
      const cacheKey = `group_${groupId}`;
      const cached = this.getCachedResult(cacheKey);
      if (cached) return cached;

      const group = await this.collection.findOne({ sys_id: groupId });

      if (group) {
        this.setCachedResult(cacheKey, group);
      }

      return group;

    } catch (error) {
      logger.error('❌ [SystemGroups] Failed to get group:', error);
      throw error;
    }
  }

  /**
   * Create new group
   */
  async createGroup(groupData: Partial<GroupDocument>): Promise<string> {
    try {
      const sysId = groupData.sys_id || `group_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const now = new Date();

      const group: GroupDocument = {
        sys_id: sysId,
        name: groupData.name || 'Unnamed Group',
        description: groupData.description,
        active: groupData.active !== false,
        type: groupData.type || 'standard',
        manager: groupData.manager,
        members: groupData.members || [],
        email: groupData.email,
        created_at: now,
        updated_at: now,
        raw_data: groupData.raw_data
      };

      await this.collection.insertOne(group);
      this.clearCache();

      logger.info(`✅ [SystemGroups] Group created: ${group.name} (${sysId})`);
      return sysId;

    } catch (error) {
      logger.error('❌ [SystemGroups] Failed to create group:', error);
      throw error;
    }
  }

  /**
   * Update group
   */
  async updateGroup(groupId: string, updates: Partial<GroupDocument>): Promise<boolean> {
    try {
      const updateData: any = {
        ...updates,
        updated_at: new Date()
      };

      // Remove fields that shouldn't be updated directly
      delete updateData._id;
      delete updateData.sys_id;
      delete updateData.created_at;

      const result = await this.collection.updateOne(
        { sys_id: groupId },
        { $set: updateData }
      );

      if (result.matchedCount > 0) {
        this.clearCache();
        logger.info(`✅ [SystemGroups] Group updated: ${groupId}`);
        return true;
      }

      return false;

    } catch (error) {
      logger.error('❌ [SystemGroups] Failed to update group:', error);
      throw error;
    }
  }

  /**
   * Delete group
   */
  async deleteGroup(groupId: string): Promise<boolean> {
    try {
      const result = await this.collection.deleteOne({ sys_id: groupId });

      if (result.deletedCount > 0) {
        this.clearCache();
        logger.info(`✅ [SystemGroups] Group deleted: ${groupId}`);
        return true;
      }

      return false;

    } catch (error) {
      logger.error('❌ [SystemGroups] Failed to delete group:', error);
      throw error;
    }
  }

  /**
   * Add member to group
   */
  async addGroupMember(groupId: string, memberSysId: string): Promise<boolean> {
    try {
      const result = await this.collection.updateOne(
        { sys_id: groupId },
        {
          $addToSet: { members: memberSysId },
          $set: { updated_at: new Date() }
        }
      );

      if (result.matchedCount > 0) {
        this.clearCache();
        logger.info(`✅ [SystemGroups] Member added to group: ${memberSysId} -> ${groupId}`);
        return true;
      }

      return false;

    } catch (error) {
      logger.error('❌ [SystemGroups] Failed to add group member:', error);
      throw error;
    }
  }

  /**
   * Remove member from group
   */
  async removeGroupMember(groupId: string, memberSysId: string): Promise<boolean> {
    try {
      const result = await this.collection.updateOne(
        { sys_id: groupId },
        {
          $pull: { members: memberSysId },
          $set: { updated_at: new Date() }
        }
      );

      if (result.matchedCount > 0) {
        this.clearCache();
        logger.info(`✅ [SystemGroups] Member removed from group: ${memberSysId} -> ${groupId}`);
        return true;
      }

      return false;

    } catch (error) {
      logger.error('❌ [SystemGroups] Failed to remove group member:', error);
      throw error;
    }
  }

  /**
   * Get group count
   */
  async getGroupCount(): Promise<number> {
    try {
      return await this.collection.countDocuments({ active: { $ne: false } });
    } catch (error) {
      logger.error('❌ [SystemGroups] Failed to get group count:', error);
      return 0;
    }
  }

  /**
   * Get group statistics
   */
  async getStats(): Promise<any> {
    try {
      const total = await this.collection.countDocuments();
      const active = await this.collection.countDocuments({ active: true });
      const inactive = await this.collection.countDocuments({ active: false });

      // Get group types distribution
      const typesPipeline = [
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ];
      const types = await this.collection.aggregate(typesPipeline).toArray();

      // Get groups with most members
      const membersPipeline = [
        { $project: { name: 1, memberCount: { $size: { $ifNull: ['$members', []] } } } },
        { $sort: { memberCount: -1 } },
        { $limit: 5 }
      ];
      const topGroups = await this.collection.aggregate(membersPipeline).toArray();

      return {
        total,
        active,
        inactive,
        types,
        topGroups,
        cacheSize: this.cache.size
      };

    } catch (error) {
      logger.error('❌ [SystemGroups] Failed to get stats:', error);
      return {};
    }
  }

  /**
   * Cache management
   */
  private getCachedResult(key: string): any {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      return cached.data;
    }
    return null;
  }

  private setCachedResult(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private clearCache(): void {
    this.cache.clear();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.collection.countDocuments({}, { limit: 1 });
      return true;
    } catch (error) {
      logger.error('❌ [SystemGroups] Health check failed:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.clearCache();
    logger.info('🧹 [SystemGroups] Cleanup completed');
  }
}