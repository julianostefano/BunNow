/**
 * Server-Sent Events Service for Real-time Updates
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import type { ServiceNowStreams, ServiceNowChange } from '../config/redis-streams';

export interface SSEConnection {
  id: string;
  ticketSysId: string;
  controller: ReadableStreamDefaultController;
  isAlive: boolean;
  lastPing: number;
}

export interface SSEMessage {
  type: 'ticket-updated' | 'sla-updated' | 'note-added' | 'ping';
  data: any;
  timestamp: string;
}

export class SSEService {
  private connections: Map<string, SSEConnection> = new Map();
  private redisStreams: ServiceNowStreams;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(redisStreams: ServiceNowStreams) {
    this.redisStreams = redisStreams;
    this.startPingInterval();
    this.subscribeToRedisStreams();
  }

  /**
   * Create SSE connection for ticket updates
   * @param ticketSysId - Ticket system ID to monitor
   * @returns Response for SSE connection
   */
  createTicketSSEConnection(ticketSysId: string): Response {
    const connectionId = `ticket-${ticketSysId}-${Date.now()}`;
    console.log(`📡 Creating SSE connection for ticket ${ticketSysId}: ${connectionId}`);

    let connectionRef: SSEConnection;

    const stream = new ReadableStream({
      start: (controller) => {
        connectionRef = {
          id: connectionId,
          ticketSysId,
          controller,
          isAlive: true,
          lastPing: Date.now()
        };

        this.connections.set(connectionId, connectionRef);

        // Send initial connection message
        this.sendMessage(connectionRef, {
          type: 'ping',
          data: { message: 'Connected to ticket updates', ticketSysId },
          timestamp: new Date().toISOString()
        });

        console.log(`✅ SSE connection established: ${connectionId}`);
      },
      
      cancel: () => {
        console.log(`🔌 SSE connection closed: ${connectionId}`);
        this.connections.delete(connectionId);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });
  }

  /**
   * Send message to specific SSE connection
   * @param connection - SSE connection
   * @param message - Message to send
   */
  private sendMessage(connection: SSEConnection, message: SSEMessage): void {
    if (!connection.isAlive) return;

    try {
      const sseData = `data: ${JSON.stringify(message)}\n\n`;
      connection.controller.enqueue(new TextEncoder().encode(sseData));
      connection.lastPing = Date.now();
    } catch (error) {
      console.error(`❌ Error sending SSE message to ${connection.id}:`, error);
      this.closeConnection(connection.id);
    }
  }

  /**
   * Broadcast message to all connections monitoring a specific ticket
   * @param ticketSysId - Ticket system ID
   * @param message - Message to broadcast
   */
  broadcastToTicket(ticketSysId: string, message: SSEMessage): void {
    const connections = Array.from(this.connections.values())
      .filter(conn => conn.ticketSysId === ticketSysId && conn.isAlive);

    if (connections.length === 0) {
      console.log(`📭 No active connections for ticket ${ticketSysId}`);
      return;
    }

    console.log(`📢 Broadcasting to ${connections.length} connections for ticket ${ticketSysId}`);
    
    connections.forEach(connection => {
      this.sendMessage(connection, message);
    });
  }

  /**
   * Subscribe to Redis Streams for ticket changes
   */
  private subscribeToRedisStreams(): void {
    this.redisStreams.subscribe('ticket-updates', async (change: ServiceNowChange) => {
      console.log(`🔄 Received Redis change for ${change.sys_id}:`, change.action);

      const message: SSEMessage = {
        type: 'ticket-updated',
        data: {
          sysId: change.sys_id,
          number: change.number,
          action: change.action,
          state: change.state,
          changedFields: this.extractChangedFields(change),
          timestamp: change.timestamp
        },
        timestamp: new Date().toISOString()
      };

      this.broadcastToTicket(change.sys_id, message);
    });

    console.log('🎯 Subscribed to Redis Streams for real-time updates');
  }

  /**
   * Extract changed fields from ServiceNow change event
   * @param change - ServiceNow change event
   * @returns Array of changed field names
   */
  private extractChangedFields(change: ServiceNowChange): string[] {
    // This would normally come from ServiceNow audit data
    // For now, we'll infer from the action type
    const changedFields: string[] = [];
    
    if (change.action === 'updated') {
      changedFields.push('sys_updated_on');
    }
    
    if (change.action === 'resolved') {
      changedFields.push('state', 'resolved_at', 'close_code');
    }
    
    return changedFields;
  }

  /**
   * Start ping interval to keep connections alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 30000; // 30 seconds

      Array.from(this.connections.entries()).forEach(([connectionId, connection]) => {
        if (now - connection.lastPing > staleThreshold) {
          console.log(`⚰️ Closing stale SSE connection: ${connectionId}`);
          this.closeConnection(connectionId);
        } else {
          // Send ping to keep connection alive
          this.sendMessage(connection, {
            type: 'ping',
            data: { timestamp: new Date().toISOString() },
            timestamp: new Date().toISOString()
          });
        }
      });
    }, 15000); // Ping every 15 seconds

    console.log('⏰ Started SSE ping interval');
  }

  /**
   * Close specific SSE connection
   * @param connectionId - Connection ID to close
   */
  private closeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isAlive = false;
      try {
        connection.controller.close();
      } catch (error) {
        console.warn(`⚠️ Error closing SSE controller for ${connectionId}:`, error);
      }
      this.connections.delete(connectionId);
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): { 
    totalConnections: number;
    ticketConnections: Map<string, number>;
  } {
    const stats = {
      totalConnections: this.connections.size,
      ticketConnections: new Map<string, number>()
    };

    // Group by ticket sys_id
    Array.from(this.connections.values()).forEach(connection => {
      const current = stats.ticketConnections.get(connection.ticketSysId) || 0;
      stats.ticketConnections.set(connection.ticketSysId, current + 1);
    });

    return stats;
  }

  /**
   * Cleanup service and close all connections
   */
  cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    Array.from(this.connections.keys()).forEach(connectionId => {
      this.closeConnection(connectionId);
    });

    console.log('🧹 SSE Service cleaned up');
  }
}