/**
 * Stream Handler - Real-time event processing for synchronization
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from "../ServiceNowAuthClient";
import { SyncManager, SyncResult } from "./SyncManager";
import { ServiceNowChange } from "../../config/redis-streams";

export class StreamHandler {
  private serviceNowService: ServiceNowAuthClient;
  private syncManager: SyncManager;

  constructor(
    serviceNowService: ServiceNowAuthClient,
    syncManager: SyncManager,
  ) {
    this.serviceNowService = serviceNowService;
    this.syncManager = syncManager;
  }

  /**
   * Handle real-time changes from Redis Streams
   */
  async handleStreamChange(change: ServiceNowChange): Promise<void> {
    try {
      console.log(
        `📡 Received stream change: ${change.type}:${change.action} for ${change.sys_id}`,
      );

      // Fetch fresh data from ServiceNow
      const response = await this.serviceNowService.makeRequestFullFields(
        change.type,
        `sys_id=${change.sys_id}`,
        1,
      );

      const tickets = response?.result;
      if (tickets && tickets.length > 0) {
        const result: SyncResult = {
          table: change.type,
          processed: 0,
          updated: 0,
          created: 0,
          errors: 0,
          conflicts: 0,
          duration: 0,
          lastSyncTime: new Date().toISOString(),
        };

        await this.syncManager.syncTicket(tickets[0], change.type, result);
        console.log(
          ` Real-time sync completed for ${change.type}/${change.sys_id}`,
        );
      }
    } catch (error) {
      console.error(` Error handling stream change:`, error);
    }
  }

  /**
   * Register stream change handlers for multiple change types
   */
  getStreamChangeHandler(): (change: ServiceNowChange) => Promise<void> {
    return this.handleStreamChange.bind(this);
  }
}
