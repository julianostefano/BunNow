/**
 * ServiceNow Notes Service - Handle ticket notes operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import type { ServiceNowAuthClient } from './ServiceNowAuthClient';

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

export class ServiceNowNotesService {
  constructor(private serviceNowClient: ServiceNowAuthClient) {}

  /**
   * Get notes for a specific ticket
   * @param table - ServiceNow table name
   * @param sysId - Ticket system ID
   * @returns Promise resolving to array of notes
   */
  async getTicketNotes(table: string, sysId: string): Promise<ServiceNowNote[]> {
    try {
      console.log(`📝 Fetching notes for ${table}/${sysId}`);
      
      // Query sys_journal_field table for notes
      const response = await this.serviceNowClient.makeRequestFullFields(
        'sys_journal_field',
        `element_id=${sysId}^ORDERBYsys_created_on`,
        100
      );

      if (!response?.result) {
        return [];
      }

      return response.result.map((note: any) => ({
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

    } catch (error) {
      console.error(`❌ Error fetching notes for ${table}/${sysId}:`, error);
      throw new Error(`Failed to fetch notes: ${error.message}`);
    }
  }

  /**
   * Add a new note to a ticket
   * @param request - Note creation request
   * @returns Promise resolving to created note ID
   */
  async addTicketNote(request: CreateNoteRequest): Promise<string> {
    try {
      console.log(`➕ Adding note to ${request.table}/${request.sysId}`);

      const noteField = request.workNotes ? 'work_notes' : 'comments';
      
      // Update the ticket with new note
      const updateData = {
        [noteField]: request.noteText
      };

      const response = await this.serviceNowClient.makeRequest(
        'PUT',
        `${request.table}/${request.sysId}`,
        updateData
      );

      if (!response?.result) {
        throw new Error('Failed to add note - no response from ServiceNow');
      }

      console.log(`✅ Note added successfully to ${request.table}/${request.sysId}`);
      return response.result.sys_id;

    } catch (error) {
      console.error(`❌ Error adding note to ${request.table}/${request.sysId}:`, error);
      throw new Error(`Failed to add note: ${error.message}`);
    }
  }

  /**
   * Format note timestamp for display
   * @param timestamp - ISO timestamp string
   * @returns Formatted timestamp
   */
  formatNoteTimestamp(timestamp: string): string {
    if (!timestamp) return 'N/A';
    
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return timestamp;
      
      return date.toLocaleDateString('pt-BR', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return timestamp.slice(0, 16);
    }
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