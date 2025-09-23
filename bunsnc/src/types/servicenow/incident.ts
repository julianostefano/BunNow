/**
 * ServiceNow incident interface - Generated from REAL field discovery
 * Total fields: 155
 * Record ID: b6b08181c33b2250c70bdffb050131a6
 * Record Number: INC4499465
 * Generated: 2025-09-22T23:07:48.399Z
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Base ServiceNow reference type
export interface ServiceNowReference {
  display_value: string;
  value: string;
  link?: string;
}

export interface ServiceNowIncident {
  /** reference field - Reference - Sample: "verdadeiro" */
  active: ServiceNowReference;
  /** reference field - Reference - Sample: "UNKNOWN" */
  activity_due: ServiceNowReference;
  /** reference field - Reference */
  additional_assignee_list: ServiceNowReference;
  /** reference field - Reference - Sample: "Ainda não solicitada" */
  approval: ServiceNowReference;
  /** reference field - Reference */
  approval_history: ServiceNowReference;
  /** reference field - Reference */
  approval_set: ServiceNowReference;
  /** reference field - Reference - Sample: "ADILSON WILBORN SANTANA - E962006" */
  assigned_to: ServiceNowReference;
  /** reference field - Reference - Sample: "L2-NE-IT PCP PRODUCTION" */
  assignment_group: ServiceNowReference;
  /** reference field - Reference */
  business_duration: ServiceNowReference;
  /** reference field - Reference */
  business_impact: ServiceNowReference;
  /** reference field - Reference */
  business_service: ServiceNowReference;
  /** reference field - Reference */
  business_stc: ServiceNowReference;
  /** reference field - Reference */
  calendar_duration: ServiceNowReference;
  /** reference field - Reference */
  calendar_stc: ServiceNowReference;
  /** reference field - Reference - Sample: "LUCIANA SANTANA FERREIRA - U461418" */
  caller_id: ServiceNowReference;
  /** reference field - Reference - Sample: "Colaboração" */
  category: ServiceNowReference;
  /** reference field - Reference */
  cause: ServiceNowReference;
  /** reference field - Reference */
  caused_by: ServiceNowReference;
  /** reference field - Reference - Sample: "0" */
  child_incidents: ServiceNowReference;
  /** reference field - Reference */
  close_code: ServiceNowReference;
  /** reference field - Reference */
  close_notes: ServiceNowReference;
  /** reference field - Reference */
  closed_at: ServiceNowReference;
  /** reference field - Reference */
  closed_by: ServiceNowReference;
  /** reference field - Reference */
  cmdb_ci: ServiceNowReference;
  /** reference field - Reference */
  comments: ServiceNowReference;
  /** reference field - Reference */
  comments_and_work_notes: ServiceNowReference;
  /** reference field - Reference - Sample: "NEOENERGIA" */
  company: ServiceNowReference;
  /** reference field - Reference - Sample: "E-mail" */
  contact_type: ServiceNowReference;
  /** reference field - Reference */
  contract: ServiceNowReference;
  /** reference field - Reference */
  correlation_display: ServiceNowReference;
  /** reference field - Reference */
  correlation_id: ServiceNowReference;
  /** reference field - Reference - Sample: "Adilson, bom dia
Conforme conversamos, preciso que a lista de jobs dessa planilha seja revisada. Existem job que fazem parte da cadeia diária nessa listagem.
Preciso também que seja informado se  os jobs (depois da lista revisada) geram arquivo e qual o nome desse arquivo." */
  description: ServiceNowReference;
  /** reference field - Reference */
  due_date: ServiceNowReference;
  /** reference field - Reference - Sample: "Normal" */
  escalation: ServiceNowReference;
  /** reference field - Reference */
  expected_start: ServiceNowReference;
  /** reference field - Reference */
  follow_up: ServiceNowReference;
  /** reference field - Reference */
  group_list: ServiceNowReference;
  /** reference field - Reference */
  hold_reason: ServiceNowReference;
  /** reference field - Reference - Sample: "3 - Baixo" */
  impact: ServiceNowReference;
  /** reference field - Reference - Sample: "Em andamento" */
  incident_state: ServiceNowReference;
  /** reference field - Reference - Sample: "falso" */
  knowledge: ServiceNowReference;
  /** reference field - Reference - Sample: "SALV ED SEDE" */
  location: ServiceNowReference;
  /** reference field - Reference - Sample: "verdadeiro" */
  made_sla: ServiceNowReference;
  /** reference field - Reference - Sample: "Não notificar" */
  notify: ServiceNowReference;
  /** reference field - Reference - Sample: "INC4499465" */
  number: ServiceNowReference;
  /** reference field - Reference - Sample: "2025-09-03 11:02:11" */
  opened_at: ServiceNowReference;
  /** reference field - Reference - Sample: "LUCIANA SANTANA FERREIRA - U461418" */
  opened_by: ServiceNowReference;
  /** reference field - Reference */
  order: ServiceNowReference;
  /** reference field - Reference */
  origin_id: ServiceNowReference;
  /** reference field - Reference */
  origin_table: ServiceNowReference;
  /** reference field - Reference */
  parent: ServiceNowReference;
  /** reference field - Reference */
  parent_incident: ServiceNowReference;
  /** reference field - Reference - Sample: "4 - Baixo" */
  priority: ServiceNowReference;
  /** reference field - Reference */
  problem_id: ServiceNowReference;
  /** reference field - Reference - Sample: "0" */
  reassignment_count: ServiceNowReference;
  /** reference field - Reference - Sample: "0" */
  reopen_count: ServiceNowReference;
  /** reference field - Reference */
  reopened_by: ServiceNowReference;
  /** reference field - Reference */
  reopened_time: ServiceNowReference;
  /** reference field - Reference */
  resolved_at: ServiceNowReference;
  /** reference field - Reference */
  resolved_by: ServiceNowReference;
  /** reference field - Reference */
  rfc: ServiceNowReference;
  /** reference field - Reference */
  route_reason: ServiceNowReference;
  /** reference field - Reference - Sample: "SB_NEO_JOB_CHG" */
  service_offering: ServiceNowReference;
  /** reference field - Reference - Sample: "3 - Baixo" */
  severity: ServiceNowReference;
  /** reference field - Reference - Sample: "Informações complementares ao INC4410843" */
  short_description: ServiceNowReference;
  /** reference field - Reference */
  skills: ServiceNowReference;
  /** reference field - Reference - Sample: "UNKNOWN" */
  sla_due: ServiceNowReference;
  /** reference field - Reference - Sample: "Em andamento" */
  state: ServiceNowReference;
  /** reference field - Reference */
  subcategory: ServiceNowReference;
  /** reference field - Reference - Sample: "Incidente" */
  sys_class_name: ServiceNowReference;
  /** reference field - Reference - Sample: "U461418" */
  sys_created_by: ServiceNowReference;
  /** reference field - Reference - Sample: "2025-09-03 11:05:44" */
  sys_created_on: ServiceNowReference;
  /** reference field - Reference - Sample: "global" */
  sys_domain: ServiceNowReference;
  /** reference field - Reference - Sample: "/" */
  sys_domain_path: ServiceNowReference;
  /** reference field - Reference - Sample: "b6b08181c33b2250c70bdffb050131a6" */
  sys_id: ServiceNowReference;
  /** reference field - Reference - Sample: "1" */
  sys_mod_count: ServiceNowReference;
  /** reference field - Reference */
  sys_tags: ServiceNowReference;
  /** reference field - Reference - Sample: "E962006" */
  sys_updated_by: ServiceNowReference;
  /** reference field - Reference - Sample: "2025-09-03 12:21:18" */
  sys_updated_on: ServiceNowReference;
  /** reference field - Reference - Sample: "INC4499465" */
  task_effective_number: ServiceNowReference;
  /** reference field - Reference */
  time_worked: ServiceNowReference;
  /** reference field - Reference */
  u_archive_date: ServiceNowReference;
  /** reference field - Reference */
  u_awaiting_for: ServiceNowReference;
  /** reference field - Reference */
  u_business_unit_pmo_cp: ServiceNowReference;
  /** reference field - Reference - Sample: "falso" */
  u_cae_incident: ServiceNowReference;
  /** reference field - Reference */
  u_cat_item: ServiceNowReference;
  /** reference field - Reference - Sample: "falso" */
  u_caui_incident: ServiceNowReference;
  /** reference field - Reference */
  u_closed_month: ServiceNowReference;
  /** reference field - Reference */
  u_closed_year: ServiceNowReference;
  /** reference field - Reference */
  u_contact: ServiceNowReference;
  /** reference field - Reference - Sample: "+557133705486" */
  u_contact_phone: ServiceNowReference;
  /** reference field - Reference */
  u_external_reference: ServiceNowReference;
  /** reference field - Reference */
  u_gdpr_lock_date: ServiceNowReference;
  /** reference field - Reference */
  u_impacted_country: ServiceNowReference;
  /** reference field - Reference */
  u_integration_control: ServiceNowReference;
  /** reference field - Reference - Sample: "NOK" */
  u_kb_participation: ServiceNowReference;
  /** reference field - Reference */
  u_last_transaction_direction: ServiceNowReference;
  /** reference field - Reference */
  u_last_transaction_error: ServiceNowReference;
  /** reference field - Reference */
  u_last_transaction_for_integration: ServiceNowReference;
  /** reference field - Reference */
  u_last_transaction_id: ServiceNowReference;
  /** reference field - Reference */
  u_last_transaction_name: ServiceNowReference;
  /** reference field - Reference */
  u_last_transaction_time: ServiceNowReference;
  /** reference field - Reference - Sample: "falso" */
  u_major_incident: ServiceNowReference;
  /** reference field - Reference */
  u_method_call: ServiceNowReference;
  /** reference field - Reference */
  u_method_parameter_list: ServiceNowReference;
  /** reference field - Reference - Sample: "9" */
  u_opened_month: ServiceNowReference;
  /** reference field - Reference - Sample: "2.025" */
  u_opened_year: ServiceNowReference;
  /** reference field - Reference - Sample: "L3-NE-IT PCP PRODUCTION" */
  u_owner_group: ServiceNowReference;
  /** reference field - Reference */
  u_process_parameter_list: ServiceNowReference;
  /** reference field - Reference */
  u_project: ServiceNowReference;
  /** reference field - Reference - Sample: "falso" */
  u_propagate_to_children: ServiceNowReference;
  /** reference field - Reference - Sample: "falso" */
  u_propose_appointment: ServiceNowReference;
  /** reference field - Reference */
  u_r_u_check_assigned_hpo: ServiceNowReference;
  /** reference field - Reference */
  u_r_u_check_rdo: ServiceNowReference;
  /** reference field - Reference - Sample: "falso" */
  u_reassigned: ServiceNowReference;
  /** reference field - Reference */
  u_resolution_category_1: ServiceNowReference;
  /** reference field - Reference */
  u_resolution_category_2: ServiceNowReference;
  /** reference field - Reference */
  u_resolution_category_3: ServiceNowReference;
  /** reference field - Reference */
  u_resolved_month: ServiceNowReference;
  /** reference field - Reference */
  u_resolved_year: ServiceNowReference;
  /** reference field - Reference */
  u_ritm: ServiceNowReference;
  /** reference field - Reference */
  u_sacin_company: ServiceNowReference;
  /** reference field - Reference */
  u_sla_duration: ServiceNowReference;
  /** reference field - Reference */
  u_supplier: ServiceNowReference;
  /** reference field - Reference */
  u_supplier_category_1: ServiceNowReference;
  /** reference field - Reference */
  u_supplier_category_2: ServiceNowReference;
  /** reference field - Reference */
  u_supplier_category_3: ServiceNowReference;
  /** reference field - Reference - Sample: "falso" */
  u_supplier_incident: ServiceNowReference;
  /** reference field - Reference */
  u_tier_one_benefits: ServiceNowReference;
  /** reference field - Reference - Sample: "AYESA BR" */
  u_vendor: ServiceNowReference;
  /** reference field - Reference */
  u_vendor_manufacturer: ServiceNowReference;
  /** reference field - Reference */
  universal_request: ServiceNowReference;
  /** reference field - Reference - Sample: "Prosseguir para a próxima tarefa" */
  upon_approval: ServiceNowReference;
  /** reference field - Reference - Sample: "Cancelar todas as tarefas futuras" */
  upon_reject: ServiceNowReference;
  /** reference field - Reference - Sample: "3 - Baixo(a)" */
  urgency: ServiceNowReference;
  /** reference field - Reference */
  user_input: ServiceNowReference;
  /** reference field - Reference */
  watch_list: ServiceNowReference;
  /** reference field - Reference */
  work_end: ServiceNowReference;
  /** reference field - Reference */
  work_notes: ServiceNowReference;
  /** reference field - Reference */
  work_notes_list: ServiceNowReference;
  /** reference field - Reference */
  work_start: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_aws_last_scheduled_job_sync_time: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awscasecommunicationemails: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awscasecreatedtime: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awscaseidentifier: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awscasestatus: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awscreationtime: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awsincidentarn: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awsincidenturl: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awslastsynctime: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awslastupdatedtime: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awsregion: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awsresolvetime: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awsstatus: ServiceNowReference;
  /** reference field - Reference */
  x_126749_aws_sc_awssupportcaseid: ServiceNowReference;
}

export interface ServiceNowIncidentMetadata {
  tableName: "incident";
  totalFields: 155;
  fieldCount: {
    reference: 155;
    datetime: 0;
    date: 0;
    string: 0;
    number: 0;
    boolean: 0;
    array: 0;
    object: 0;
  };
  originalRecord: {
    recordId: "b6b08181c33b2250c70bdffb050131a6";
    recordNumber: "INC4499465";
    capturedAt: "2025-09-05T22:53:02.052Z";
  };
}
