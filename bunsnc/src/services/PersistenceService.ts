/**
 * Persistence Service - MongoDB Integration Layer
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { mongoClient, TicketDocument, AccessLogDocument, ErrorLogDocument } from '../config/mongodb';

export class PersistenceService {
  private isConnected = false;

  async initialize(): Promise<void> {
    try {
      await mongoClient.connect();
      this.isConnected = true;
      console.log('🍃 PersistenceService initialized with MongoDB');
    } catch (error) {
      console.error('❌ PersistenceService initialization failed:', error);
      this.isConnected = false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.isConnected) {
      await mongoClient.disconnect();
      this.isConnected = false;
    }
  }

  // Transform ServiceNow ticket to MongoDB document
  private transformTicketToDocument(ticket: any, tableName: string): TicketDocument {
    const now = new Date();
    const expiresIn24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return {
      sys_id: ticket.sys_id,
      table_name: tableName,
      number: ticket.number || ticket.sys_id,
      short_description: ticket.short_description || '',
      state: typeof ticket.state === 'object' ? ticket.state.value : ticket.state,
      priority: typeof ticket.priority === 'object' ? ticket.priority.value : ticket.priority,
      assignment_group: ticket.assignment_group,
      assigned_to: ticket.assigned_to,
      caller_id: ticket.caller_id,
      opened_by: ticket.opened_by,
      sys_created_on: ticket.sys_created_on,
      sys_updated_on: ticket.sys_updated_on,
      raw_data: ticket,
      cached_at: now,
      expires_at: expiresIn24Hours
    };
  }

  // Save tickets to MongoDB (with Redis-like caching behavior)
  async cacheTickets(tickets: any[], tableName: string): Promise<void> {
    if (!this.isConnected || !tickets.length) return;

    try {
      const documents = tickets.map(ticket => 
        this.transformTicketToDocument(ticket, tableName)
      );

      await mongoClient.saveTickets(documents);
      console.log(`🍃 Cached ${documents.length} ${tableName} tickets to MongoDB`);
    } catch (error) {
      console.error(`❌ Failed to cache ${tableName} tickets:`, error);
    }
  }

  // Get tickets from MongoDB (with fallback behavior)
  async getTickets(tableName: string, state?: string, group?: string): Promise<any[]> {
    if (!this.isConnected) return [];

    try {
      const filter: any = { 
        table_name: tableName,
        expires_at: { $gt: new Date() } // Only non-expired tickets
      };

      if (state) filter.state = state;
      if (group && group !== 'all') {
        filter['assignment_group.display_value'] = group;
      }

      const documents = await mongoClient.getTickets(filter);
      console.log(`🍃 Retrieved ${documents.length} ${tableName} tickets from MongoDB`);
      
      return documents.map(doc => doc.raw_data);
    } catch (error) {
      console.error(`❌ Failed to get ${tableName} tickets:`, error);
      return [];
    }
  }

  // Get ticket counts for tabs
  async getTicketCounts(tableName: string, state?: string): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const filter: any = { 
        table_name: tableName,
        expires_at: { $gt: new Date() }
      };
      
      if (state) filter.state = state;

      return await mongoClient.getTicketCounts(tableName, state);
    } catch (error) {
      console.error(`❌ Failed to get ${tableName} count:`, error);
      return 0;
    }
  }

  // Get single ticket by sys_id
  async getTicket(sysId: string): Promise<any | null> {
    if (!this.isConnected) return null;

    try {
      const document = await mongoClient.getTicket(sysId);
      if (document && document.expires_at > new Date()) {
        return document.raw_data;
      }
      return null;
    } catch (error) {
      console.error(`❌ Failed to get ticket ${sysId}:`, error);
      return null;
    }
  }

  // Log access for monitoring
  async logAccess(req: any, res: any, responseTime: number): Promise<void> {
    if (!this.isConnected) return;

    try {
      const log: Omit<AccessLogDocument, '_id'> = {
        timestamp: new Date(),
        ip_address: req.headers['x-forwarded-for'] || req.ip || 'unknown',
        user_agent: req.headers['user-agent'] || 'unknown',
        endpoint: req.path || req.url,
        method: req.method,
        response_code: res.status || 200,
        response_time_ms: responseTime,
        session_id: req.session?.id || undefined,
        user_id: req.user?.id || undefined
      };

      await mongoClient.logAccess(log);
    } catch (error) {
      console.error('❌ Failed to log access:', error);
    }
  }

  // Log errors for troubleshooting
  async logError(level: 'error' | 'warning' | 'info', message: string, context?: any): Promise<void> {
    if (!this.isConnected) return;

    try {
      const log: Omit<ErrorLogDocument, '_id'> = {
        timestamp: new Date(),
        level,
        message,
        stack_trace: context?.stack,
        context: context ? JSON.stringify(context, null, 2) : undefined,
        endpoint: context?.endpoint,
        user_id: context?.user_id,
        session_id: context?.session_id
      };

      await mongoClient.logError(log);
      
      // Also log to console for immediate visibility
      if (level === 'error') {
        console.error(`🔥 ${message}`, context);
      } else if (level === 'warning') {
        console.warn(`⚠️ ${message}`, context);
      } else {
        console.info(`ℹ️ ${message}`, context);
      }
    } catch (error) {
      console.error('❌ Failed to log error:', error);
    }
  }

  // Configuration management
  async setConfig(key: string, value: any, description?: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      await mongoClient.setConfig(key, value, description);
      console.log(`🍃 Config set: ${key} = ${JSON.stringify(value)}`);
    } catch (error) {
      console.error(`❌ Failed to set config ${key}:`, error);
    }
  }

  async getConfig(key: string, defaultValue?: any): Promise<any> {
    if (!this.isConnected) return defaultValue;

    try {
      const value = await mongoClient.getConfig(key);
      return value !== undefined ? value : defaultValue;
    } catch (error) {
      console.error(`❌ Failed to get config ${key}:`, error);
      return defaultValue;
    }
  }

  // Health check for monitoring
  async healthCheck(): Promise<{ mongodb: boolean }> {
    return {
      mongodb: this.isConnected && await mongoClient.healthCheck()
    };
  }

  // Analytics and reporting
  async getAccessStats(timeRange: number = 24): Promise<any> {
    if (!this.isConnected) return {};

    try {
      const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
      const logs = await mongoClient.getAccessLogs(
        { timestamp: { $gte: since } },
        10000
      );

      const stats = {
        total_requests: logs.length,
        unique_ips: new Set(logs.map(l => l.ip_address)).size,
        average_response_time: logs.reduce((sum, l) => sum + l.response_time_ms, 0) / logs.length,
        endpoints: {} as Record<string, number>,
        response_codes: {} as Record<number, number>
      };

      logs.forEach(log => {
        stats.endpoints[log.endpoint] = (stats.endpoints[log.endpoint] || 0) + 1;
        stats.response_codes[log.response_code] = (stats.response_codes[log.response_code] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('❌ Failed to get access stats:', error);
      return {};
    }
  }

  async getErrorStats(timeRange: number = 24): Promise<any> {
    if (!this.isConnected) return {};

    try {
      const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
      const logs = await mongoClient.getErrorLogs(
        { timestamp: { $gte: since } },
        1000
      );

      const stats = {
        total_errors: logs.length,
        by_level: {} as Record<string, number>,
        by_endpoint: {} as Record<string, number>
      };

      logs.forEach(log => {
        stats.by_level[log.level] = (stats.by_level[log.level] || 0) + 1;
        if (log.endpoint) {
          stats.by_endpoint[log.endpoint] = (stats.by_endpoint[log.endpoint] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      console.error('❌ Failed to get error stats:', error);
      return {};
    }
  }
}

export const persistenceService = new PersistenceService();