/**
 * Ticket Type Manager - Manages all ServiceNow ticket types and their configurations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

interface TicketTypeConfig {
  table: string;
  collection: string;
  displayName: string;
  primaryKey: string;
  numberField: string;
  stateField: string;
  priorityField?: string;
  assignmentGroupField: string;
  assignedToField?: string;
  callerField?: string;
  slaSupported: boolean;
  notesSupported: boolean;
  customFields: string[];
  queryConfig: {
    defaultOrderBy: string;
    defaultFilter?: string;
    batchSize: number;
  };
}

export class TicketTypeManager {
  private static instance: TicketTypeManager;
  
  // Configuração completa de todos os tipos de tickets
  private readonly TICKET_CONFIGS: Map<string, TicketTypeConfig> = new Map([
    // Incident Management
    ['incident', {
      table: 'incident',
      collection: 'incidents_complete',
      displayName: 'Incident',
      primaryKey: 'sys_id',
      numberField: 'number',
      stateField: 'incident_state',
      priorityField: 'priority',
      assignmentGroupField: 'assignment_group',
      assignedToField: 'assigned_to',
      callerField: 'caller_id',
      slaSupported: true,
      notesSupported: true,
      customFields: [
        'severity', 'urgency', 'impact', 'category', 'subcategory',
        'problem_id', 'caused_by', 'close_code', 'close_notes',
        'resolution_code', 'resolution_notes', 'resolved_by',
        'resolved_at', 'reopened_time', 'reopened_by'
      ],
      queryConfig: {
        defaultOrderBy: 'sys_updated_on',
        batchSize: 50
      }
    }],
    
    // Change Management
    ['change_task', {
      table: 'change_task',
      collection: 'change_tasks_complete',
      displayName: 'Change Task',
      primaryKey: 'sys_id',
      numberField: 'number',
      stateField: 'state',
      priorityField: 'priority',
      assignmentGroupField: 'assignment_group',
      assignedToField: 'assigned_to',
      slaSupported: true,
      notesSupported: true,
      customFields: [
        'change_request', 'change_request_number', 'type', 'planned_start_date',
        'planned_end_date', 'actual_start_date', 'actual_end_date',
        'close_code', 'close_notes', 'order'
      ],
      queryConfig: {
        defaultOrderBy: 'sys_updated_on',
        batchSize: 50
      }
    }],
    
    ['change_request', {
      table: 'change_request', 
      collection: 'changes_complete',
      displayName: 'Change Request',
      primaryKey: 'sys_id',
      numberField: 'number',
      stateField: 'state',
      priorityField: 'priority',
      assignmentGroupField: 'assignment_group',
      assignedToField: 'assigned_to',
      callerField: 'requested_by',
      slaSupported: true,
      notesSupported: true,
      customFields: [
        'type', 'category', 'risk', 'impact', 'urgency',
        'justification', 'implementation_plan', 'backout_plan',
        'test_plan', 'review_date', 'cab_date', 'cab_delegate',
        'cab_recommendation', 'cab_required', 'conflict_status',
        'start_date', 'end_date', 'work_start', 'work_end'
      ],
      queryConfig: {
        defaultOrderBy: 'sys_updated_on',
        batchSize: 30
      }
    }],

    // Service Catalog
    ['sc_task', {
      table: 'sc_task',
      collection: 'sc_tasks_complete',
      displayName: 'Service Catalog Task',
      primaryKey: 'sys_id',
      numberField: 'number',
      stateField: 'state',
      priorityField: 'priority',
      assignmentGroupField: 'assignment_group',
      assignedToField: 'assigned_to',
      slaSupported: true,
      notesSupported: true,
      customFields: [
        'request', 'request_item', 'catalog_item', 'order',
        'delivery_plan', 'delivery_task', 'context'
      ],
      queryConfig: {
        defaultOrderBy: 'sys_updated_on',
        batchSize: 50
      }
    }],
    
    ['sc_request', {
      table: 'sc_request',
      collection: 'requests_complete',
      displayName: 'Service Catalog Request',
      primaryKey: 'sys_id',
      numberField: 'number',
      stateField: 'state',
      priorityField: 'priority',
      assignmentGroupField: 'assignment_group',
      assignedToField: 'assigned_to',
      callerField: 'requested_for',
      slaSupported: true,
      notesSupported: true,
      customFields: [
        'requested_for', 'special_instructions', 'delivery_address',
        'stage', 'approval', 'approval_history', 'approval_set'
      ],
      queryConfig: {
        defaultOrderBy: 'sys_updated_on',
        batchSize: 50
      }
    }],

    // Problem Management
    ['problem', {
      table: 'problem',
      collection: 'problems_complete',
      displayName: 'Problem',
      primaryKey: 'sys_id',
      numberField: 'number',
      stateField: 'state',
      priorityField: 'priority',
      assignmentGroupField: 'assignment_group',
      assignedToField: 'assigned_to',
      slaSupported: true,
      notesSupported: true,
      customFields: [
        'category', 'subcategory', 'cause_code', 'close_code',
        'resolution_code', 'workaround', 'fix_communicated',
        'duplicate_of', 'related_incidents', 'problem_state',
        'known_error', 'major_problem'
      ],
      queryConfig: {
        defaultOrderBy: 'sys_updated_on',
        batchSize: 30
      }
    }],

    // Generic Tasks
    ['task', {
      table: 'task',
      collection: 'tasks_complete',
      displayName: 'Task',
      primaryKey: 'sys_id',
      numberField: 'number',
      stateField: 'state',
      priorityField: 'priority',
      assignmentGroupField: 'assignment_group',
      assignedToField: 'assigned_to',
      slaSupported: true,
      notesSupported: true,
      customFields: [
        'parent', 'context', 'escalation', 'follow_up',
        'close_code', 'close_notes', 'approval',
        'approval_history', 'approval_set', 'universal_request'
      ],
      queryConfig: {
        defaultOrderBy: 'sys_updated_on',
        batchSize: 100
      }
    }],
    
    // Specialized Tasks
    ['incident_task', {
      table: 'incident_task',
      collection: 'incident_tasks_complete',
      displayName: 'Incident Task',
      primaryKey: 'sys_id',
      numberField: 'number',
      stateField: 'state',
      priorityField: 'priority',
      assignmentGroupField: 'assignment_group',
      assignedToField: 'assigned_to',
      slaSupported: true,
      notesSupported: true,
      customFields: [
        'incident', 'incident_number', 'task_type'
      ],
      queryConfig: {
        defaultOrderBy: 'sys_updated_on',
        batchSize: 50
      }
    }],
    
    ['problem_task', {
      table: 'problem_task',
      collection: 'problem_tasks_complete',
      displayName: 'Problem Task',
      primaryKey: 'sys_id',
      numberField: 'number',
      stateField: 'state',
      priorityField: 'priority',
      assignmentGroupField: 'assignment_group',
      assignedToField: 'assigned_to',
      slaSupported: true,
      notesSupported: true,
      customFields: [
        'problem', 'problem_number', 'task_type'
      ],
      queryConfig: {
        defaultOrderBy: 'sys_updated_on',
        batchSize: 50
      }
    }]
  ]);

  private constructor() {}

  static getInstance(): TicketTypeManager {
    if (!TicketTypeManager.instance) {
      TicketTypeManager.instance = new TicketTypeManager();
    }
    return TicketTypeManager.instance;
  }

  /**
   * Get configuration for a specific ticket type
   */
  getConfig(ticketType: string): TicketTypeConfig | null {
    return this.TICKET_CONFIGS.get(ticketType) || null;
  }

  /**
   * Get all supported ticket types
   */
  getAllTicketTypes(): string[] {
    return Array.from(this.TICKET_CONFIGS.keys());
  }

  /**
   * Get all configurations
   */
  getAllConfigs(): Map<string, TicketTypeConfig> {
    return new Map(this.TICKET_CONFIGS);
  }

  /**
   * Check if a ticket type is supported
   */
  isSupported(ticketType: string): boolean {
    return this.TICKET_CONFIGS.has(ticketType);
  }

  /**
   * Get ticket types that support SLA
   */
  getSLASupportedTypes(): string[] {
    return Array.from(this.TICKET_CONFIGS.entries())
      .filter(([_, config]) => config.slaSupported)
      .map(([type, _]) => type);
  }

  /**
   * Get ticket types that support notes
   */
  getNotesSupportedTypes(): string[] {
    return Array.from(this.TICKET_CONFIGS.entries())
      .filter(([_, config]) => config.notesSupported)
      .map(([type, _]) => type);
  }

  /**
   * Get fields to query for a specific ticket type
   */
  getQueryFields(ticketType: string): string[] {
    const config = this.getConfig(ticketType);
    if (!config) return [];

    const baseFields = [
      'sys_id', 'sys_created_on', 'sys_updated_on', 'sys_created_by', 'sys_updated_by',
      config.numberField, 'short_description', 'description', config.stateField,
      config.assignmentGroupField, 'active'
    ];

    const optionalFields = [];
    if (config.priorityField) optionalFields.push(config.priorityField);
    if (config.assignedToField) optionalFields.push(config.assignedToField);
    if (config.callerField) optionalFields.push(config.callerField);

    return [...baseFields, ...optionalFields, ...config.customFields];
  }

  /**
   * Build query for incremental sync
   */
  buildIncrementalQuery(ticketType: string, hoursBack: number = 2): string {
    const config = this.getConfig(ticketType);
    if (!config) return '';

    const timeAgo = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString().split('.')[0];
    let query = `sys_updated_on>=${timeAgo}`;

    if (config.queryConfig.defaultFilter) {
      query += `^${config.queryConfig.defaultFilter}`;
    }

    query += `^ORDERBY${config.queryConfig.defaultOrderBy}`;
    
    return query;
  }

  /**
   * Build query for full sync
   */
  buildFullSyncQuery(ticketType: string, daysBack: number = 30): string {
    const config = this.getConfig(ticketType);
    if (!config) return '';

    const timeAgo = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('.')[0];
    let query = `sys_updated_on>=${timeAgo}`;

    if (config.queryConfig.defaultFilter) {
      query += `^${config.queryConfig.defaultFilter}`;
    }

    query += `^ORDERBY${config.queryConfig.defaultOrderBy}`;
    
    return query;
  }

  /**
   * Get batch size for a ticket type
   */
  getBatchSize(ticketType: string): number {
    const config = this.getConfig(ticketType);
    return config?.queryConfig.batchSize || 50;
  }

  /**
   * Get display name for a ticket type
   */
  getDisplayName(ticketType: string): string {
    const config = this.getConfig(ticketType);
    return config?.displayName || ticketType;
  }

  /**
   * Get collection name for a ticket type
   */
  getCollectionName(ticketType: string): string {
    const config = this.getConfig(ticketType);
    return config?.collection || `${ticketType}_complete`;
  }

  /**
   * Extract ticket number from raw data
   */
  extractTicketNumber(ticketData: any, ticketType: string): string {
    const config = this.getConfig(ticketType);
    if (!config) return '';

    const field = ticketData[config.numberField];
    return this.extractValue(field);
  }

  /**
   * Extract ticket state from raw data
   */
  extractTicketState(ticketData: any, ticketType: string): string {
    const config = this.getConfig(ticketType);
    if (!config) return '';

    const field = ticketData[config.stateField];
    return this.extractValue(field);
  }

  /**
   * Get ticket statistics by type
   */
  getTypeStatistics(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [type, config] of this.TICKET_CONFIGS) {
      stats[type] = {
        display_name: config.displayName,
        collection: config.collection,
        sla_supported: config.slaSupported,
        notes_supported: config.notesSupported,
        custom_fields_count: config.customFields.length,
        batch_size: config.queryConfig.batchSize
      };
    }

    return stats;
  }

  /**
   * Validate ticket data for a specific type
   */
  validateTicketData(ticketData: any, ticketType: string): { valid: boolean; errors: string[] } {
    const config = this.getConfig(ticketType);
    if (!config) {
      return { valid: false, errors: [`Unsupported ticket type: ${ticketType}`] };
    }

    const errors: string[] = [];

    // Check required fields
    if (!ticketData[config.primaryKey]) {
      errors.push(`Missing primary key: ${config.primaryKey}`);
    }

    if (!ticketData[config.numberField]) {
      errors.push(`Missing number field: ${config.numberField}`);
    }

    if (!ticketData['sys_created_on']) {
      errors.push('Missing sys_created_on field');
    }

    if (!ticketData['sys_updated_on']) {
      errors.push('Missing sys_updated_on field');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Extract value from ServiceNow field (handles display_value objects)
   */
  private extractValue(field: any): string {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (typeof field === 'object' && field.display_value !== undefined) 
      return String(field.display_value);
    if (typeof field === 'object' && field.value !== undefined) 
      return String(field.value);
    return String(field);
  }

  /**
   * Get recommended sync configuration for all types
   */
  getRecommendedSyncConfig(): {
    high_priority: string[];
    medium_priority: string[];  
    low_priority: string[];
    batch_sizes: Record<string, number>;
  } {
    return {
      high_priority: ['incident', 'problem'], // Sync mais frequente
      medium_priority: ['change_task', 'sc_task'], // Sync médio
      low_priority: ['change_request', 'sc_request', 'task'], // Sync menos frequente
      batch_sizes: Object.fromEntries(
        Array.from(this.TICKET_CONFIGS.entries()).map(([type, config]) => [
          type, 
          config.queryConfig.batchSize
        ])
      )
    };
  }
}