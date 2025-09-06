/**
 * Streaming Service - Real-time updates using Elysia SSE
 * Provides real-time ticket updates, sync progress, and test results
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { sse } from 'elysia';

export interface StreamEvent {
  event: string;
  data: any;
  id?: string;
  retry?: number;
}

export interface TicketUpdateEvent extends StreamEvent {
  event: 'ticket-update' | 'ticket-create' | 'ticket-delete';
  data: {
    ticketId: string;
    ticketNumber: string;
    ticketType: 'incident' | 'change_task' | 'sc_task';
    changes?: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
    timestamp: string;
  };
}

export interface SyncProgressEvent extends StreamEvent {
  event: 'sync-progress';
  data: {
    operation: 'sync-tickets' | 'analyze-endpoints' | 'map-structure';
    stage: string;
    progress: number; // 0-100
    current: number;
    total: number;
    message: string;
    timestamp: string;
  };
}

export interface TestProgressEvent extends StreamEvent {
  event: 'test-progress';
  data: {
    testType: 'endpoint-test' | 'structure-mapping' | 'performance-test';
    tableName: string;
    status: 'started' | 'in-progress' | 'completed' | 'error';
    progress: number;
    message: string;
    result?: any;
    timestamp: string;
  };
}

export interface DashboardStatsEvent extends StreamEvent {
  event: 'dashboard-stats';
  data: {
    totalTickets: number;
    activeTickets: number;
    recentUpdates: number;
    byType: {
      incident: number;
      change_task: number;
      sc_task: number;
    };
    byState: Record<number, number>;
    lastUpdate: string;
  };
}

export interface SLAEvent extends StreamEvent {
  event: 'sla-breach' | 'sla-warning' | 'sla-created' | 'sla-updated';
  data: {
    ticketId: string;
    ticketNumber: string;
    ticketType: 'incident' | 'change_task' | 'sc_task';
    slaId: string;
    slaName: string;
    stage: string;
    businessPercentage: number;
    hasBreached: boolean;
    startTime: string;
    endTime: string;
    breachTime?: string;
    assignmentGroup?: string;
    urgency?: string;
    priority?: string;
    timestamp: string;
  };
}

export interface SLAProgressEvent extends StreamEvent {
  event: 'sla-progress';
  data: {
    ticketNumber: string;
    slasSummary: {
      totalSlas: number;
      activeSlas: number;
      breachedSlas: number;
      breachPercentage: number;
      worstSla?: {
        slaName: string;
        businessPercentage: number;
        hasBreached: boolean;
      };
    };
    timestamp: string;
  };
}

export interface SLAMonitoringEvent extends StreamEvent {
  event: 'sla-monitoring';
  data: {
    operation: 'sla-sync' | 'breach-detection' | 'progress-calculation';
    stage: string;
    ticketsProcessed: number;
    totalTickets: number;
    breachesDetected: number;
    warningsGenerated: number;
    message: string;
    timestamp: string;
  };
}

export class StreamingService {
  private static instance: StreamingService;
  private activeConnections: Map<string, any> = new Map();
  private eventHistory: Map<string, StreamEvent[]> = new Map();
  private maxHistorySize = 100;

  private constructor() {}

  static getInstance(): StreamingService {
    if (!StreamingService.instance) {
      StreamingService.instance = new StreamingService();
    }
    return StreamingService.instance;
  }

  /**
   * Create a generic SSE stream generator
   */
  *createStream(clientId: string, filters?: { events?: string[], maxHistory?: number }) {
    console.log(`📡 SSE connection opened for client: ${clientId}`);
    
    // Store connection reference
    this.activeConnections.set(clientId, {
      connected: true,
      connectedAt: new Date(),
      filters: filters || {}
    });

    try {
      // Send connection established event
      yield sse({
        event: 'connected',
        data: {
          clientId,
          connectedAt: new Date().toISOString(),
          availableEvents: [
            'ticket-update', 'ticket-create', 'ticket-delete',
            'sync-progress', 'test-progress', 'dashboard-stats'
          ]
        }
      });

      // Send recent events if requested
      if (filters?.maxHistory && filters.maxHistory > 0) {
        const history = this.getEventHistory(filters.events, filters.maxHistory);
        for (const event of history) {
          yield sse(event);
        }
      }

      // Keep connection alive with heartbeat
      const heartbeatInterval = setInterval(() => {
        if (this.activeConnections.has(clientId)) {
          return sse({
            event: 'heartbeat',
            data: { timestamp: new Date().toISOString() }
          });
        }
      }, 30000); // 30 seconds

      // Wait for events or disconnection
      while (this.activeConnections.has(clientId)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      clearInterval(heartbeatInterval);

    } finally {
      this.activeConnections.delete(clientId);
      console.log(`📡 SSE connection closed for client: ${clientId}`);
    }
  }

  /**
   * Create a ticket updates stream
   */
  *createTicketUpdatesStream(clientId: string, filters?: { 
    ticketTypes?: string[], 
    assignmentGroups?: string[] 
  }) {
    console.log(`🎫 Ticket updates stream opened for client: ${clientId}`);
    
    this.activeConnections.set(clientId, {
      connected: true,
      connectedAt: new Date(),
      streamType: 'ticket-updates',
      filters: filters || {}
    });

    try {
      // Welcome message
      yield sse({
        event: 'stream-start',
        data: {
          streamType: 'ticket-updates',
          filters,
          timestamp: new Date().toISOString()
        }
      });

      // Simulate real-time ticket updates (in production, this would be triggered by actual data changes)
      let counter = 0;
      while (this.activeConnections.has(clientId)) {
        // Send periodic updates
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        if (!this.activeConnections.has(clientId)) break;

        counter++;
        yield sse({
          event: 'ticket-update',
          data: {
            ticketId: `ticket-${counter}`,
            ticketNumber: `INC${String(counter).padStart(7, '0')}`,
            ticketType: 'incident',
            changes: [
              {
                field: 'state',
                oldValue: 1,
                newValue: 2
              }
            ],
            timestamp: new Date().toISOString()
          },
          id: `update-${counter}`
        });
      }

    } finally {
      this.activeConnections.delete(clientId);
      console.log(`🎫 Ticket updates stream closed for client: ${clientId}`);
    }
  }

  /**
   * Create a sync progress stream for real-time sync monitoring
   */
  *createSyncProgressStream(clientId: string, operation: string) {
    console.log(`🔄 Sync progress stream opened for client: ${clientId}, operation: ${operation}`);
    
    this.activeConnections.set(clientId, {
      connected: true,
      connectedAt: new Date(),
      streamType: 'sync-progress',
      operation
    });

    try {
      const stages = [
        'Initializing connection to ServiceNow',
        'Fetching incident records',
        'Processing incidents',
        'Fetching change_task records', 
        'Processing change tasks',
        'Fetching sc_task records',
        'Processing service catalog tasks',
        'Updating database indexes',
        'Finalizing sync operation'
      ];

      for (let i = 0; i < stages.length; i++) {
        if (!this.activeConnections.has(clientId)) break;

        const progress = Math.round(((i + 1) / stages.length) * 100);
        
        yield sse({
          event: 'sync-progress',
          data: {
            operation,
            stage: stages[i],
            progress,
            current: i + 1,
            total: stages.length,
            message: stages[i],
            timestamp: new Date().toISOString()
          },
          id: `sync-${i + 1}`
        });

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Send completion event
      if (this.activeConnections.has(clientId)) {
        yield sse({
          event: 'sync-complete',
          data: {
            operation,
            message: 'Sync completed successfully',
            timestamp: new Date().toISOString(),
            summary: {
              incidents: 150,
              changeTasks: 75,
              scTasks: 200,
              totalProcessed: 425
            }
          }
        });
      }

    } finally {
      this.activeConnections.delete(clientId);
      console.log(`🔄 Sync progress stream closed for client: ${clientId}`);
    }
  }

  /**
   * Create a test progress stream for endpoint testing
   */
  *createTestProgressStream(clientId: string, testType: string) {
    console.log(`🧪 Test progress stream opened for client: ${clientId}, testType: ${testType}`);
    
    this.activeConnections.set(clientId, {
      connected: true,
      connectedAt: new Date(),
      streamType: 'test-progress',
      testType
    });

    try {
      const tables = ['incident', 'change_task', 'sc_task', 'sys_user_group'];
      
      yield sse({
        event: 'test-start',
        data: {
          testType,
          tables,
          timestamp: new Date().toISOString()
        }
      });

      for (let i = 0; i < tables.length; i++) {
        if (!this.activeConnections.has(clientId)) break;

        const table = tables[i];
        const progress = Math.round(((i + 1) / tables.length) * 100);

        // Test started
        yield sse({
          event: 'test-progress',
          data: {
            testType,
            tableName: table,
            status: 'started',
            progress: Math.round((i / tables.length) * 100),
            message: `Starting analysis of ${table} table`,
            timestamp: new Date().toISOString()
          }
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test in progress
        yield sse({
          event: 'test-progress',
          data: {
            testType,
            tableName: table,
            status: 'in-progress',
            progress: Math.round(((i + 0.5) / tables.length) * 100),
            message: `Analyzing ${table} structure and performance`,
            timestamp: new Date().toISOString()
          }
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test completed
        yield sse({
          event: 'test-progress',
          data: {
            testType,
            tableName: table,
            status: 'completed',
            progress,
            message: `Completed analysis of ${table}`,
            result: {
              recordCount: Math.floor(Math.random() * 1000) + 100,
              fieldCount: Math.floor(Math.random() * 50) + 20,
              responseTime: Math.floor(Math.random() * 500) + 100
            },
            timestamp: new Date().toISOString()
          }
        });
      }

      // Send completion
      if (this.activeConnections.has(clientId)) {
        yield sse({
          event: 'test-complete',
          data: {
            testType,
            message: 'All tests completed successfully',
            summary: {
              tablesAnalyzed: tables.length,
              totalFields: 180,
              avgResponseTime: 250
            },
            timestamp: new Date().toISOString()
          }
        });
      }

    } finally {
      this.activeConnections.delete(clientId);
      console.log(`🧪 Test progress stream closed for client: ${clientId}`);
    }
  }

  /**
   * Create dashboard statistics stream
   */
  *createDashboardStatsStream(clientId: string, intervalSeconds: number = 30) {
    console.log(`📊 Dashboard stats stream opened for client: ${clientId}`);
    
    this.activeConnections.set(clientId, {
      connected: true,
      connectedAt: new Date(),
      streamType: 'dashboard-stats',
      interval: intervalSeconds
    });

    try {
      while (this.activeConnections.has(clientId)) {
        // Generate mock dashboard stats (replace with real data in production)
        const stats = {
          totalTickets: Math.floor(Math.random() * 1000) + 500,
          activeTickets: Math.floor(Math.random() * 300) + 200,
          recentUpdates: Math.floor(Math.random() * 50) + 10,
          byType: {
            incident: Math.floor(Math.random() * 200) + 100,
            change_task: Math.floor(Math.random() * 100) + 50,
            sc_task: Math.floor(Math.random() * 150) + 75
          },
          byState: {
            1: Math.floor(Math.random() * 50) + 25, // New
            2: Math.floor(Math.random() * 100) + 50, // In Progress
            6: Math.floor(Math.random() * 200) + 100, // Resolved
            7: Math.floor(Math.random() * 300) + 200  // Closed
          },
          lastUpdate: new Date().toISOString()
        };

        yield sse({
          event: 'dashboard-stats',
          data: stats,
          id: `stats-${Date.now()}`
        });

        await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
      }

    } finally {
      this.activeConnections.delete(clientId);
      console.log(`📊 Dashboard stats stream closed for client: ${clientId}`);
    }
  }

  /**
   * Create an SLA monitoring stream for real-time SLA breach alerts
   */
  *createSLAMonitoringStream(clientId: string, filters?: { 
    ticketTypes?: string[], 
    assignmentGroups?: string[],
    breachesOnly?: boolean 
  }) {
    console.log(`⏰ SLA monitoring stream opened for client: ${clientId}`);
    
    this.activeConnections.set(clientId, {
      connected: true,
      connectedAt: new Date(),
      streamType: 'sla-monitoring',
      filters: filters || {}
    });

    try {
      // Welcome message
      yield sse({
        event: 'stream-start',
        data: {
          streamType: 'sla-monitoring',
          filters,
          timestamp: new Date().toISOString()
        }
      });

      // Simulate SLA monitoring (in production, this would monitor actual SLA data)
      let counter = 0;
      while (this.activeConnections.has(clientId)) {
        await new Promise(resolve => setTimeout(resolve, 8000)); // Check every 8 seconds
        
        if (!this.activeConnections.has(clientId)) break;

        counter++;
        
        // Simulate different types of SLA events
        const eventTypes = ['sla-breach', 'sla-warning', 'sla-updated'];
        const ticketTypes = ['incident', 'change_task', 'sc_task'];
        const eventType = eventTypes[counter % eventTypes.length];
        const ticketType = ticketTypes[counter % ticketTypes.length];
        const businessPercentage = eventType === 'sla-breach' ? 110 + Math.random() * 20 : 
                                  eventType === 'sla-warning' ? 85 + Math.random() * 10 :
                                  Math.random() * 100;
        
        const slaEvent: SLAEvent = {
          event: eventType as any,
          data: {
            ticketId: `sys_${Math.random().toString(36).substring(7)}`,
            ticketNumber: `${ticketType.toUpperCase().substring(0,3)}${String(counter).padStart(7, '0')}`,
            ticketType: ticketType as any,
            slaId: `sla_${Math.random().toString(36).substring(7)}`,
            slaName: `Resolution Time - ${ticketType.replace('_', ' ').toUpperCase()}`,
            stage: eventType === 'sla-breach' ? 'in_progress' : 'active',
            businessPercentage: Math.round(businessPercentage * 10) / 10,
            hasBreached: eventType === 'sla-breach',
            startTime: new Date(Date.now() - Math.random() * 86400000).toISOString(),
            endTime: new Date(Date.now() + Math.random() * 86400000).toISOString(),
            breachTime: eventType === 'sla-breach' ? new Date().toISOString() : undefined,
            assignmentGroup: 'IT Service Desk',
            urgency: '2',
            priority: '2',
            timestamp: new Date().toISOString()
          },
          id: `sla-${counter}`
        };

        // Filter based on client preferences
        if (filters?.breachesOnly && eventType !== 'sla-breach') {
          continue;
        }

        yield sse(slaEvent);
      }

    } finally {
      this.activeConnections.delete(clientId);
      console.log(`⏰ SLA monitoring stream closed for client: ${clientId}`);
    }
  }

  /**
   * Create an SLA progress stream for bulk SLA processing monitoring
   */
  *createSLAProgressStream(clientId: string, operation: string = 'sla-sync') {
    console.log(`📊 SLA progress stream opened for client: ${clientId}, operation: ${operation}`);
    
    this.activeConnections.set(clientId, {
      connected: true,
      connectedAt: new Date(),
      streamType: 'sla-progress',
      operation
    });

    try {
      const stages = [
        'Connecting to ServiceNow SLA APIs',
        'Retrieving task_sla records',
        'Processing SLA data for incidents',
        'Processing SLA data for change tasks', 
        'Processing SLA data for service catalog tasks',
        'Calculating breach percentages',
        'Detecting SLA violations',
        'Generating breach alerts',
        'Updating SLA dashboard metrics',
        'Finalizing SLA synchronization'
      ];

      let totalTickets = 450;
      let breachesDetected = 0;
      let warningsGenerated = 0;

      for (let i = 0; i < stages.length; i++) {
        if (!this.activeConnections.has(clientId)) break;

        const ticketsProcessed = Math.round((totalTickets / stages.length) * (i + 1));
        
        // Simulate breach detection
        if (i >= 5) {
          breachesDetected += Math.floor(Math.random() * 3);
          warningsGenerated += Math.floor(Math.random() * 5);
        }
        
        yield sse({
          event: 'sla-monitoring',
          data: {
            operation,
            stage: stages[i],
            ticketsProcessed,
            totalTickets,
            breachesDetected,
            warningsGenerated,
            message: stages[i],
            timestamp: new Date().toISOString()
          },
          id: `sla-monitoring-${i + 1}`
        });

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1800));
      }

      // Send completion event
      if (this.activeConnections.has(clientId)) {
        yield sse({
          event: 'sla-monitoring-complete',
          data: {
            operation,
            message: 'SLA monitoring completed successfully',
            timestamp: new Date().toISOString(),
            summary: {
              totalTickets,
              ticketsProcessed: totalTickets,
              breachesDetected,
              warningsGenerated,
              healthScore: Math.round((1 - breachesDetected / totalTickets) * 100)
            }
          }
        });
      }

    } finally {
      this.activeConnections.delete(clientId);
      console.log(`📊 SLA progress stream closed for client: ${clientId}`);
    }
  }

  /**
   * Create a real-time SLA dashboard stream
   */
  *createSLADashboardStream(clientId: string, intervalSeconds: number = 30) {
    console.log(`⚡ SLA dashboard stream opened for client: ${clientId}`);
    
    this.activeConnections.set(clientId, {
      connected: true,
      connectedAt: new Date(),
      streamType: 'sla-dashboard',
      interval: intervalSeconds
    });

    try {
      while (this.activeConnections.has(clientId)) {
        const slaStats = {
          totalActiveSLAs: Math.floor(Math.random() * 200) + 300,
          breachedSLAs: Math.floor(Math.random() * 25) + 10,
          slaWarnings: Math.floor(Math.random() * 40) + 20,
          avgCompletionPercentage: Math.round((Math.random() * 20 + 75) * 10) / 10,
          byType: {
            incident: {
              total: Math.floor(Math.random() * 100) + 150,
              breached: Math.floor(Math.random() * 8) + 5,
              avgPercentage: Math.round((Math.random() * 15 + 80) * 10) / 10
            },
            change_task: {
              total: Math.floor(Math.random() * 60) + 80,
              breached: Math.floor(Math.random() * 5) + 2,
              avgPercentage: Math.round((Math.random() * 10 + 85) * 10) / 10
            },
            sc_task: {
              total: Math.floor(Math.random() * 80) + 100,
              breached: Math.floor(Math.random() * 6) + 3,
              avgPercentage: Math.round((Math.random() * 12 + 78) * 10) / 10
            }
          },
          recentBreaches: Array.from({ length: 5 }, (_, i) => ({
            ticketNumber: `INC${String(Math.floor(Math.random() * 1000000)).padStart(7, '0')}`,
            slaName: 'Resolution Time',
            breachTime: new Date(Date.now() - Math.random() * 3600000).toISOString(),
            businessPercentage: Math.round((110 + Math.random() * 20) * 10) / 10
          })),
          lastUpdate: new Date().toISOString()
        };

        yield sse({
          event: 'sla-dashboard-stats',
          data: slaStats,
          id: `sla-stats-${Date.now()}`
        });

        await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
      }

    } finally {
      this.activeConnections.delete(clientId);
      console.log(`⚡ SLA dashboard stream closed for client: ${clientId}`);
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcastEvent(event: StreamEvent, filters?: { streamTypes?: string[] }): void {
    // Store event in history
    this.addToHistory(event);
    
    // In a real implementation, this would push the event to active connections
    console.log(`📢 Broadcasting event: ${event.event} to ${this.activeConnections.size} clients`);
  }

  /**
   * Send ticket update to relevant streams
   */
  broadcastTicketUpdate(ticketUpdate: TicketUpdateEvent): void {
    this.broadcastEvent(ticketUpdate, { streamTypes: ['ticket-updates', 'general'] });
  }

  /**
   * Send SLA breach alert to relevant streams
   */
  broadcastSLABreach(slaEvent: SLAEvent): void {
    this.broadcastEvent(slaEvent, { streamTypes: ['sla-monitoring', 'general'] });
  }

  /**
   * Send SLA warning to relevant streams
   */
  broadcastSLAWarning(slaEvent: SLAEvent): void {
    this.broadcastEvent(slaEvent, { streamTypes: ['sla-monitoring', 'general'] });
  }

  /**
   * Send SLA progress update to relevant streams
   */
  broadcastSLAProgress(progressEvent: SLAProgressEvent): void {
    this.broadcastEvent(progressEvent, { streamTypes: ['sla-progress', 'general'] });
  }

  /**
   * Send SLA monitoring update to relevant streams
   */
  broadcastSLAMonitoring(monitoringEvent: SLAMonitoringEvent): void {
    this.broadcastEvent(monitoringEvent, { streamTypes: ['sla-monitoring', 'sla-progress'] });
  }

  /**
   * Get active connections count
   */
  getActiveConnectionsCount(): number {
    return this.activeConnections.size;
  }

  /**
   * Get connection details
   */
  getConnectionDetails(): any[] {
    return Array.from(this.activeConnections.entries()).map(([clientId, details]) => ({
      clientId,
      ...details,
      connectedDuration: Date.now() - details.connectedAt.getTime()
    }));
  }

  // Helper methods
  private addToHistory(event: StreamEvent): void {
    const eventType = event.event;
    
    if (!this.eventHistory.has(eventType)) {
      this.eventHistory.set(eventType, []);
    }
    
    const history = this.eventHistory.get(eventType)!;
    history.push(event);
    
    // Keep only last maxHistorySize events
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }
  }

  private getEventHistory(eventTypes?: string[], maxCount?: number): StreamEvent[] {
    const allEvents: StreamEvent[] = [];
    
    for (const [eventType, events] of this.eventHistory) {
      if (!eventTypes || eventTypes.includes(eventType)) {
        allEvents.push(...events);
      }
    }
    
    // Sort by timestamp (assuming events have a data.timestamp field)
    allEvents.sort((a, b) => {
      const timeA = (a.data?.timestamp || new Date()).valueOf();
      const timeB = (b.data?.timestamp || new Date()).valueOf();
      return timeB - timeA; // Most recent first
    });
    
    return maxCount ? allEvents.slice(0, maxCount) : allEvents;
  }
}

// Export singleton instance
export const streamingService = StreamingService.getInstance();