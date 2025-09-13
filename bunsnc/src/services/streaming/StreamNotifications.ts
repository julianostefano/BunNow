/**
 * Stream Notifications - Event broadcasting and notification management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import type { ServiceNowStreams, ServiceNowChange } from '../../config/redis-streams';
import { StreamConnection, UnifiedStreamEvent, TicketUpdateEvent } from './StreamingCore';

export class StreamNotifications {
  protected connections: Map<string, StreamConnection>;
  protected eventHistory: Map<string, UnifiedStreamEvent[]>;
  protected redisStreams: ServiceNowStreams | null = null;
  protected maxHistorySize = 100;

  constructor(
    connections: Map<string, StreamConnection>,
    eventHistory: Map<string, UnifiedStreamEvent[]>
  ) {
    this.connections = connections;
    this.eventHistory = eventHistory;
  }

  /**
   * Initialize Redis streams for notifications
   */
  initializeRedisStreams(redisStreams: ServiceNowStreams): void {
    this.redisStreams = redisStreams;
    this.subscribeToRedisStreams();
    console.log('📡 Stream notifications initialized with Redis Streams');
  }

  /**
   * Subscribe to Redis Streams for real-time events
   */
  private subscribeToRedisStreams(): void {
    if (!this.redisStreams) return;

    this.redisStreams.subscribe('ticket-updates', async (change: ServiceNowChange) => {
      console.log(`🔄 Received Redis change for ${change.sys_id}:`, change.action);

      const ticketEvent: TicketUpdateEvent = {
        event: change.action === 'delete' ? 'ticket-deleted' :
               change.action === 'create' ? 'ticket-created' : 'ticket-updated',
        data: {
          sysId: change.sys_id,
          number: change.number,
          ticketType: change.type as any,
          action: change.action,
          state: change.state,
          changes: change.changes || [],
          changedFields: this.extractChangedFields(change),
          timestamp: change.timestamp
        },
        timestamp: new Date().toISOString()
      };

      this.broadcastToTicket(change.sys_id, ticketEvent);
      this.addToEventHistory(ticketEvent.event, ticketEvent);
    });

    console.log('🎯 Subscribed to Redis Streams for real-time notifications');
  }

  /**
   * Send SSE message through controller
   */
  sendSSEMessage(connection: StreamConnection, event: UnifiedStreamEvent): void {
    if (!connection.controller || !connection.isAlive) return;

    try {
      const sseData = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\nid: ${event.id || Date.now()}\n\n`;
      connection.controller.enqueue(new TextEncoder().encode(sseData));

      // Store in history
      this.addToEventHistory(connection.streamType, event);

    } catch (error) {
      console.error(`❌ Error sending SSE message to ${connection.id}:`, error);
      connection.isAlive = false;
    }
  }

  /**
   * Broadcast message to all connections monitoring a specific ticket
   */
  broadcastToTicket(ticketSysId: string, message: UnifiedStreamEvent): void {
    const connections = Array.from(this.connections.values())
      .filter(conn => conn.ticketSysId === ticketSysId && conn.isAlive);

    if (connections.length === 0) {
      console.log(`📭 No active connections for ticket ${ticketSysId}`);
      return;
    }

    console.log(`📢 Broadcasting to ${connections.length} connections for ticket ${ticketSysId}`);

    connections.forEach(connection => {
      this.sendSSEMessage(connection, message);
    });
  }

  /**
   * Broadcast event to all matching connections
   */
  broadcastEvent(event: UnifiedStreamEvent, filters?: { streamTypes?: string[] }): void {
    this.addToEventHistory(event.event, event);

    const targetConnections = Array.from(this.connections.values()).filter(conn => {
      if (!conn.isAlive) return false;
      if (filters?.streamTypes && !filters.streamTypes.includes(conn.streamType)) return false;
      return true;
    });

    console.log(`📢 Broadcasting ${event.event} to ${targetConnections.length} clients`);

    targetConnections.forEach(connection => {
      if (connection.controller) {
        this.sendSSEMessage(connection, event);
      }
    });
  }

  /**
   * Add event to history
   */
  private addToEventHistory(streamType: string, event: UnifiedStreamEvent): void {
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
  getEventHistory(streamTypes: string[], maxEvents: number = 10): UnifiedStreamEvent[] {
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
   * Extract changed fields from ServiceNow change event
   */
  private extractChangedFields(change: ServiceNowChange): string[] {
    const changedFields: string[] = [];

    if (change.action === 'update') {
      changedFields.push('sys_updated_on');
    }

    if (change.action === 'resolve') {
      changedFields.push('state', 'resolved_at', 'close_code');
    }

    if (change.changes) {
      change.changes.forEach(changeItem => {
        if (changeItem.field) {
          changedFields.push(changeItem.field);
        }
      });
    }

    return changedFields;
  }

  /**
   * Get connection statistics for monitoring
   */
  getConnectionStats(): {
    totalConnections: number;
    connectionsByType: Record<string, number>;
    ticketConnections: Map<string, number>;
    connectionDetails: any[];
  } {
    const stats = {
      totalConnections: this.connections.size,
      connectionsByType: {} as Record<string, number>,
      ticketConnections: new Map<string, number>(),
      connectionDetails: [] as any[]
    };

    Array.from(this.connections.values()).forEach(connection => {
      // Count by stream type
      const type = connection.streamType;
      stats.connectionsByType[type] = (stats.connectionsByType[type] || 0) + 1;

      // Count by ticket
      if (connection.ticketSysId) {
        const current = stats.ticketConnections.get(connection.ticketSysId) || 0;
        stats.ticketConnections.set(connection.ticketSysId, current + 1);
      }

      // Connection details
      stats.connectionDetails.push({
        id: connection.id,
        streamType: connection.streamType,
        ticketSysId: connection.ticketSysId,
        connectedAt: connection.connectedAt,
        connectedDuration: Date.now() - connection.connectedAt.getTime(),
        isAlive: connection.isAlive,
        hasController: !!connection.controller
      });
    });

    return stats;
  }

  /**
   * Send ping notifications to maintain connections
   */
  sendPingNotifications(): void {
    const activeConnections = Array.from(this.connections.values()).filter(conn => conn.isAlive);

    activeConnections.forEach(connection => {
      if (connection.controller) {
        this.sendSSEMessage(connection, {
          event: 'ping',
          data: { timestamp: new Date().toISOString() },
          timestamp: new Date().toISOString()
        });
        connection.lastPing = Date.now();
      }
    });

    console.log(`🏓 Sent ping to ${activeConnections.length} active connections`);
  }

  /**
   * Check for stale connections and clean them up
   */
  cleanupStaleConnections(staleThreshold: number = 60000): string[] {
    const now = Date.now();
    const staleConnections: string[] = [];

    for (const [connectionId, connection] of this.connections) {
      if (now - connection.lastPing > staleThreshold) {
        console.log(`🚨 Removing stale connection: ${connectionId}`);
        connection.isAlive = false;
        if (connection.controller) {
          try {
            connection.controller.close();
          } catch (error) {
            console.warn(`Warning closing connection ${connectionId}:`, error);
          }
        }
        staleConnections.push(connectionId);
      }
    }

    // Remove stale connections
    staleConnections.forEach(connectionId => {
      this.connections.delete(connectionId);
    });

    return staleConnections;
  }
}