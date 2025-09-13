/**
 * ServiceNow Query Service - Handles all query operations with caching
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthCore, ServiceNowRecord } from './ServiceNowAuthCore';
import { serviceNowRateLimiter } from '../ServiceNowRateLimit';

export class ServiceNowQueryService extends ServiceNowAuthCore {

  /**
   * Generic method to make ServiceNow API requests (similar to makeRequest pattern)
   */
  async makeRequest(table: string, method: string = 'GET', params: Record<string, any> = {}): Promise<any> {
    await this.authenticate();
    
    return serviceNowRateLimiter.executeRequest(async () => {
      try {
        const url = `${this.SERVICENOW_BASE_URL}/api/now/table/${table}`;
        const response = await this.axiosClient({
          method: method.toLowerCase(),
          url,
          params
        });
        
        return response.data;
      } catch (error) {
        console.error(`ServiceNow ${method} ${table} error:`, error);
        throw error;
      }
    });
  }

  /**
   * Paginated request with cache optimization for lazy loading
   * Always filters by current month
   */
  async makeRequestPaginated(
    table: string, 
    group: string, 
    state: string, 
    page: number = 1, 
    limit: number = 10
  ): Promise<{
    data: any[];
    hasMore: boolean;
    total: number;
    currentPage: number;
    totalPages: number;
  }> {
    await this.authenticate();
    
    // Generate current month filter dynamically
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const monthStart = `${currentYear}-${currentMonth}-01`;
    const monthEnd = `${currentYear}-${currentMonth}-31`;
    
    // Build cache key
    const cacheKey = `tickets_paginated:${table}:${group}:${state}:${currentMonth}:${page}:${limit}`;
    
    try {
      // Try cache first
      const cached = await this.redisCache.get(cacheKey);
      if (cached) {
        console.log(`🎯 Cache hit for paginated ${table} - page ${page}`);
        return cached;
      }

      console.log(`🔍 Getting paginated ${table} - group: ${group}, state: ${state}, page: ${page}`);

      return serviceNowRateLimiter.executeRequest(async () => {
        try {
          const offset = (page - 1) * limit;
          
          // Build query with current month filter
          let query = `sys_created_onBETWEEN${monthStart}@${monthEnd}`;
          
          // Add state filter if not 'all'
          if (state !== 'all') {
            query += `^state=${state}`;
          }
          
          // Add group filter if not 'all'
          if (group !== 'all') {
            query += `^assignment_group.nameCONTAINS${group}`;
          }

          const params = {
            sysparm_query: query,
            sysparm_fields: 'sys_id,number,short_description,description,state,priority,urgency,impact,category,subcategory,assignment_group,assigned_to,caller_id,opened_by,sys_created_on,sys_updated_on',
            sysparm_display_value: 'all',
            sysparm_exclude_reference_link: 'true',
            sysparm_limit: limit,
            sysparm_offset: offset
          };

          const url = `${this.SERVICENOW_BASE_URL}/api/now/table/${table}`;
          const response = await this.axiosClient({
            method: 'get',
            url,
            params
          });

          const data = response.data.result || [];
          const total = parseInt(response.headers['x-total-count'] || '0') || data.length;
          const totalPages = Math.ceil(total / limit);
          const hasMore = page < totalPages;

          const result = {
            data: data.map(ticket => ({
              ...ticket,
              table_name: table,
              target_group: group
            })),
            hasMore,
            total,
            currentPage: page,
            totalPages
          };

          // Cache result for 2 minutes (aggressive TTL for real-time data)
          await this.redisCache.set(cacheKey, result, 120);
          
          // Stream the data to Redis Streams for real-time updates
          try {
            const streamKey = `servicenow:stream:${table}:${currentMonth}`;
            await this.redisStreamManager.addMessage(streamKey, {
              table,
              group,
              state,
              page: page.toString(),
              limit: limit.toString(),
              total: total.toString(),
              timestamp: new Date().toISOString(),
              data_count: result.data.length.toString(),
              cache_key: cacheKey
            }, '*', 1000); // Max 1000 messages in stream
            console.log(`📡 Streamed ${result.data.length} ${table} records to Redis Stream`);
          } catch (streamError) {
            console.warn('⚠️ Redis Stream failed, continuing with cache only:', streamError);
          }
          
          return result;

        } catch (error) {
          console.error(`ServiceNow paginated ${table} error:`, error);
          throw error;
        }
      });

    } catch (error) {
      console.error(`Error in makeRequestPaginated:`, error);
      // Return empty result on error
      return {
        data: [],
        hasMore: false,
        total: 0,
        currentPage: page,
        totalPages: 0
      };
    }
  }

  /**
   * Execute ServiceNow API query with rate limiting
   */
  private async executeQuery<T>(
    table: string, 
    query: string, 
    fields?: string
  ): Promise<T> {
    await this.authenticate();

    const queryParams: Record<string, string> = {
      sysparm_query: query,
      sysparm_display_value: 'all', // Same as Python default
      sysparm_exclude_reference_link: 'true',
      sysparm_limit: '1000' // Reasonable limit
    };

    if (fields) {
      queryParams.sysparm_fields = fields;
    }

    const url = `${this.SERVICENOW_BASE_URL}/api/now/table/${table}`;

    return serviceNowRateLimiter.executeRequest(async () => {
      console.log(`🔍 ServiceNow query: ${table} - ${query.substring(0, 100)}...`);
      
      const response = await this.axiosClient.get(url, {
        params: queryParams
      });

      if (response.status !== 200) {
        throw new Error(`ServiceNow API error: ${response.status} ${response.statusText}`);
      }

      return response.data;
    }, 'high');
  }

  /**
   * Get incidents in waiting state (state = 3) for specific assignment group
   */
  async getWaitingIncidents(assignmentGroup: string): Promise<ServiceNowRecord[]> {
    const cacheKey = `waiting_incidents:${assignmentGroup}`;
    
    try {
      // Try cache first
      const cached = await this.redisCache.get<ServiceNowRecord[]>(cacheKey);
      if (cached) {
        console.log(`🎯 Cache hit for waiting incidents: ${assignmentGroup}`);
        return cached;
      }

      const query = `assignment_group.nameCONTAINS${assignmentGroup}^state=3`;
      
      const result = await this.executeQuery<{ result: ServiceNowRecord[] }>(
        'incident', 
        query,
        'sys_id,number,state,short_description,assignment_group,priority,opened_by,sys_created_on,sys_updated_on'
      );

      const incidents = result.result || [];
      
      // Cache for 5 minutes
      await this.redisCache.set(cacheKey, incidents, 300);
      console.log(`📦 Cached ${incidents.length} waiting incidents for: ${assignmentGroup}`);

      return incidents;

    } catch (error: any) {
      console.error(`❌ Error getting waiting incidents for ${assignmentGroup}:`, error.message);
      return [];
    }
  }

  /**
   * Get change tasks in work in progress state (state = 3) for specific assignment group
   */
  async getWaitingChangeTasks(assignmentGroup: string): Promise<ServiceNowRecord[]> {
    const cacheKey = `waiting_ctasks:${assignmentGroup}`;
    
    try {
      // Try cache first
      const cached = await this.redisCache.get<ServiceNowRecord[]>(cacheKey);
      if (cached) {
        console.log(`🎯 Cache hit for waiting change tasks: ${assignmentGroup}`);
        return cached;
      }

      const query = `assignment_group.nameCONTAINS${assignmentGroup}^state=3`;
      
      const result = await this.executeQuery<{ result: ServiceNowRecord[] }>(
        'change_task', 
        query,
        'sys_id,number,state,short_description,assignment_group,priority,opened_by,sys_created_on,sys_updated_on'
      );

      const changeTasks = result.result || [];
      
      // Cache for 5 minutes
      await this.redisCache.set(cacheKey, changeTasks, 300);
      console.log(`📦 Cached ${changeTasks.length} waiting change tasks for: ${assignmentGroup}`);

      return changeTasks;

    } catch (error: any) {
      console.error(`❌ Error getting waiting change tasks for ${assignmentGroup}:`, error.message);
      return [];
    }
  }

  /**
   * Get service catalog tasks in work in progress state (state = 3) for specific assignment group
   */
  async getWaitingServiceCatalogTasks(assignmentGroup: string): Promise<ServiceNowRecord[]> {
    const cacheKey = `waiting_sctasks:${assignmentGroup}`;
    
    try {
      // Try cache first
      const cached = await this.redisCache.get<ServiceNowRecord[]>(cacheKey);
      if (cached) {
        console.log(`🎯 Cache hit for waiting SC tasks: ${assignmentGroup}`);
        return cached;
      }

      const query = `assignment_group.nameCONTAINS${assignmentGroup}^state=3`;
      
      const result = await this.executeQuery<{ result: ServiceNowRecord[] }>(
        'sc_task', 
        query,
        'sys_id,number,state,short_description,assignment_group,priority,opened_by,sys_created_on,sys_updated_on'
      );

      const scTasks = result.result || [];
      
      // Cache for 5 minutes
      await this.redisCache.set(cacheKey, scTasks, 300);
      console.log(`📦 Cached ${scTasks.length} waiting SC tasks for: ${assignmentGroup}`);

      return scTasks;

    } catch (error: any) {
      console.error(`❌ Error getting waiting SC tasks for ${assignmentGroup}:`, error.message);
      return [];
    }
  }

  /**
   * Pre-warm cache for critical data on startup
   */
  async preWarmCache(): Promise<void> {
    console.log('🔥 Pre-warming ServiceNow cache...');
    
    const criticalGroups = [
      'IT Operations',
      'Database Administration', 
      'Network Support',
      'Application Support'
    ];

    const warmupPromises = criticalGroups.map(async (group) => {
      try {
        // Pre-warm all critical queries concurrently
        await Promise.all([
          this.getWaitingIncidents(group),
          this.getWaitingChangeTasks(group),
          this.getWaitingServiceCatalogTasks(group)
        ]);
        console.log(`✅ Cache warmed for: ${group}`);
      } catch (error) {
        console.warn(`⚠️ Cache warmup failed for ${group}:`, error);
      }
    });

    await Promise.all(warmupPromises);
    console.log('🔥 Cache pre-warming completed');
  }

  /**
   * Search across multiple tables with caching
   */
  async searchTickets(
    searchTerm: string, 
    tables: string[] = ['incident', 'change_task', 'sc_task'],
    limit: number = 50
  ): Promise<ServiceNowRecord[]> {
    const cacheKey = `search:${searchTerm}:${tables.join(',')}:${limit}`;
    
    try {
      // Try cache first
      const cached = await this.redisCache.get<ServiceNowRecord[]>(cacheKey);
      if (cached) {
        console.log(`🎯 Cache hit for search: ${searchTerm}`);
        return cached;
      }

      const searchPromises = tables.map(async (table) => {
        const query = `short_descriptionLIKE${searchTerm}^ORdescriptionLIKE${searchTerm}^ORnumberLIKE${searchTerm}`;
        
        try {
          const result = await this.executeQuery<{ result: ServiceNowRecord[] }>(
            table, 
            query,
            'sys_id,number,state,short_description,assignment_group,priority,sys_created_on'
          );

          return (result.result || []).map(record => ({
            ...record,
            table_name: table
          }));
        } catch (error) {
          console.warn(`Search failed for table ${table}:`, error);
          return [];
        }
      });

      const results = await Promise.all(searchPromises);
      const allRecords = results.flat().slice(0, limit);
      
      // Cache for 10 minutes
      await this.redisCache.set(cacheKey, allRecords, 600);
      console.log(`📦 Cached ${allRecords.length} search results for: ${searchTerm}`);

      return allRecords;

    } catch (error: any) {
      console.error(`❌ Error searching tickets for ${searchTerm}:`, error.message);
      return [];
    }
  }
}