/**
 * Ticket Data Core - Base data operations and connection management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  mongoCollectionManager,
  IncidentDocument,
  ChangeTaskDocument,
  SCTaskDocument,
} from "../../config/mongodb-collections";
import { systemService } from "../SystemService";
import { enhancedTicketStorageService } from "../index";
import { logger } from "../../utils/Logger";
import type { TicketData } from "../../types/TicketTypes";

export class TicketDataCore {
  protected client: any = null;
  protected db: any = null;
  protected isConnected = false;
  protected groupService = systemService.getGroupManager();
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Using systemService group manager
    this.initPromise = this.initialize();
  }

  /**
   * Initialize the ticket data core
   */
  async initialize(): Promise<void> {
    try {
      await this.initializeMongoDB();
      await this.groupService.initialize();
      logger.info(" [TICKET-DATA] TicketDataCore initialized successfully");
    } catch (error) {
      logger.error(
        " [TICKET-DATA] Failed to initialize TicketDataCore:",
        error,
      );
      throw error;
    }
  }

  /**
   * Initialize MongoDB connection
   */
  private async initializeMongoDB(): Promise<void> {
    try {
      const { MongoClient } = await import("mongodb");

      const connectionString =
        process.env.MONGODB_URL ||
        `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}?authSource=${process.env.MONGODB_AUTH_SOURCE}`;

      this.client = new MongoClient(connectionString, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        family: 4,
        retryWrites: true,
        retryReads: true,
        w: "majority",
        readPreference: "primary",
        readConcern: { level: "majority" },
      });

      await this.client.connect();
      this.db = this.client.db("bunsnc");
      this.isConnected = true;

      logger.info(" [TICKET-DATA] MongoDB connection established");
    } catch (error) {
      logger.error(" [TICKET-DATA] MongoDB connection failed:", error);
      throw error;
    }
  }

  /**
   * Ensure connection is established
   */
  async ensureConnected(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Get MongoDB database instance
   */
  getDatabase() {
    return this.db;
  }

  /**
   * Get MongoDB client instance
   */
  getClient() {
    return this.client;
  }

  /**
   * Check if connection is active
   */
  isConnectionActive(): boolean {
    return this.isConnected;
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{
    incidents: number;
    changeTasks: number;
    scTasks: number;
    groups: number;
    lastSync: string;
  }> {
    await this.ensureConnected();

    try {
      const [incidentCount, changeTaskCount, scTaskCount, groupCount] =
        await Promise.all([
          this.db.collection("incidents").countDocuments(),
          this.db.collection("change_tasks").countDocuments(),
          this.db.collection("sc_tasks").countDocuments(),
          this.db.collection("sys_user_groups").countDocuments(),
        ]);

      return {
        incidents: incidentCount,
        changeTasks: changeTaskCount,
        scTasks: scTaskCount,
        groups: groupCount,
        lastSync: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`[TICKET-DATA] Error getting collection stats:`, error);
      return {
        incidents: 0,
        changeTasks: 0,
        scTasks: 0,
        groups: 0,
        lastSync: new Date().toISOString(),
      };
    }
  }

  /**
   * Get ticket from MongoDB
   */
  async getTicketFromMongoDB(
    sysId: string,
    table: string,
  ): Promise<TicketData | null> {
    await this.ensureConnected();

    try {
      let collection;
      switch (table) {
        case "incident":
          collection = mongoCollectionManager.getIncidentsCollection();
          break;
        case "change_task":
          collection = mongoCollectionManager.getChangeTasksCollection();
          break;
        case "sc_task":
          collection = mongoCollectionManager.getSCTasksCollection();
          break;
        default:
          return null;
      }

      const document = await collection.findOne({ "raw_data.sys_id": sysId });
      if (!document) return null;

      return this.convertMongoDocumentToTicketData(document, table);
    } catch (error) {
      logger.error(`[TICKET-DATA] Error fetching from MongoDB:`, error);
      return null;
    }
  }

  /**
   * Store ticket in MongoDB
   */
  async storeTicketInMongoDB(ticket: TicketData, table: string): Promise<void> {
    await this.ensureConnected();

    try {
      let collection;
      switch (table) {
        case "incident":
          collection = mongoCollectionManager.getIncidentsCollection();
          break;
        case "change_task":
          collection = mongoCollectionManager.getChangeTasksCollection();
          break;
        case "sc_task":
          collection = mongoCollectionManager.getSCTasksCollection();
          break;
        default:
          return;
      }

      const document = {
        sys_id: ticket.sysId,
        raw_data: ticket,
        updated_at: new Date(),
        synced_at: new Date(),
      };

      await collection.replaceOne({ sys_id: ticket.sysId }, document, {
        upsert: true,
      });
    } catch (error) {
      logger.error(`[TICKET-DATA] Error storing ticket in MongoDB:`, error);
    }
  }

  /**
   * Convert MongoDB document to ticket data
   */
  convertMongoDocumentToTicketData(doc: any, table: string): TicketData {
    const rawData = doc.raw_data || doc;
    return this.processTicketData(rawData);
  }

  /**
   * Convert MongoDB document to ServiceNow format
   */
  convertMongoDocumentToServiceNowFormat(doc: any, table: string): any {
    return doc.raw_data || doc;
  }

  /**
   * Process raw ticket data from ServiceNow
   */
  processTicketData(rawTicket: any): TicketData {
    const formattedCreatedOn = this.formatDate(
      rawTicket.sys_created_on?.display_value || rawTicket.sys_created_on || "",
    );

    return {
      sysId: this.extractValue(rawTicket.sys_id),
      number: this.extractValue(rawTicket.number),
      shortDescription:
        this.extractValue(rawTicket.short_description) || "Sem descrição",
      description:
        this.extractValue(rawTicket.description) || "Sem descrição detalhada",
      state: this.extractValue(rawTicket.state) || "1",
      priority: this.extractValue(rawTicket.priority) || "3",
      assignedTo: this.extractValue(rawTicket.assigned_to) || "Não atribuído",
      assignmentGroup:
        this.extractValue(rawTicket.assignment_group) || "Não atribuído",
      caller:
        this.extractValue(rawTicket.caller_id) ||
        this.extractValue(rawTicket.opened_by) ||
        "N/A",
      createdOn: formattedCreatedOn,
      table: this.extractValue(rawTicket.sys_class_name) || "incident",
      slaDue:
        this.extractValue(rawTicket.sla_due) === "N/A"
          ? null
          : this.extractValue(rawTicket.sla_due),
      businessStc:
        this.extractValue(rawTicket.business_stc) === "N/A"
          ? null
          : this.extractValue(rawTicket.business_stc),
      resolveTime:
        this.extractValue(rawTicket.resolve_time) === "N/A"
          ? null
          : this.extractValue(rawTicket.resolve_time),
      updatedOn: this.extractValue(rawTicket.sys_updated_on),
      category: this.extractValue(rawTicket.category),
      subcategory: this.extractValue(rawTicket.subcategory),
      urgency: this.extractValue(rawTicket.urgency) || "3",
      impact: this.extractValue(rawTicket.impact) || "3",
    };
  }

  /**
   * Utility: Extract value from ServiceNow field
   */
  extractValue(field: any): string {
    if (!field) return "N/A";
    if (typeof field === "string") return field;
    if (typeof field === "object" && field.display_value !== undefined)
      return String(field.display_value);
    if (typeof field === "object" && field.value !== undefined)
      return String(field.value);
    return String(field);
  }

  /**
   * Utility: Format date string
   */
  formatDate(dateString: string): string {
    if (!dateString) return "N/A";

    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("pt-BR", {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch (error) {
      return dateString.slice(0, 16);
    }

    return dateString.slice(0, 16);
  }

  /**
   * Map status codes to readable labels
   */
  getStatusLabel(state: string): string {
    const statusMap: Record<string, string> = {
      "1": "Novo",
      "2": "Em Progresso",
      "6": "Resolvido",
      "7": "Fechado",
    };
    return statusMap[state] || "Desconhecido";
  }

  /**
   * Map priority codes to readable labels
   */
  getPriorityLabel(priority: string): string {
    const priorityMap: Record<string, string> = {
      "1": "Crítica",
      "2": "Alta",
      "3": "Moderada",
      "4": "Baixa",
      "5": "Planejamento",
    };
    return priorityMap[priority] || "N/A";
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.isConnected = false;
    }
    logger.info("🧹 [TICKET-DATA] TicketDataCore cleaned up");
  }
}
