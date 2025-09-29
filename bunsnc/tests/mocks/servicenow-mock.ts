/**
 * ServiceNow Mock Service - Test Double for ServiceNow API
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Provides mock responses for ServiceNow API endpoints
 * Used in E2E tests when real ServiceNow connection is unavailable
 */

export interface MockIncident {
  sys_id: string;
  number: string;
  short_description: string;
  description: string;
  state: string;
  priority: string;
  assigned_to: string;
  assignment_group: string;
  sys_created_on: string;
  sys_updated_on: string;
}

export interface MockAttachment {
  sys_id: string;
  file_name: string;
  size_bytes: number;
  content_type: string;
  table_name: string;
  table_sys_id: string;
  sys_created_on: string;
}

export class ServiceNowMockService {
  private incidents: Map<string, MockIncident> = new Map();
  private attachments: Map<string, MockAttachment> = new Map();

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData(): void {
    // Mock incidents
    const mockIncidents: MockIncident[] = [
      {
        sys_id: "inc001",
        number: "INC0000001",
        short_description: "Test incident 1",
        description: "This is a test incident for E2E testing",
        state: "new",
        priority: "3",
        assigned_to: "test.user",
        assignment_group: "IT Support",
        sys_created_on: "2025-09-29 10:00:00",
        sys_updated_on: "2025-09-29 10:00:00"
      },
      {
        sys_id: "inc002",
        number: "INC0000002",
        short_description: "Test incident 2",
        description: "Another test incident for E2E testing",
        state: "in_progress",
        priority: "2",
        assigned_to: "test.user2",
        assignment_group: "IT Support",
        sys_created_on: "2025-09-29 11:00:00",
        sys_updated_on: "2025-09-29 11:30:00"
      },
      {
        sys_id: "inc003",
        number: "INC0000003",
        short_description: "Test incident 3",
        description: "High priority test incident",
        state: "resolved",
        priority: "1",
        assigned_to: "test.user3",
        assignment_group: "Network Team",
        sys_created_on: "2025-09-29 09:00:00",
        sys_updated_on: "2025-09-29 14:00:00"
      }
    ];

    mockIncidents.forEach(incident => {
      this.incidents.set(incident.sys_id, incident);
    });

    // Mock attachments
    const mockAttachments: MockAttachment[] = [
      {
        sys_id: "att001",
        file_name: "test-document.pdf",
        size_bytes: 102400,
        content_type: "application/pdf",
        table_name: "incident",
        table_sys_id: "inc001",
        sys_created_on: "2025-09-29 10:05:00"
      },
      {
        sys_id: "att002",
        file_name: "screenshot.png",
        size_bytes: 51200,
        content_type: "image/png",
        table_name: "incident",
        table_sys_id: "inc002",
        sys_created_on: "2025-09-29 11:15:00"
      }
    ];

    mockAttachments.forEach(attachment => {
      this.attachments.set(attachment.sys_id, attachment);
    });
  }

  // Mock incident operations
  getIncidents(params?: {
    limit?: number;
    offset?: number;
    state?: string;
    priority?: string;
  }): MockIncident[] {
    let results = Array.from(this.incidents.values());

    // Apply filters
    if (params?.state) {
      results = results.filter(inc => inc.state === params.state);
    }

    if (params?.priority) {
      results = results.filter(inc => inc.priority === params.priority);
    }

    // Apply pagination
    const offset = params?.offset || 0;
    const limit = params?.limit || 100;

    return results.slice(offset, offset + limit);
  }

  getIncident(sysId: string): MockIncident | undefined {
    return this.incidents.get(sysId);
  }

  createIncident(data: Partial<MockIncident>): MockIncident {
    const sysId = `inc${String(this.incidents.size + 1).padStart(3, '0')}`;
    const number = `INC${String(this.incidents.size + 1).padStart(7, '0')}`;

    const incident: MockIncident = {
      sys_id: sysId,
      number,
      short_description: data.short_description || "",
      description: data.description || "",
      state: data.state || "new",
      priority: data.priority || "3",
      assigned_to: data.assigned_to || "",
      assignment_group: data.assignment_group || "",
      sys_created_on: new Date().toISOString(),
      sys_updated_on: new Date().toISOString()
    };

    this.incidents.set(sysId, incident);
    return incident;
  }

  updateIncident(sysId: string, data: Partial<MockIncident>): MockIncident | undefined {
    const incident = this.incidents.get(sysId);
    if (!incident) return undefined;

    const updated = {
      ...incident,
      ...data,
      sys_id: incident.sys_id, // Preserve sys_id
      number: incident.number, // Preserve number
      sys_updated_on: new Date().toISOString()
    };

    this.incidents.set(sysId, updated);
    return updated;
  }

  deleteIncident(sysId: string): boolean {
    return this.incidents.delete(sysId);
  }

  // Mock attachment operations
  getAttachments(tableName: string, tableSysId: string): MockAttachment[] {
    return Array.from(this.attachments.values()).filter(
      att => att.table_name === tableName && att.table_sys_id === tableSysId
    );
  }

  getAttachment(sysId: string): MockAttachment | undefined {
    return this.attachments.get(sysId);
  }

  createAttachment(data: Omit<MockAttachment, 'sys_id' | 'sys_created_on'>): MockAttachment {
    const sysId = `att${String(this.attachments.size + 1).padStart(3, '0')}`;

    const attachment: MockAttachment = {
      ...data,
      sys_id: sysId,
      sys_created_on: new Date().toISOString()
    };

    this.attachments.set(sysId, attachment);
    return attachment;
  }

  deleteAttachment(sysId: string): boolean {
    return this.attachments.delete(sysId);
  }

  // Mock statistics
  getIncidentStats(): {
    total: number;
    byState: Record<string, number>;
    byPriority: Record<string, number>;
  } {
    const incidents = Array.from(this.incidents.values());

    const byState: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    incidents.forEach(inc => {
      byState[inc.state] = (byState[inc.state] || 0) + 1;
      byPriority[inc.priority] = (byPriority[inc.priority] || 0) + 1;
    });

    return {
      total: incidents.length,
      byState,
      byPriority
    };
  }

  getAttachmentStats(): {
    total: number;
    totalSize: number;
    byContentType: Record<string, number>;
  } {
    const attachments = Array.from(this.attachments.values());

    const byContentType: Record<string, number> = {};
    let totalSize = 0;

    attachments.forEach(att => {
      byContentType[att.content_type] = (byContentType[att.content_type] || 0) + 1;
      totalSize += att.size_bytes;
    });

    return {
      total: attachments.length,
      totalSize,
      byContentType
    };
  }

  // Reset mock data (useful for tests)
  reset(): void {
    this.incidents.clear();
    this.attachments.clear();
    this.initializeMockData();
  }

  // Clear all data
  clear(): void {
    this.incidents.clear();
    this.attachments.clear();
  }
}

// Singleton instance for tests
export const mockServiceNow = new ServiceNowMockService();