/**
 * Ticket Sync Service - ServiceNow synchronization and integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TicketDataCore } from "./TicketDataCore";
import { ServiceNowAuthClient } from "../ServiceNowAuthClient";
import { logger } from "../../utils/Logger";

export interface TicketSyncResult {
  success: boolean;
  stats: {
    incidents: { synced: number; errors: number };
    change_tasks: { synced: number; errors: number };
    sc_tasks: { synced: number; errors: number };
    groups: { synced: number; errors: number };
  };
}

export class TicketSyncService extends TicketDataCore {
  private serviceNowClient: ServiceNowAuthClient;

  constructor(serviceNowClient: ServiceNowAuthClient) {
    super();
    this.serviceNowClient = serviceNowClient;
  }

  /**
   * Sync current month tickets from ServiceNow
   */
  async syncCurrentMonthTickets(): Promise<TicketSyncResult> {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const startDate = `${currentMonth}-01`;
      const endDate = new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0,
      )
        .toISOString()
        .slice(0, 10);

      logger.info(
        `[TICKET-SYNC] Starting sync for tickets from ${startDate} to ${endDate}`,
      );

      const stats = {
        incidents: { synced: 0, errors: 0 },
        change_tasks: { synced: 0, errors: 0 },
        sc_tasks: { synced: 0, errors: 0 },
        groups: { synced: 0, errors: 0 },
      };

      // Sync all ticket types
      await Promise.all([
        this.syncTicketsOfType("incident", startDate, endDate, stats.incidents),
        this.syncTicketsOfType(
          "change_task",
          startDate,
          endDate,
          stats.change_tasks,
        ),
        this.syncTicketsOfType("sc_task", startDate, endDate, stats.sc_tasks),
      ]);

      // Sync groups
      await this.syncGroups(stats.groups);

      logger.info(`[TICKET-SYNC] Sync completed:`, stats);

      return { success: true, stats };
    } catch (error) {
      logger.error(`[TICKET-SYNC] Error during ticket sync:`, error);
      return {
        success: false,
        stats: {
          incidents: { synced: 0, errors: 1 },
          change_tasks: { synced: 0, errors: 1 },
          sc_tasks: { synced: 0, errors: 1 },
          groups: { synced: 0, errors: 1 },
        },
      };
    }
  }

  /**
   * Sync tickets of specific type for date range
   */
  async syncTicketsOfType(
    table: string,
    startDate: string,
    endDate: string,
    stats: any,
  ): Promise<void> {
    try {
      const query = `sys_created_on>=${startDate}^sys_created_on<=${endDate}`;
      const response = await this.serviceNowClient.makeRequestFullFields(
        table,
        query,
        1000,
      );

      if (response?.result) {
        logger.info(
          `[TICKET-SYNC] Syncing ${response.result.length} ${table} tickets`,
        );

        for (const ticket of response.result) {
          try {
            const processedTicket = this.processTicketData(ticket);
            await this.storeTicketInMongoDB(processedTicket, table);
            stats.synced++;
          } catch (error) {
            logger.error(`[TICKET-SYNC] Error syncing ${table} ticket:`, error);
            stats.errors++;
          }
        }
      }
    } catch (error) {
      logger.error(
        `[TICKET-SYNC] Error syncing tickets of type ${table}:`,
        error,
      );
      stats.errors++;
    }
  }

  /**
   * Sync user groups from ServiceNow
   */
  async syncGroups(stats: any): Promise<void> {
    try {
      const response = await this.serviceNowClient.makeRequestFullFields(
        "sys_user_group",
        "",
        1000,
      );

      if (response?.result) {
        logger.info(
          `[TICKET-SYNC] Syncing ${response.result.length} user groups`,
        );

        const db = this.getDatabase();
        for (const group of response.result) {
          try {
            await db.collection("sys_user_groups").replaceOne(
              { sys_id: group.sys_id },
              {
                sys_id: group.sys_id,
                name: group.name,
                description: group.description,
                raw_data: group,
                updated_at: new Date(),
              },
              { upsert: true },
            );
            stats.synced++;
          } catch (error) {
            logger.error(`[TICKET-SYNC] Error syncing group:`, error);
            stats.errors++;
          }
        }
      }
    } catch (error) {
      logger.error(`[TICKET-SYNC] Error syncing groups:`, error);
      stats.errors++;
    }
  }

  /**
   * Sync specific ticket by sys_id
   */
  async syncTicketBySysId(sysId: string, table: string): Promise<boolean> {
    try {
      logger.info(
        `[TICKET-SYNC] Syncing single ticket: ${sysId} from ${table}`,
      );

      const response = await this.serviceNowClient.makeRequestFullFields(
        table,
        `sys_id=${sysId}`,
        1,
      );

      const ticket = response?.result?.[0];
      if (!ticket) {
        logger.warn(`[TICKET-SYNC] Ticket not found in ServiceNow: ${sysId}`);
        return false;
      }

      const processedTicket = this.processTicketData(ticket);
      await this.storeTicketInMongoDB(processedTicket, table);

      logger.info(`[TICKET-SYNC] Successfully synced ticket: ${sysId}`);
      return true;
    } catch (error) {
      logger.error(`[TICKET-SYNC] Error syncing ticket ${sysId}:`, error);
      return false;
    }
  }

  /**
   * Sync tickets by date range for all types
   */
  async syncTicketsByDateRange(
    startDate: string,
    endDate: string,
  ): Promise<TicketSyncResult> {
    try {
      logger.info(
        `[TICKET-SYNC] Starting date range sync from ${startDate} to ${endDate}`,
      );

      const stats = {
        incidents: { synced: 0, errors: 0 },
        change_tasks: { synced: 0, errors: 0 },
        sc_tasks: { synced: 0, errors: 0 },
        groups: { synced: 0, errors: 0 },
      };

      // Sync all ticket types for the date range
      await Promise.all([
        this.syncTicketsOfType("incident", startDate, endDate, stats.incidents),
        this.syncTicketsOfType(
          "change_task",
          startDate,
          endDate,
          stats.change_tasks,
        ),
        this.syncTicketsOfType("sc_task", startDate, endDate, stats.sc_tasks),
      ]);

      logger.info(`[TICKET-SYNC] Date range sync completed:`, stats);

      return { success: true, stats };
    } catch (error) {
      logger.error(`[TICKET-SYNC] Error during date range sync:`, error);
      return {
        success: false,
        stats: {
          incidents: { synced: 0, errors: 1 },
          change_tasks: { synced: 0, errors: 1 },
          sc_tasks: { synced: 0, errors: 1 },
          groups: { synced: 0, errors: 1 },
        },
      };
    }
  }

  /**
   * Sync tickets by assignment group
   */
  async syncTicketsByGroup(
    groupName: string,
    maxRecords: number = 1000,
  ): Promise<{
    synced: number;
    errors: number;
  }> {
    try {
      logger.info(`[TICKET-SYNC] Syncing tickets for group: ${groupName}`);

      const syncResult = { synced: 0, errors: 0 };

      // Sync all ticket types for the group
      for (const table of ["incident", "change_task", "sc_task"]) {
        try {
          const query = `assignment_group.name=${groupName}`;
          const response = await this.serviceNowClient.makeRequestFullFields(
            table,
            query,
            maxRecords,
          );

          if (response?.result) {
            for (const ticket of response.result) {
              try {
                const processedTicket = this.processTicketData(ticket);
                await this.storeTicketInMongoDB(processedTicket, table);
                syncResult.synced++;
              } catch (error) {
                logger.error(
                  `[TICKET-SYNC] Error syncing ${table} ticket for group ${groupName}:`,
                  error,
                );
                syncResult.errors++;
              }
            }
          }
        } catch (error) {
          logger.error(
            `[TICKET-SYNC] Error syncing ${table} tickets for group ${groupName}:`,
            error,
          );
          syncResult.errors++;
        }
      }

      logger.info(
        `[TICKET-SYNC] Group sync completed for ${groupName}:`,
        syncResult,
      );
      return syncResult;
    } catch (error) {
      logger.error(
        `[TICKET-SYNC] Error during group sync for ${groupName}:`,
        error,
      );
      return { synced: 0, errors: 1 };
    }
  }
}
