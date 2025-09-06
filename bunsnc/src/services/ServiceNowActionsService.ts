/**
 * ServiceNow Actions Service - Ticket state and workflow operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import type { ServiceNowAuthClient } from './ServiceNowAuthClient';
import type { ServiceNowNotesService } from './ServiceNowNotesService';

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

export interface UpdateCategoryRequest {
  table: string;
  sysId: string;
  category: string;
  subcategory?: string;
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

export class ServiceNowActionsService {
  constructor(
    private serviceNowClient: ServiceNowAuthClient,
    private notesService: ServiceNowNotesService
  ) {}

  /**
   * Resolve a ticket with resolution code and notes
   * @param request - Resolution request details
   * @returns Promise resolving to action response
   */
  async resolveTicket(request: ResolveTicketRequest): Promise<TicketActionResponse> {
    try {
      console.log(`🔄 Resolving ticket ${request.table}/${request.sysId}`);

      // Get current ticket state
      const currentTicket = await this.getCurrentTicketState(request.table, request.sysId);
      
      // Validate transition is allowed
      this.validateStateTransition(currentTicket.state, '6', 'resolve');

      // Prepare update data
      const updateData: any = {
        state: '6', // Resolved
        resolution_code: request.resolutionCode,
        resolved_at: new Date().toISOString(),
        resolved_by: 'system' // Would be current user in real implementation
      };

      // Add close code if provided
      if (request.closeCode) {
        updateData.close_code = request.closeCode;
      }

      // Update ticket state
      const response = await this.serviceNowClient.makeRequest(
        'PUT',
        `${request.table}/${request.sysId}`,
        updateData
      );

      if (!response?.result) {
        throw new Error('Failed to resolve ticket - no response from ServiceNow');
      }

      // Add resolution notes
      if (request.resolutionNotes) {
        await this.notesService.addTicketNote({
          table: request.table,
          sysId: request.sysId,
          noteText: `TICKET RESOLVED\nResolution Code: ${request.resolutionCode}\n\n${request.resolutionNotes}`,
          workNotes: false
        });
      }

      console.log(`✅ Ticket resolved successfully: ${request.table}/${request.sysId}`);

      return {
        success: true,
        sysId: request.sysId,
        previousState: currentTicket.state,
        newState: '6',
        message: `Ticket resolved with code: ${request.resolutionCode}`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Error resolving ticket ${request.table}/${request.sysId}:`, error);
      return {
        success: false,
        sysId: request.sysId,
        message: `Failed to resolve ticket: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Close a ticket with close code and notes
   * @param request - Close request details
   * @returns Promise resolving to action response
   */
  async closeTicket(request: CloseTicketRequest): Promise<TicketActionResponse> {
    try {
      console.log(`🔒 Closing ticket ${request.table}/${request.sysId}`);

      const currentTicket = await this.getCurrentTicketState(request.table, request.sysId);
      this.validateStateTransition(currentTicket.state, '7', 'close');

      const updateData = {
        state: '7', // Closed
        close_code: request.closeCode,
        closed_at: new Date().toISOString(),
        closed_by: 'system'
      };

      const response = await this.serviceNowClient.makeRequest(
        'PUT',
        `${request.table}/${request.sysId}`,
        updateData
      );

      if (!response?.result) {
        throw new Error('Failed to close ticket - no response from ServiceNow');
      }

      // Add close notes
      if (request.closeNotes) {
        await this.notesService.addTicketNote({
          table: request.table,
          sysId: request.sysId,
          noteText: `TICKET CLOSED\nClose Code: ${request.closeCode}\n\n${request.closeNotes}`,
          workNotes: false
        });
      }

      console.log(`✅ Ticket closed successfully: ${request.table}/${request.sysId}`);

      return {
        success: true,
        sysId: request.sysId,
        previousState: currentTicket.state,
        newState: '7',
        message: `Ticket closed with code: ${request.closeCode}`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Error closing ticket ${request.table}/${request.sysId}:`, error);
      return {
        success: false,
        sysId: request.sysId,
        message: `Failed to close ticket: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Reopen a closed or resolved ticket
   * @param request - Reopen request details
   * @returns Promise resolving to action response
   */
  async reopenTicket(request: ReopenTicketRequest): Promise<TicketActionResponse> {
    try {
      console.log(`🔄 Reopening ticket ${request.table}/${request.sysId}`);

      const currentTicket = await this.getCurrentTicketState(request.table, request.sysId);
      
      // Only allow reopening closed (7) or resolved (6) tickets
      if (!['6', '7'].includes(currentTicket.state)) {
        throw new Error(`Cannot reopen ticket in state ${currentTicket.state}. Only resolved or closed tickets can be reopened.`);
      }

      const updateData = {
        state: '2', // In Progress
        reopened_at: new Date().toISOString(),
        reopened_by: 'system',
        resolved_at: null,
        closed_at: null,
        resolution_code: null,
        close_code: null
      };

      const response = await this.serviceNowClient.makeRequest(
        'PUT',
        `${request.table}/${request.sysId}`,
        updateData
      );

      if (!response?.result) {
        throw new Error('Failed to reopen ticket - no response from ServiceNow');
      }

      // Add reopen notes
      await this.notesService.addTicketNote({
        table: request.table,
        sysId: request.sysId,
        noteText: `TICKET REOPENED\nReason: ${request.reason}\n\n${request.reopenNotes}`,
        workNotes: false
      });

      console.log(`✅ Ticket reopened successfully: ${request.table}/${request.sysId}`);

      return {
        success: true,
        sysId: request.sysId,
        previousState: currentTicket.state,
        newState: '2',
        message: `Ticket reopened. Reason: ${request.reason}`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Error reopening ticket ${request.table}/${request.sysId}:`, error);
      return {
        success: false,
        sysId: request.sysId,
        message: `Failed to reopen ticket: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Assign ticket to user or group
   * @param request - Assignment request details
   * @returns Promise resolving to action response
   */
  async assignTicket(request: AssignTicketRequest): Promise<TicketActionResponse> {
    try {
      console.log(`👤 Assigning ticket ${request.table}/${request.sysId}`);

      if (!request.assignedTo && !request.assignmentGroup) {
        throw new Error('Either assignedTo or assignmentGroup must be provided');
      }

      const updateData: any = {
        assigned_at: new Date().toISOString()
      };

      if (request.assignedTo) {
        updateData.assigned_to = request.assignedTo;
      }

      if (request.assignmentGroup) {
        updateData.assignment_group = request.assignmentGroup;
      }

      const response = await this.serviceNowClient.makeRequest(
        'PUT',
        `${request.table}/${request.sysId}`,
        updateData
      );

      if (!response?.result) {
        throw new Error('Failed to assign ticket - no response from ServiceNow');
      }

      // Add assignment notes
      if (request.assignmentNotes) {
        const assignmentDetails = request.assignedTo 
          ? `Assigned to: ${request.assignedTo}` 
          : `Assigned to group: ${request.assignmentGroup}`;
        
        await this.notesService.addTicketNote({
          table: request.table,
          sysId: request.sysId,
          noteText: `TICKET ASSIGNED\n${assignmentDetails}\n\n${request.assignmentNotes}`,
          workNotes: true
        });
      }

      console.log(`✅ Ticket assigned successfully: ${request.table}/${request.sysId}`);

      const assignmentTarget = request.assignedTo || request.assignmentGroup;
      return {
        success: true,
        sysId: request.sysId,
        message: `Ticket assigned to: ${assignmentTarget}`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Error assigning ticket ${request.table}/${request.sysId}:`, error);
      return {
        success: false,
        sysId: request.sysId,
        message: `Failed to assign ticket: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Update ticket priority with justification
   * @param request - Priority update request
   * @returns Promise resolving to action response
   */
  async updatePriority(request: UpdatePriorityRequest): Promise<TicketActionResponse> {
    try {
      console.log(`🔥 Updating priority for ticket ${request.table}/${request.sysId}`);

      const currentTicket = await this.getCurrentTicketState(request.table, request.sysId);

      const updateData = {
        priority: request.newPriority,
        priority_updated_at: new Date().toISOString(),
        priority_updated_by: 'system'
      };

      const response = await this.serviceNowClient.makeRequest(
        'PUT',
        `${request.table}/${request.sysId}`,
        updateData
      );

      if (!response?.result) {
        throw new Error('Failed to update priority - no response from ServiceNow');
      }

      // Add priority change notes
      await this.notesService.addTicketNote({
        table: request.table,
        sysId: request.sysId,
        noteText: `PRIORITY UPDATED\nFrom: ${this.getPriorityLabel(currentTicket.priority)}\nTo: ${this.getPriorityLabel(request.newPriority)}\n\nJustification: ${request.justification}`,
        workNotes: true
      });

      console.log(`✅ Priority updated successfully: ${request.table}/${request.sysId}`);

      return {
        success: true,
        sysId: request.sysId,
        message: `Priority updated to ${this.getPriorityLabel(request.newPriority)}`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Error updating priority ${request.table}/${request.sysId}:`, error);
      return {
        success: false,
        sysId: request.sysId,
        message: `Failed to update priority: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Update ticket category/subcategory
   * @param request - Category update request
   * @returns Promise resolving to action response
   */
  async updateCategory(request: UpdateCategoryRequest): Promise<TicketActionResponse> {
    try {
      console.log(`📂 Updating category for ticket ${request.table}/${request.sysId}`);

      const updateData: any = {
        category: request.category,
        category_updated_at: new Date().toISOString()
      };

      if (request.subcategory) {
        updateData.subcategory = request.subcategory;
      }

      const response = await this.serviceNowClient.makeRequest(
        'PUT',
        `${request.table}/${request.sysId}`,
        updateData
      );

      if (!response?.result) {
        throw new Error('Failed to update category - no response from ServiceNow');
      }

      // Add category change notes
      const categoryText = request.subcategory 
        ? `${request.category} > ${request.subcategory}`
        : request.category;

      await this.notesService.addTicketNote({
        table: request.table,
        sysId: request.sysId,
        noteText: `CATEGORY UPDATED\nNew Category: ${categoryText}\n\nJustification: ${request.justification}`,
        workNotes: true
      });

      console.log(`✅ Category updated successfully: ${request.table}/${request.sysId}`);

      return {
        success: true,
        sysId: request.sysId,
        message: `Category updated to: ${categoryText}`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Error updating category ${request.table}/${request.sysId}:`, error);
      return {
        success: false,
        sysId: request.sysId,
        message: `Failed to update category: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get current ticket state for validation
   * @param table - ServiceNow table
   * @param sysId - Ticket system ID
   * @returns Current ticket data
   */
  private async getCurrentTicketState(table: string, sysId: string): Promise<any> {
    const response = await this.serviceNowClient.makeRequestFullFields(
      table, 
      `sys_id=${sysId}`, 
      1
    );

    const ticket = response?.result?.[0];
    if (!ticket) {
      throw new Error(`Ticket ${table}/${sysId} not found`);
    }

    return {
      state: this.extractValue(ticket.state),
      priority: this.extractValue(ticket.priority),
      number: this.extractValue(ticket.number)
    };
  }

  /**
   * Validate state transition is allowed
   * @param currentState - Current ticket state
   * @param newState - Target state
   * @param action - Action being performed
   */
  private validateStateTransition(currentState: string, newState: string, action: string): void {
    const allowedTransitions: Record<string, string[]> = {
      '1': ['2', '6'], // New -> In Progress, Resolved
      '2': ['3', '6'], // In Progress -> On Hold, Resolved  
      '3': ['2', '6'], // On Hold -> In Progress, Resolved
      '6': ['7', '2'], // Resolved -> Closed, In Progress (reopen)
      '7': ['2']       // Closed -> In Progress (reopen)
    };

    const allowed = allowedTransitions[currentState];
    if (!allowed?.includes(newState)) {
      throw new Error(
        `Invalid state transition: Cannot ${action} ticket from state ${currentState} to ${newState}`
      );
    }
  }

  /**
   * Get priority label for logging
   * @param priority - Priority code
   * @returns Priority label
   */
  private getPriorityLabel(priority: string): string {
    const labels: Record<string, string> = {
      '1': 'Crítica',
      '2': 'Alta', 
      '3': 'Moderada',
      '4': 'Baixa',
      '5': 'Planejamento'
    };
    return labels[priority] || priority;
  }

  /**
   * Extract value from ServiceNow field
   * @param field - ServiceNow field data
   * @returns Normalized string value
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
}