/**
 * Server-Sent Events Routes for Real-time Updates
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from 'elysia';
import { SSEService } from '../services/SSEService';
import { ServiceNowStreams } from '../config/redis-streams';

export const createSSERoutes = (redisStreams: ServiceNowStreams) => {
  const sseService = new SSEService(redisStreams);
  
  return new Elysia({ prefix: '/sse' })
    /**
     * SSE endpoint for ticket updates
     * GET /sse/ticket-updates/:sysId
     */
    .get('/ticket-updates/:sysId', ({ params: { sysId } }) => {
      console.log(`📡 SSE connection requested for ticket: ${sysId}`);
      return sseService.createTicketSSEConnection(sysId);
    })

    /**
     * Get SSE connection statistics
     * GET /sse/stats
     */
    .get('/stats', () => {
      const stats = sseService.getConnectionStats();
      return {
        success: true,
        data: {
          totalConnections: stats.totalConnections,
          ticketConnections: Object.fromEntries(stats.ticketConnections),
          timestamp: new Date().toISOString()
        }
      };
    })

    /**
     * Health check for SSE service
     * GET /sse/health
     */
    .get('/health', () => {
      return {
        success: true,
        service: 'SSE Service',
        status: 'healthy',
        timestamp: new Date().toISOString()
      };
    });
};