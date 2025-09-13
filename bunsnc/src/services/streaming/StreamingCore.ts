/**
 * Streaming Core - Base configuration and connection management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { sse } from 'elysia';
import type { ServiceNowStreams, ServiceNowChange } from '../../config/redis-streams';

// Unified Interfaces
export interface StreamConnection {
  id: string;
  ticketSysId?: string;
  controller?: ReadableStreamDefaultController;
  isAlive: boolean;
  lastPing: number;
  streamType: 'ticket-updates' | 'sync-progress' | 'test-progress' | 'dashboard-stats' | 'sla-monitoring' | 'general';
  filters?: any;
  connectedAt: Date;
}

export interface UnifiedStreamEvent {
  event: 'ticket-updated' | 'ticket-created' | 'ticket-deleted' |
         'sla-breach' | 'sla-warning' | 'sla-updated' |
         'sync-progress' | 'test-progress' | 'dashboard-stats' |
         'ping' | 'connected' | 'heartbeat';
  data: any;
  id?: string;
  timestamp: string;
  retry?: number;
}

export interface TicketUpdateEvent extends UnifiedStreamEvent {
  event: 'ticket-updated' | 'ticket-created' | 'ticket-deleted';
  data: {
    sysId: string;
    number: string;
    ticketType: 'incident' | 'change_task' | 'sc_task';
    action: 'create' | 'update' | 'delete' | 'resolve';
    state?: string;
    changes?: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
    changedFields?: string[];
    timestamp: string;
  };
}

export interface SLAEvent extends UnifiedStreamEvent {
  event: 'sla-breach' | 'sla-warning' | 'sla-updated';
  data: {
    ticketSysId: string;
    ticketNumber: string;
    slaName: string;
    slaType: 'incident' | 'change_task' | 'sc_task';
    businessPercentage: number;
    hasBreached: boolean;
    stage: string;
    remainingTime?: string;
    breachTime?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    assignmentGroup?: string;
    timestamp: string;
  };
}

export interface SyncProgressEvent extends UnifiedStreamEvent {
  event: 'sync-progress';
  data: {
    operation: string;
    currentStep: string;
    progress: number; // 0-100
    totalItems?: number;
    processedItems?: number;
    itemsPerSecond?: number;
    estimatedTimeRemaining?: number;
    errors?: number;
    timestamp: string;
  };
}

export interface DashboardStatsEvent extends UnifiedStreamEvent {
  event: 'dashboard-stats';
  data: {
    totalTickets: number;
    activeTickets: number;
    resolvedToday: number;
    averageResolutionTime: number;
    ticketsByType: {
      incidents: number;
      changeTasks: number;
      serviceCatalogTasks: number;
    };
    criticalTickets: number;
    slaStats?: {
      totalActiveSLAs: number;
      breachedSLAs: number;
      slaWarnings: number;
      avgCompletionPercentage: number;
    };
    lastUpdate: string;
  };
}

export class StreamingCore {
  protected connections: Map<string, StreamConnection> = new Map();
  protected eventHistory: Map<string, UnifiedStreamEvent[]> = new Map();
  protected redisStreams: ServiceNowStreams | null = null;
  protected pingInterval: NodeJS.Timeout | null = null;
  protected maxHistorySize = 100;

  constructor() {
    this.startPingInterval();
  }

  /**
   * Initialize service with Redis Streams
   */
  initialize(redisStreams: ServiceNowStreams): void {
    this.redisStreams = redisStreams;
    this.subscribeToRedisStreams();
    console.log('🚀 StreamingCore initialized with Redis Streams');
  }

  /**
   * Get active connections count
   */
  getActiveConnectionsCount(): number {
    return this.connections.size;
  }

  /**
   * Get connections by stream type
   */
  getConnectionsByType(streamType: StreamConnection['streamType']): StreamConnection[] {
    return Array.from(this.connections.values()).filter(conn => conn.streamType === streamType);
  }

  /**
   * Add connection to the pool
   */
  protected addConnection(connection: StreamConnection): void {
    this.connections.set(connection.id, connection);
    console.log(`✅ Connection added: ${connection.id} (${connection.streamType})`);
  }

  /**
   * Remove connection from the pool
   */
  protected removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
    console.log(`🔌 Connection removed: ${connectionId}`);
  }

  /**
   * Check if connection exists and is alive
   */
  protected isConnectionAlive(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    return connection ? connection.isAlive : false;
  }

  /**
   * Update connection last ping time
   */
  protected updateConnectionPing(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastPing = Date.now();
    }
  }

  /**
   * Send SSE message through controller
   */
  protected sendSSEMessage(connection: StreamConnection, event: UnifiedStreamEvent): void {
    if (!connection.controller || !connection.isAlive) return;

    try {
      const sseData = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\nid: ${event.id || Date.now()}\n\n`;
      connection.controller.enqueue(new TextEncoder().encode(sseData));

      // Store in history
      this.addToEventHistory(connection.streamType, event);

    } catch (error) {
      console.error(`❌ Error sending SSE message to ${connection.id}:`, error);
      connection.isAlive = false;
      this.removeConnection(connection.id);
    }
  }

  /**
   * Add event to history
   */
  protected addToEventHistory(streamType: string, event: UnifiedStreamEvent): void {
    if (!this.eventHistory.has(streamType)) {
      this.eventHistory.set(streamType, []);
    }

    const history = this.eventHistory.get(streamType)!;
    history.push(event);

    // Keep only recent events
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }
  }

  /**
   * Get event history for specific stream types
   */
  protected getEventHistory(streamTypes: string[], maxEvents: number = 10): UnifiedStreamEvent[] {
    const allEvents: UnifiedStreamEvent[] = [];

    for (const streamType of streamTypes) {
      const history = this.eventHistory.get(streamType) || [];
      allEvents.push(...history);
    }

    // Sort by timestamp and return recent events
    return allEvents
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, maxEvents);
  }

  /**
   * Start periodic ping to keep connections alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      const staleConnectionTimeout = 60000; // 1 minute

      for (const [connectionId, connection] of this.connections) {
        if (now - connection.lastPing > staleConnectionTimeout) {
          console.log(`🚨 Removing stale connection: ${connectionId}`);
          connection.isAlive = false;
          this.removeConnection(connectionId);
          continue;
        }

        // Send ping to active connections
        if (connection.isAlive) {
          this.sendSSEMessage(connection, {
            event: 'ping',
            data: { timestamp: new Date().toISOString() },
            timestamp: new Date().toISOString()
          });
        }
      }
    }, 30000); // Every 30 seconds

    console.log('🏓 Connection ping interval started');
  }

  /**
   * Subscribe to Redis Streams for real-time events
   */
  private subscribeToRedisStreams(): void {
    if (!this.redisStreams) return;

    // Subscribe to ticket updates
    this.redisStreams.subscribe('ticket-updates', async (change: ServiceNowChange) => {
      const ticketConnections = this.getConnectionsByType('ticket-updates');

      const event: TicketUpdateEvent = {
        event: change.action === 'delete' ? 'ticket-deleted' :
               change.action === 'create' ? 'ticket-created' : 'ticket-updated',
        data: {
          sysId: change.sys_id,
          number: change.number,
          ticketType: change.ticketType as any,
          action: change.action,
          state: change.state,
          changes: change.changes || [],
          changedFields: change.changedFields || [],
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      // Send to all ticket update connections
      for (const connection of ticketConnections) {
        // Apply filters if any
        if (this.shouldSendEvent(connection, event)) {
          this.sendSSEMessage(connection, event);
        }
      }
    });

    console.log('📡 Subscribed to Redis streams');
  }

  /**
   * Check if event should be sent to connection based on filters
   */
  private shouldSendEvent(connection: StreamConnection, event: UnifiedStreamEvent): boolean {
    if (!connection.filters) return true;

    // Implement filter logic based on connection filters
    // This could include ticketType, assignmentGroup, priority, etc.
    if (event.event.includes('ticket') && 'data' in event) {
      const eventData = event.data as any;

      if (connection.filters.ticketType && eventData.ticketType !== connection.filters.ticketType) {
        return false;
      }

      if (connection.filters.ticketSysId && eventData.sysId !== connection.filters.ticketSysId) {
        return false;
      }
    }

    return true;
  }

  /**
   * Cleanup connections and stop ping interval
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all connections
    for (const [connectionId, connection] of this.connections) {
      connection.isAlive = false;
      if (connection.controller) {
        try {
          connection.controller.close();
        } catch (error) {
          console.warn(`Warning closing connection ${connectionId}:`, error);
        }
      }
    }

    this.connections.clear();
    this.eventHistory.clear();

    console.log('📴 StreamingCore shutdown completed');
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    connections: number;
    eventHistory: number;
    redisConnected: boolean;
  } {
    const totalHistoryEvents = Array.from(this.eventHistory.values())
      .reduce((total, history) => total + history.length, 0);

    return {
      status: this.connections.size > 0 ? 'healthy' : 'degraded',
      connections: this.connections.size,
      eventHistory: totalHistoryEvents,
      redisConnected: this.redisStreams !== null
    };
  }
}