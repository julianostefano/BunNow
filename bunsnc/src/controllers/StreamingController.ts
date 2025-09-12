/**
 * Streaming Controller - SSE streams and WebSocket handlers
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { APIController } from './APIController';

export class StreamingController {
  private apiController: APIController;

  constructor(apiController: APIController) {
    this.apiController = apiController;
  }

  public handleSSEStream(context: any) {
    const { set } = context;
    
    set.headers['Content-Type'] = 'text/event-stream';
    set.headers['Cache-Control'] = 'no-cache';
    set.headers['Connection'] = 'keep-alive';
    
    return new ReadableStream({
      start(controller) {
        const interval = setInterval(async () => {
          try {
            const incidentCount = await this.apiController.getActiveIncidentCount();
            const problemCount = await this.apiController.getOpenProblemCount();
            const changeCount = await this.apiController.getPendingChangeCount();
            
            controller.enqueue(`event: incident-count\ndata: ${incidentCount}\n\n`);
            controller.enqueue(`event: problem-count\ndata: ${problemCount}\n\n`);
            controller.enqueue(`event: change-count\ndata: ${changeCount}\n\n`);
            
            const processingStatus = await this.apiController.getProcessingStatus();
            controller.enqueue(`event: processing-status\ndata: ${processingStatus}\n\n`);
            
          } catch (error) {
            console.error('SSE stream error:', error);
          }
        }.bind(this), 5000);
        
        context.interval = interval;
      },
      cancel() {
        if (context.interval) {
          clearInterval(context.interval);
        }
      }
    });
  }

  public handleWebSocketMessage(ws: any, message: any): void {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      
      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        case 'subscribe':
          console.log('WebSocket subscription request:', data);
          break;
        default:
          console.log('Unknown WebSocket message type:', data.type);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  }

  public handleWebSocketOpen(ws: any): void {
    console.log('WebSocket client connected');
    ws.send(JSON.stringify({ 
      type: 'welcome', 
      message: 'Connected to ServiceNow Analytics Dashboard',
      timestamp: Date.now()
    }));
  }

  public handleWebSocketClose(ws: any): void {
    console.log('WebSocket client disconnected');
  }

  public handleWebSocketError(ws: any, error: any): void {
    console.error('WebSocket error:', error);
  }

  public broadcastUpdate(data: any): void {
    console.log('Broadcasting update to WebSocket clients:', data);
  }

  public createSSEEventData(eventType: string, data: any): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  public getStreamStatus(): { 
    isStreaming: boolean; 
    connections: number; 
    lastUpdate: Date;
  } {
    return {
      isStreaming: true,
      connections: 0,
      lastUpdate: new Date()
    };
  }
}