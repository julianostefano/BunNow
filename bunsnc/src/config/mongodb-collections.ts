/**
 * MongoDB Specialized Collections for ServiceNow Tickets
 * Based on Python collectors: incident_jsonb.py, sctask_jsonb.py, ctask_jsonb.py
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface SLMData {
  sys_id: string;
  inc_number?: string;
  task_number?: string;
  taskslatable_business_percentage: string;
  taskslatable_start_time: string;
  taskslatable_end_time: string;
  taskslatable_sla: string;
  taskslatable_stage: string;
  taskslatable_has_breached: string;
  assignment_group: string;
  raw_data: any;
}

export interface IncidentDocument {
  _id?: string;
  sys_id: string;
  number: string;
  data: {
    incident: any;
    slms: SLMData[];
    sync_timestamp: string;
    collection_version: string;
  };
  created_at: Date;
  updated_at: Date;
  sys_id_prefix: string; // Para particionamento
}

export interface ChangeTaskDocument {
  _id?: string;
  sys_id: string;
  number: string;
  data: {
    change_task: any;
    slms: SLMData[];
    sync_timestamp: string;
    collection_version: string;
  };
  created_at: Date;
  updated_at: Date;
  sys_id_prefix: string;
}

export interface SCTaskDocument {
  _id?: string;
  sys_id: string;
  number: string;
  data: {
    sc_task: any;
    slms: SLMData[];
    sync_timestamp: string;
    collection_version: string;
  };
  created_at: Date;
  updated_at: Date;
  sys_id_prefix: string;
}

export interface GroupDocument {
  _id?: string;
  nome: string;
  data: {
    sys_id: string;
    name: string;
    description?: string;
    active: boolean;
    sync_timestamp: string;
  };
  created_at: Date;
  updated_at: Date;
}

// Collection names following Python scripts pattern
export const COLLECTION_NAMES = {
  INCIDENTS: 'sn_incidents_collection',
  CHANGE_TASKS: 'sn_ctasks_collection', 
  SC_TASKS: 'sn_sctasks_collection',
  GROUPS: 'sn_groups_collection'
} as const;

export type CollectionName = typeof COLLECTION_NAMES[keyof typeof COLLECTION_NAMES];