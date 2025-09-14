/**
 * Consolidated ServiceNow Service - Complete ServiceNow operations
 * Consolidates: servicenow.service, ConsolidatedServiceNowService, ConsolidatedServiceNowService, AttachmentService, BatchService
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/Logger';
import type {
  QueryOptions,
  ServiceNowRecord,
  SLMRecord,
  TaskSLAQueryOptions,
  TaskSLAResponse,
  SLABreachInfo,
  TicketSLASummary
} from "../types/servicenow";

// Action-related interfaces
export interface ResolveTicketRequest {
  table: string;
  sysId: string;
  resolutionCode: string;
  resolutionNotes: string;
  closeCode?: string;
}

export interface CloseTicketRequest {
  table: string;
  sysId: string;
  closeCode: string;
  closeNotes: string;
}

export interface ReopenTicketRequest {
  table: string;
  sysId: string;
  reopenNotes: string;
  reason: string;
}

export interface AssignTicketRequest {
  table: string;
  sysId: string;
  assignedTo?: string;
  assignmentGroup?: string;
  assignmentNotes?: string;
}

export interface UpdatePriorityRequest {
  table: string;
  sysId: string;
  newPriority: '1' | '2' | '3' | '4' | '5';
  justification: string;
}

export interface TicketActionResponse {
  success: boolean;
  sysId: string;
  previousState?: string;
  newState?: string;
  message: string;
  timestamp: string;
}

// Notes-related interfaces
export interface ServiceNowNote {
  sys_id: string;
  value: string;
  sys_created_on: string;
  sys_created_by: {
    display_value: string;
    value: string;
  };
  element_id: string;
  work_notes?: boolean;
}

export interface CreateNoteRequest {
  table: string;
  sysId: string;
  noteText: string;
  workNotes?: boolean;
}

// Batch operation interfaces
export interface BatchOperation {
  op: 'create' | 'read' | 'update' | 'delete';
  table: string;
  data?: any;
  sys_id?: string;
}

// Attachment interfaces
export interface AttachmentUploadRequest {
  table: string;
  sysId: string;
  file: File | Buffer;
  fileName: string;
}

export interface AttachmentInfo {
  sys_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  download_link: string;
}

export interface ServiceNowConfig {
  instanceUrl: string;
  authToken: string;
  rateLimiting?: {
    enabled: boolean;
    maxRequests: number;
    timeWindow: number;
  };
  retryPolicy?: {
    enabled: boolean;
    maxRetries: number;
    baseDelay: number;
  };
}

export class ConsolidatedServiceNowService extends EventEmitter {
  private baseUrl: string;
  private attachmentUrl: string;
  private headers: HeadersInit;
  private config: ServiceNowConfig;
  private requestQueue: Array<() => Promise<any>> = [];
  private rateLimitTracker: Map<string, number[]> = new Map();
  private isProcessingQueue = false;

  constructor(config: ServiceNowConfig) {
    super();
    this.config = config;
    this.baseUrl = `${config.instanceUrl}/api/now/table`;
    this.attachmentUrl = `${config.instanceUrl}/api/now/attachment`;
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': config.authToken.startsWith('Bearer ') ? config.authToken : `Bearer ${config.authToken}`
    };

    if (config.rateLimiting?.enabled) {
      this.startQueueProcessor();
    }
  }

  // ==================== CORE CRUD OPERATIONS ====================

  async create(table: string, data: ServiceNowRecord): Promise<ServiceNowRecord> {
    return this.executeRequest(async () => {
      const response = await fetch(`${this.baseUrl}/${table}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      const record = result.result || result;

      logger.info(`✅ [ServiceNow] Created record in ${table}: ${record.sys_id}`);
      this.emit('recordCreated', { table, sysId: record.sys_id, data: record });

      return record;
    });
  }

  async read(table: string, sysId: string): Promise<ServiceNowRecord | null> {
    return this.executeRequest(async () => {
      const response = await fetch(`${this.baseUrl}/${table}/${sysId}`, {
        method: 'GET',
        headers: this.headers
      });

      if (response.status === 404) {
        logger.warn(`❌ [ServiceNow] Record not found: ${table}/${sysId}`);
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      const record = result.result || result;

      logger.debug(`📖 [ServiceNow] Read record from ${table}: ${sysId}`);
      this.emit('recordRead', { table, sysId, data: record });

      return record;
    });
  }

  async update(table: string, sysId: string, data: Partial<ServiceNowRecord>): Promise<ServiceNowRecord> {
    return this.executeRequest(async () => {
      const response = await fetch(`${this.baseUrl}/${table}/${sysId}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      const record = result.result || result;

      logger.info(`🔄 [ServiceNow] Updated record in ${table}: ${sysId}`);
      this.emit('recordUpdated', { table, sysId, data: record });

      return record;
    });
  }

  async delete(table: string, sysId: string): Promise<boolean> {
    return this.executeRequest(async () => {
      const response = await fetch(`${this.baseUrl}/${table}/${sysId}`, {
        method: 'DELETE',
        headers: this.headers
      });

      if (response.status === 404) {
        logger.warn(`❌ [ServiceNow] Record not found for deletion: ${table}/${sysId}`);
        return false;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      logger.info(`🗑️ [ServiceNow] Deleted record from ${table}: ${sysId}`);
      this.emit('recordDeleted', { table, sysId });

      return true;
    });
  }

  async query(options: QueryOptions): Promise<ServiceNowRecord[]> {
    return this.executeRequest(async () => {
      const params = new URLSearchParams();

      if (options.filter) params.append('sysparm_query', options.filter);
      if (options.limit) params.append('sysparm_limit', options.limit.toString());
      if (options.offset) params.append('sysparm_offset', options.offset.toString());
      if (options.fields) params.append('sysparm_fields', options.fields.join(','));
      if (options.orderBy) params.append('sysparm_order_by', options.orderBy);

      const url = `${this.baseUrl}/${options.table}?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      const records = result.result || [];

      logger.info(`🔍 [ServiceNow] Queried ${records.length} records from ${options.table}`);
      this.emit('recordsQueried', { table: options.table, count: records.length, filter: options.filter });

      return records;
    });
  }

  // ==================== TICKET ACTIONS ====================

  async resolveTicket(request: ResolveTicketRequest): Promise<TicketActionResponse> {
    try {
      logger.info(`🔄 [ServiceNow] Resolving ticket ${request.table}/${request.sysId}`);

      // Get current ticket state
      const currentTicket = await this.read(request.table, request.sysId);
      if (!currentTicket) {
        throw new Error(`Ticket not found: ${request.sysId}`);
      }

      const previousState = currentTicket.state;

      // Prepare update data
      const updateData: any = {
        state: '6', // Resolved
        resolution_code: request.resolutionCode,
        resolved_at: new Date().toISOString(),
        resolved_by: 'system'
      };

      if (request.closeCode) {
        updateData.close_code = request.closeCode;
      }

      // Update ticket
      await this.update(request.table, request.sysId, updateData);

      // Add resolution notes
      if (request.resolutionNotes) {
        await this.addTicketNote({
          table: request.table,
          sysId: request.sysId,
          noteText: `Resolution Notes: ${request.resolutionNotes}`,
          workNotes: false
        });
      }

      const response: TicketActionResponse = {
        success: true,
        sysId: request.sysId,
        previousState,
        newState: '6',
        message: 'Ticket resolved successfully',
        timestamp: new Date().toISOString()
      };

      logger.info(`✅ [ServiceNow] Ticket resolved: ${request.sysId}`);
      this.emit('ticketResolved', response);

      return response;
    } catch (error) {
      logger.error('❌ [ServiceNow] Failed to resolve ticket:', error);
      throw error;
    }
  }

  async closeTicket(request: CloseTicketRequest): Promise<TicketActionResponse> {
    try {
      logger.info(`🔒 [ServiceNow] Closing ticket ${request.table}/${request.sysId}`);

      const currentTicket = await this.read(request.table, request.sysId);
      if (!currentTicket) {
        throw new Error(`Ticket not found: ${request.sysId}`);
      }

      const previousState = currentTicket.state;

      // Update ticket to closed state
      const updateData = {
        state: '7', // Closed
        close_code: request.closeCode,
        closed_at: new Date().toISOString(),
        closed_by: 'system'
      };

      await this.update(request.table, request.sysId, updateData);

      // Add close notes
      await this.addTicketNote({
        table: request.table,
        sysId: request.sysId,
        noteText: `Close Notes: ${request.closeNotes}`,
        workNotes: false
      });

      const response: TicketActionResponse = {
        success: true,
        sysId: request.sysId,
        previousState,
        newState: '7',
        message: 'Ticket closed successfully',
        timestamp: new Date().toISOString()
      };

      logger.info(`✅ [ServiceNow] Ticket closed: ${request.sysId}`);
      this.emit('ticketClosed', response);

      return response;
    } catch (error) {
      logger.error('❌ [ServiceNow] Failed to close ticket:', error);
      throw error;
    }
  }

  async reopenTicket(request: ReopenTicketRequest): Promise<TicketActionResponse> {
    try {
      logger.info(`🔓 [ServiceNow] Reopening ticket ${request.table}/${request.sysId}`);

      const currentTicket = await this.read(request.table, request.sysId);
      if (!currentTicket) {
        throw new Error(`Ticket not found: ${request.sysId}`);
      }

      const previousState = currentTicket.state;

      // Update ticket to reopened state
      const updateData = {
        state: '2', // In Progress
        reopened_at: new Date().toISOString(),
        reopened_by: 'system'
      };

      await this.update(request.table, request.sysId, updateData);

      // Add reopen notes
      await this.addTicketNote({
        table: request.table,
        sysId: request.sysId,
        noteText: `Ticket reopened. Reason: ${request.reason}. Notes: ${request.reopenNotes}`,
        workNotes: false
      });

      const response: TicketActionResponse = {
        success: true,
        sysId: request.sysId,
        previousState,
        newState: '2',
        message: 'Ticket reopened successfully',
        timestamp: new Date().toISOString()
      };

      logger.info(`✅ [ServiceNow] Ticket reopened: ${request.sysId}`);
      this.emit('ticketReopened', response);

      return response;
    } catch (error) {
      logger.error('❌ [ServiceNow] Failed to reopen ticket:', error);
      throw error;
    }
  }

  async assignTicket(request: AssignTicketRequest): Promise<TicketActionResponse> {
    try {
      logger.info(`👤 [ServiceNow] Assigning ticket ${request.table}/${request.sysId}`);

      const updateData: any = {};

      if (request.assignedTo) {
        updateData.assigned_to = request.assignedTo;
      }

      if (request.assignmentGroup) {
        updateData.assignment_group = request.assignmentGroup;
      }

      updateData.sys_updated_on = new Date().toISOString();

      await this.update(request.table, request.sysId, updateData);

      // Add assignment notes
      if (request.assignmentNotes) {
        await this.addTicketNote({
          table: request.table,
          sysId: request.sysId,
          noteText: `Assignment Notes: ${request.assignmentNotes}`,
          workNotes: true
        });
      }

      const response: TicketActionResponse = {
        success: true,
        sysId: request.sysId,
        message: 'Ticket assigned successfully',
        timestamp: new Date().toISOString()
      };

      logger.info(`✅ [ServiceNow] Ticket assigned: ${request.sysId}`);
      this.emit('ticketAssigned', response);

      return response;
    } catch (error) {
      logger.error('❌ [ServiceNow] Failed to assign ticket:', error);
      throw error;
    }
  }

  // ==================== NOTES OPERATIONS ====================

  async getTicketNotes(table: string, sysId: string): Promise<ServiceNowNote[]> {
    try {
      logger.debug(`📝 [ServiceNow] Fetching notes for ${table}/${sysId}`);

      const response = await this.query({
        table: 'sys_journal_field',
        filter: `element_id=${sysId}`,
        orderBy: 'sys_created_on',
        limit: 100
      });

      const notes: ServiceNowNote[] = response.map((note: any) => ({
        sys_id: this.extractValue(note.sys_id),
        value: this.extractValue(note.value),
        sys_created_on: this.extractValue(note.sys_created_on),
        sys_created_by: {
          display_value: this.extractValue(note.sys_created_by?.display_value) || 'Sistema',
          value: this.extractValue(note.sys_created_by?.value) || 'system'
        },
        element_id: this.extractValue(note.element_id),
        work_notes: note.element === 'work_notes'
      }));

      logger.debug(`📝 [ServiceNow] Retrieved ${notes.length} notes for ${table}/${sysId}`);
      return notes;
    } catch (error) {
      logger.error(`❌ [ServiceNow] Failed to fetch notes for ${table}/${sysId}:`, error);
      throw error;
    }
  }

  async addTicketNote(request: CreateNoteRequest): Promise<string> {
    try {
      logger.debug(`➕ [ServiceNow] Adding note to ${request.table}/${request.sysId}`);

      const noteField = request.workNotes ? 'work_notes' : 'comments';

      const updateData = {
        [noteField]: request.noteText
      };

      const response = await this.update(request.table, request.sysId, updateData);

      logger.info(`✅ [ServiceNow] Note added to ${request.table}/${request.sysId}`);
      this.emit('noteAdded', { table: request.table, sysId: request.sysId, noteText: request.noteText });

      return response.sys_id;
    } catch (error) {
      logger.error(`❌ [ServiceNow] Failed to add note to ${request.table}/${request.sysId}:`, error);
      throw error;
    }
  }

  // ==================== ATTACHMENT OPERATIONS ====================

  async uploadAttachment(request: AttachmentUploadRequest): Promise<AttachmentInfo> {
    return this.executeRequest(async () => {
      const url = `${this.attachmentUrl}/file?table_name=${encodeURIComponent(request.table)}&table_sys_id=${encodeURIComponent(request.sysId)}&file_name=${encodeURIComponent(request.fileName)}`;

      const formData = new FormData();

      if (request.file instanceof File) {
        formData.append("file", request.file, request.fileName);
      } else {
        // Convert Buffer to Blob for upload
        const blob = new Blob([request.file]);
        formData.append("file", blob, request.fileName);
      }

      const uploadHeaders = {
        "Accept": "application/json",
        "Authorization": this.headers.Authorization as string
      };

      const response = await fetch(url, {
        method: "POST",
        headers: uploadHeaders,
        body: formData
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${error}`);
      }

      const result = await response.json();
      const attachment = result.result || result;

      logger.info(`📎 [ServiceNow] Attachment uploaded: ${request.fileName} to ${request.table}/${request.sysId}`);
      this.emit('attachmentUploaded', { table: request.table, sysId: request.sysId, attachment });

      return {
        sys_id: attachment.sys_id,
        file_name: attachment.file_name,
        content_type: attachment.content_type,
        size_bytes: attachment.size_bytes,
        download_link: `${this.attachmentUrl}/${attachment.sys_id}/file`
      };
    });
  }

  async downloadAttachment(attachmentId: string): Promise<Uint8Array> {
    return this.executeRequest(async () => {
      const url = `${this.attachmentUrl}/${encodeURIComponent(attachmentId)}/file`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/octet-stream",
          "Authorization": this.headers.Authorization as string
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Download failed: ${response.status} - ${error}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      logger.info(`📥 [ServiceNow] Attachment downloaded: ${attachmentId}`);
      this.emit('attachmentDownloaded', { attachmentId });

      return new Uint8Array(arrayBuffer);
    });
  }

  async listAttachments(table: string, sysId: string): Promise<AttachmentInfo[]> {
    try {
      const response = await this.query({
        table: 'sys_attachment',
        filter: `table_name=${table}^table_sys_id=${sysId}`,
        fields: ['sys_id', 'file_name', 'content_type', 'size_bytes']
      });

      return response.map(att => ({
        sys_id: att.sys_id,
        file_name: att.file_name,
        content_type: att.content_type,
        size_bytes: parseInt(att.size_bytes) || 0,
        download_link: `${this.attachmentUrl}/${att.sys_id}/file`
      }));
    } catch (error) {
      logger.error(`❌ [ServiceNow] Failed to list attachments for ${table}/${sysId}:`, error);
      throw error;
    }
  }

  // ==================== BATCH OPERATIONS ====================

  async executeBatch(operations: BatchOperation[]): Promise<any[]> {
    try {
      logger.info(`🔄 [ServiceNow] Executing batch of ${operations.length} operations`);

      const results: any[] = [];

      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];

        try {
          let result;

          switch (operation.op) {
            case "create":
              result = await this.create(operation.table, operation.data);
              break;
            case "read":
              result = await this.read(operation.table, operation.sys_id!);
              break;
            case "update":
              result = await this.update(operation.table, operation.sys_id!, operation.data);
              break;
            case "delete":
              result = await this.delete(operation.table, operation.sys_id!);
              break;
            default:
              result = { error: `Unsupported operation: ${operation.op}` };
          }

          results.push({
            success: true,
            operation: operation.op,
            index: i,
            data: result
          });

        } catch (error: any) {
          logger.error(`❌ [ServiceNow] Batch operation failed:`, operation, error);
          results.push({
            success: false,
            operation: operation.op,
            index: i,
            table: operation.table,
            error: error?.message || String(error)
          });
        }
      }

      logger.info(`✅ [ServiceNow] Batch completed: ${results.filter(r => r.success).length}/${operations.length} successful`);
      this.emit('batchExecuted', { totalOperations: operations.length, successful: results.filter(r => r.success).length });

      return results;
    } catch (error) {
      logger.error('❌ [ServiceNow] Batch execution failed:', error);
      throw error;
    }
  }

  // ==================== SLA OPERATIONS ====================

  async getTaskSLAs(options: TaskSLAQueryOptions): Promise<TaskSLAResponse> {
    try {
      logger.debug(`🔍 [ServiceNow] Getting SLAs for task: ${options.taskNumber}`);

      const response = await this.query({
        table: 'task_sla',
        filter: `task.number=${options.taskNumber}`,
        limit: options.limit
      });

      const slmRecords: SLMRecord[] = response.map((sla: ServiceNowRecord) => ({
        sys_id: this.extractValue(sla.sys_id),
        task_number: this.extractValue(sla['task.number']),
        taskslatable_business_percentage: this.extractValue(sla.business_percentage),
        taskslatable_start_time: this.extractValue(sla.start_time),
        taskslatable_end_time: this.extractValue(sla.end_time),
        taskslatable_sla: this.extractValue(sla.sla),
        taskslatable_stage: this.extractValue(sla.stage),
        taskslatable_has_breached: this.extractValue(sla.has_breached),
        task_assignment_group: this.extractValue(sla['task.assignment_group']),
        raw_data: sla
      }));

      logger.debug(`✅ [ServiceNow] Found ${slmRecords.length} SLAs for task ${options.taskNumber}`);

      return {
        result: slmRecords,
        totalCount: slmRecords.length,
        hasMore: false
      };
    } catch (error) {
      logger.error(`❌ [ServiceNow] Error getting SLAs for task ${options.taskNumber}:`, error);
      throw error;
    }
  }

  async getTaskSLASummary(taskNumber: string): Promise<TicketSLASummary> {
    try {
      const slaResponse = await this.getTaskSLAs({
        taskNumber,
        includeDisplayValues: true
      });

      const slas = slaResponse.result;
      const breachedCount = slas.filter(sla => this.parseBoolean(sla.taskslatable_has_breached)).length;
      const activeCount = slas.filter(sla => sla.taskslatable_stage && sla.taskslatable_stage !== 'completed').length;

      const slaBreachInfos: SLABreachInfo[] = slas.map(sla => ({
        sla_name: sla.taskslatable_sla || 'Unknown SLA',
        has_breached: this.parseBoolean(sla.taskslatable_has_breached),
        business_percentage: this.parsePercentage(sla.taskslatable_business_percentage),
        start_time: sla.taskslatable_start_time,
        end_time: sla.taskslatable_end_time,
        stage: sla.taskslatable_stage || 'unknown',
        breach_time: this.parseBoolean(sla.taskslatable_has_breached) ? sla.taskslatable_end_time : undefined
      }));

      const worstSla = slaBreachInfos
        .filter(sla => sla.has_breached)
        .sort((a, b) => b.business_percentage - a.business_percentage)[0] || null;

      return {
        ticket_number: taskNumber,
        total_slas: slas.length,
        active_slas: activeCount,
        breached_slas: breachedCount,
        breach_percentage: slas.length > 0 ? (breachedCount / slas.length) * 100 : 0,
        worst_sla: worstSla,
        all_slas: slaBreachInfos
      };
    } catch (error) {
      logger.error(`❌ [ServiceNow] Error getting SLA summary for task ${taskNumber}:`, error);
      throw error;
    }
  }

  // ==================== RATE LIMITING & QUEUE MANAGEMENT ====================

  private async executeRequest<T>(operation: () => Promise<T>): Promise<T> {
    if (this.config.rateLimiting?.enabled) {
      return new Promise((resolve, reject) => {
        this.requestQueue.push(async () => {
          try {
            const result = await this.executeWithRetry(operation);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });

        if (!this.isProcessingQueue) {
          this.processQueue();
        }
      });
    }

    return this.executeWithRetry(operation);
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.config.retryPolicy?.enabled) {
      return operation();
    }

    const maxRetries = this.config.retryPolicy.maxRetries || 3;
    const baseDelay = this.config.retryPolicy.baseDelay || 1000;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          break;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(`⚠️ [ServiceNow] Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, lastError.message);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;
    const rateLimiting = this.config.rateLimiting!;

    while (this.requestQueue.length > 0) {
      const now = Date.now();
      const windowStart = now - rateLimiting.timeWindow;

      // Clean old requests from tracker
      for (const [key, timestamps] of this.rateLimitTracker) {
        this.rateLimitTracker.set(key, timestamps.filter(t => t > windowStart));
      }

      const recentRequests = this.rateLimitTracker.get('global') || [];

      if (recentRequests.length >= rateLimiting.maxRequests) {
        const oldestRequest = Math.min(...recentRequests);
        const waitTime = (oldestRequest + rateLimiting.timeWindow) - now;

        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }

      const request = this.requestQueue.shift();
      if (request) {
        // Track this request
        if (!this.rateLimitTracker.has('global')) {
          this.rateLimitTracker.set('global', []);
        }
        this.rateLimitTracker.get('global')!.push(now);

        await request();
      }
    }

    this.isProcessingQueue = false;
  }

  private startQueueProcessor(): void {
    setInterval(() => {
      if (!this.isProcessingQueue && this.requestQueue.length > 0) {
        this.processQueue();
      }
    }, 100);
  }

  // ==================== UTILITY METHODS ====================

  private extractValue(field: any): string {
    if (typeof field === 'string') return field;
    if (field && typeof field === 'object') {
      return field.display_value || field.value || '';
    }
    return '';
  }

  private parseBoolean(value: string | boolean): boolean {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  }

  private parsePercentage(value: string | null): number {
    if (!value) return 0;
    const cleaned = value.replace('%', '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  // ==================== HEALTH AND STATS ====================

  async getStats(): Promise<any> {
    try {
      return {
        requests_queued: this.requestQueue.length,
        rate_limiting_enabled: this.config.rateLimiting?.enabled || false,
        retry_policy_enabled: this.config.retryPolicy?.enabled || false,
        is_processing_queue: this.isProcessingQueue,
        recent_request_count: this.rateLimitTracker.get('global')?.length || 0,
        base_url: this.baseUrl,
        instance_url: this.config.instanceUrl
      };
    } catch (error) {
      logger.error('❌ [ServiceNow] Failed to get stats:', error);
      return {};
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple health check - try to read a system table
      const response = await fetch(`${this.baseUrl}/sys_user?sysparm_limit=1`, {
        method: 'GET',
        headers: this.headers
      });

      return response.ok;
    } catch (error) {
      logger.error('❌ [ServiceNow] Health check failed:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    this.requestQueue.length = 0;
    this.rateLimitTracker.clear();
    this.isProcessingQueue = false;
    logger.info('🧹 [ServiceNow] Cleanup completed');
  }
}

// ==================== SINGLETON INSTANCE ====================

const instanceUrl = process.env.SERVICENOW_INSTANCE_URL || 'https://iberdrola.service-now.com';
const authToken = process.env.SNC_AUTH_TOKEN || process.env.AUTH_SERVICE_URL;

if (!authToken) {
  throw new Error('ServiceNow authentication token is required. Set SNC_AUTH_TOKEN or AUTH_SERVICE_URL environment variable.');
}

const consolidatedServiceNowService = new ConsolidatedServiceNowService({
  instanceUrl,
  authToken,
  rateLimiting: {
    enabled: true,
    maxRequests: parseInt(process.env.SERVICENOW_RATE_LIMIT || '95'),
    timeWindow: 60000 // 1 minute
  },
  retryPolicy: {
    enabled: true,
    maxRetries: 3,
    baseDelay: 1000
  }
});

export { consolidatedServiceNowService };