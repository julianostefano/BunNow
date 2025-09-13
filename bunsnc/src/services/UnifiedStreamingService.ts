/**
 * Unified Streaming Service - Consolidated SSE and Real-time Updates
 * Combines SSEService + StreamingService with modular architecture
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { StreamingCore, StreamConnection, UnifiedStreamEvent } from './streaming/StreamingCore';
import { StreamHandlers } from './streaming/StreamHandlers';
import { StreamNotifications } from './streaming/StreamNotifications';
import type { ServiceNowStreams } from '../config/redis-streams';

// Re-export types for compatibility
export type {
  StreamConnection,
  UnifiedStreamEvent,
  TicketUpdateEvent,
  SLAEvent,
  SyncProgressEvent,
  DashboardStatsEvent
} from './streaming/StreamingCore';

export class UnifiedStreamingService extends StreamingCore {
  private static instance: UnifiedStreamingService;
  private handlers: StreamHandlers;
  private notifications: StreamNotifications;

  private constructor() {
    super();
    // Initialize modular components with shared state
    this.handlers = new StreamHandlers();
    this.notifications = new StreamNotifications(this.connections, this.eventHistory);
    console.log('🚀 UnifiedStreamingService initialized with modular architecture');
  }

  static getInstance(): UnifiedStreamingService {
    if (!UnifiedStreamingService.instance) {
      UnifiedStreamingService.instance = new UnifiedStreamingService();
    }
    return UnifiedStreamingService.instance;
  }

  /**
   * Initialize service with Redis Streams
   */
  initialize(redisStreams: ServiceNowStreams): void {
    super.initialize(redisStreams);
    this.notifications.initializeRedisStreams(redisStreams);
    console.log('✅ All streaming modules initialized');
  }

  // === Stream Handler Methods ===
  /**
   * Create Elysia generator-based stream (Modern streaming)
   */
  *createStream(clientId: string, streamType: StreamConnection['streamType'], options?: {
    filters?: any;
    maxHistory?: number;
    ticketSysId?: string;
    intervalSeconds?: number;
  }) {
    yield* this.handlers.createStream(clientId, streamType, options);
  }

  /**
   * Create SSE connection for ticket updates (Legacy SSE compatibility)
   */
  createTicketSSEConnection(ticketSysId: string): Response {
    return this.handlers.createTicketSSEConnection(ticketSysId);
  }

  // === Notification Methods ===
  /**
   * Broadcast message to all connections monitoring a specific ticket
   */
  broadcastToTicket(ticketSysId: string, message: UnifiedStreamEvent): void {
    this.notifications.broadcastToTicket(ticketSysId, message);
  }

  /**
   * Broadcast event to all matching connections
   */
  broadcastEvent(event: UnifiedStreamEvent, filters?: { streamTypes?: string[] }): void {
    this.notifications.broadcastEvent(event, filters);
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
    return this.notifications.getConnectionStats();
  }

  // === Core Management Methods ===
  /**
   * Get active connections count
   */
  getActiveConnectionsCount(): number {
    return super.getActiveConnectionsCount();
  }

  /**
   * Get connections by stream type
   */
  getConnectionsByType(streamType: StreamConnection['streamType']): StreamConnection[] {
    return super.getConnectionsByType(streamType);
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
    return super.getHealthStatus();
  }

  /**
   * Enhanced cleanup with modular components
   */
  cleanup(): void {
    // Clean up stale connections
    this.notifications.cleanupStaleConnections();

    // Shutdown core functionality
    super.shutdown();

    console.log('🧹 UnifiedStreamingService cleanup completed');
  }

  // === Legacy Compatibility Methods ===
  /**
   * Legacy method for backward compatibility
   */
  sendSSEMessage(connection: StreamConnection, message: UnifiedStreamEvent): void {
    this.notifications.sendSSEMessage(connection, message);
  }

  /**
   * Legacy ping method for backward compatibility
   */
  sendPingNotifications(): void {
    this.notifications.sendPingNotifications();
  }

  /**
   * Legacy cleanup method name
   */
  shutdown(): void {
    this.cleanup();
  }
}

// Export singleton instance for backward compatibility
export const unifiedStreamingService = UnifiedStreamingService.getInstance();