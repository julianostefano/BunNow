/**
 * WebSocket Handler for Real-time ServiceNow Updates
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { websocket } from '@elysiajs/websocket';
import { Elysia } from 'elysia';
import { serviceNowStreams, type ServiceNowChange } from '../config/redis-streams';
import { serviceNowRepository } from '../repositories/ServiceNowRepository';


interface WebSocketClient {
  id: string;
  subscriptions: Set<string>;
  lastPing: number;
}

export class WebSocketManager {
  private clients = new Map<any, WebSocketClient>();
  private clientCounter = 0;

  constructor() {
    this.initializeStreamConsumers();
    this.startHealthCheck();
  }

  /**
   * Initialize Redis stream consumers for WebSocket broadcasting
   */
  private initializeStreamConsumers(): void {
    // Register consumer for all ServiceNow changes
    serviceNowStreams.registerConsumer(['*'], async (change: ServiceNowChange) => {
      await this.broadcastUpdate({
        type: 'ticket_updated',
        data: change,
        timestamp: new Date().toISOString(),
      });
    });

    console.log('📡 WebSocket consumers initialized for ServiceNow streams');
  }

  /**
   * Start periodic health check and metrics broadcast
   */
  private startHealthCheck(): void {
    setInterval(async () => {
      const metrics = await serviceNowRepository.getServiceNowMetrics();
      const rateLimitStats = // Rate limiting now handled internally: getMetrics();

      await this.broadcastUpdate({
        type: 'metrics_updated',
        data: {
          metrics,
          rateLimitStats,
          clientCount: this.clients.size,
        },
        timestamp: new Date().toISOString(),
      });

      // Cleanup inactive clients
      this.cleanupInactiveClients();
    }, 30000); // Every 30 seconds
  }

  /**
   * Handle new WebSocket connection
   */
  onConnection(ws: any): void {
    const client: WebSocketClient = {
      id: `client_${++this.clientCounter}`,
      subscriptions: new Set(['dashboard', 'metrics']),
      lastPing: Date.now(),
    };

    this.clients.set(ws, client);

    console.log(`🔌 WebSocket client connected: ${client.id} (total: ${this.clients.size})`);

    // Send welcome message with current metrics
    this.sendToClient(ws, {
      type: 'connection_established',
      data: {
        clientId: client.id,
        message: 'Conectado ao sistema BunSNC',
        availableChannels: ['dashboard', 'metrics', 'tickets', 'incidents', 'change_tasks', 'sc_tasks'],
      },
      timestamp: new Date().toISOString(),
    });

    // Send initial metrics
    serviceNowRepository.getServiceNowMetrics().then(metrics => {
      this.sendToClient(ws, {
        type: 'metrics_updated',
        data: { metrics },
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Handle WebSocket message from client
   */
  async onMessage(ws: any, message: any): Promise<void> {
    const client = this.clients.get(ws);
    if (!client) return;

    client.lastPing = Date.now();

    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;

      switch (data.action) {
        case 'subscribe':
          await this.handleSubscription(ws, client, data.channels || []);
          break;

        case 'unsubscribe':
          await this.handleUnsubscription(ws, client, data.channels || []);
          break;

        case 'ping':
          this.sendToClient(ws, {
            type: 'pong',
            timestamp: new Date().toISOString(),
          });
          break;

        case 'get_metrics':
          await this.handleMetricsRequest(ws);
          break;

        case 'get_tickets':
          await this.handleTicketsRequest(ws, data.filters || {});
          break;

        case 'refresh_dashboard':
          await this.handleDashboardRefresh(ws);
          break;

        default:
          this.sendToClient(ws, {
            type: 'error',
            data: { message: `Unknown action: ${data.action}` },
            timestamp: new Date().toISOString(),
          });
      }
    } catch (error) {
      console.error(` WebSocket message error for ${client.id}:`, error);
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Invalid message format' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  onDisconnection(ws: any): void {
    const client = this.clients.get(ws);
    if (client) {
      console.log(`🔌 WebSocket client disconnected: ${client.id} (remaining: ${this.clients.size - 1})`);
      this.clients.delete(ws);
    }
  }

  /**
   * Handle subscription to channels
   */
  private async handleSubscription(ws: any, client: WebSocketClient, channels: string[]): Promise<void> {
    for (const channel of channels) {
      client.subscriptions.add(channel);
    }

    this.sendToClient(ws, {
      type: 'subscription_updated',
      data: {
        subscriptions: Array.from(client.subscriptions),
        message: `Inscrito em ${channels.join(', ')}`,
      },
      timestamp: new Date().toISOString(),
    });

    console.log(`📺 Client ${client.id} subscribed to: ${channels.join(', ')}`);
  }

  /**
   * Handle unsubscription from channels
   */
  private async handleUnsubscription(ws: any, client: WebSocketClient, channels: string[]): Promise<void> {
    for (const channel of channels) {
      client.subscriptions.delete(channel);
    }

    this.sendToClient(ws, {
      type: 'subscription_updated',
      data: {
        subscriptions: Array.from(client.subscriptions),
        message: `Desinscrito de ${channels.join(', ')}`,
      },
      timestamp: new Date().toISOString(),
    });

    console.log(`📺 Client ${client.id} unsubscribed from: ${channels.join(', ')}`);
  }

  /**
   * Handle metrics request
   */
  private async handleMetricsRequest(ws: any): Promise<void> {
    try {
      const metrics = await serviceNowRepository.getServiceNowMetrics();
      const rateLimitStats = // Rate limiting now handled internally: getMetrics();
      const streamStats = await serviceNowStreams.getStreamStats();

      this.sendToClient(ws, {
        type: 'metrics_response',
        data: {
          metrics,
          rateLimitStats,
          streamStats,
          serverInfo: {
            clients: this.clients.size,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Failed to get metrics' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle tickets request with filters
   */
  private async handleTicketsRequest(ws: any, filters: any): Promise<void> {
    try {
      let tickets;
      
      if (filters.type === 'resolved') {
        tickets = await serviceNowRepository.getResolvedTickets(50, 0);
      } else if (filters.search || filters.ticketType || filters.status) {
        tickets = await serviceNowRepository.searchTickets(
          filters.search,
          filters.ticketType,
          filters.status,
          filters.assignmentGroup,
          undefined,
          undefined,
          50,
          0
        );
      } else {
        tickets = await serviceNowRepository.getActiveTickets(50, 0);
      }

      this.sendToClient(ws, {
        type: 'tickets_response',
        data: {
          tickets,
          filters,
          total: tickets.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Failed to get tickets' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle dashboard refresh request
   */
  private async handleDashboardRefresh(ws: any): Promise<void> {
    try {
      const [metrics, healthStats, streamHealth] = await Promise.all([
        serviceNowRepository.getServiceNowMetrics(),
        serviceNowRepository.getHealthStats(),
        serviceNowStreams.healthCheck(),
      ]);

      this.sendToClient(ws, {
        type: 'dashboard_refresh',
        data: {
          metrics,
          healthStats,
          streamHealth,
          refreshedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Failed to refresh dashboard' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(ws: any, data: any): void {
    try {
      ws.send(JSON.stringify(data));
    } catch (error) {
      console.error(' Failed to send WebSocket message:', error);
    }
  }

  /**
   * Broadcast update to all subscribed clients
   */
  private async broadcastUpdate(data: any): Promise<void> {
    if (this.clients.size === 0) return;

    const message = JSON.stringify(data);
    let sentCount = 0;

    for (const [ws, client] of this.clients) {
      try {
        // Check if client is subscribed to this type of update
        const shouldReceive = 
          client.subscriptions.has('dashboard') ||
          client.subscriptions.has('metrics') ||
          (data.type.includes('ticket') && client.subscriptions.has('tickets'));

        if (shouldReceive) {
          ws.send(message);
          sentCount++;
        }
      } catch (error) {
        console.error(` Failed to send to client ${client.id}:`, error);
        this.clients.delete(ws);
      }
    }

    if (sentCount > 0) {
      console.log(`📡 Broadcast sent to ${sentCount} clients: ${data.type}`);
    }
  }

  /**
   * Cleanup inactive clients
   */
  private cleanupInactiveClients(): void {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [ws, client] of this.clients) {
      if (now - client.lastPing > timeout) {
        console.log(`🧹 Cleaning up inactive client: ${client.id}`);
        try {
          ws.close();
        } catch (error) {
          // Ignore close errors
        }
        this.clients.delete(ws);
      }
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): any {
    const subscriptionCounts = {};
    for (const client of this.clients.values()) {
      for (const subscription of client.subscriptions) {
        subscriptionCounts[subscription] = (subscriptionCounts[subscription] || 0) + 1;
      }
    }

    return {
      totalClients: this.clients.size,
      subscriptions: subscriptionCounts,
      uptime: process.uptime(),
      lastCleanup: new Date().toISOString(),
    };
  }
}

// Create WebSocket plugin for Elysia
export const createWebSocketPlugin = () => {
  const wsManager = new WebSocketManager();

  return new Elysia()
    .use(websocket())
    .ws('/ws/dashboard', {
      open: (ws) => wsManager.onConnection(ws),
      message: (ws, message) => wsManager.onMessage(ws, message),
      close: (ws) => wsManager.onDisconnection(ws),
    })
    .get('/ws/stats', () => wsManager.getStats());
};