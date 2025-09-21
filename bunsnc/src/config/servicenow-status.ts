/**
 * ServiceNow Status Configuration and Mapping
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface StatusConfig {
  value: string;
  label: string;
  labelEn: string;
  color: string;
  bgColor: string;
  description: string;
  isActive: boolean;
  canTransitionTo: string[];
  userActions: string[];
}

export interface TicketTypeConfig {
  name: string;
  label: string;
  table: string;
  statuses: Record<string, StatusConfig>;
  fields: string[];
  detailFields: string[];
  actions: Record<
    string,
    {
      label: string;
      icon: string;
      targetStatus?: string;
      requiresNote?: boolean;
      confirmMessage?: string;
    }
  >;
}

// ServiceNow Incident Status Mapping (Complete)
export const INCIDENT_STATUSES: Record<string, StatusConfig> = {
  "1": {
    value: "1",
    label: "Novo",
    labelEn: "New",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
    description: "Incidente recém criado, aguardando análise inicial",
    isActive: true,
    canTransitionTo: ["2", "18", "6", "8"],
    userActions: ["assign", "note", "in_progress"],
  },
  "2": {
    value: "2",
    label: "Em Andamento",
    labelEn: "In Progress",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
    description: "Incidente sendo trabalhado pela equipe de suporte",
    isActive: true,
    canTransitionTo: ["3", "18", "6", "8"],
    userActions: ["note", "hold", "resolve", "cancel"],
  },
  "3": {
    value: "3",
    label: "Em Espera",
    labelEn: "On Hold",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
    description: "Aguardando informações adicionais ou dependências",
    isActive: true,
    canTransitionTo: ["2", "6", "8"],
    userActions: ["note", "in_progress", "resolve", "cancel"],
  },
  "6": {
    value: "6",
    label: "Resolvido",
    labelEn: "Resolved",
    color: "text-green-700",
    bgColor: "bg-green-100",
    description: "Incidente resolvido, aguardando confirmação",
    isActive: false,
    canTransitionTo: ["2", "7"],
    userActions: ["note", "reopen", "close"],
  },
  "7": {
    value: "7",
    label: "Fechado",
    labelEn: "Closed",
    color: "text-gray-700",
    bgColor: "bg-gray-100",
    description: "Incidente fechado definitivamente",
    isActive: false,
    canTransitionTo: [],
    userActions: ["note"],
  },
  "8": {
    value: "8",
    label: "Cancelado",
    labelEn: "Cancelled",
    color: "text-red-700",
    bgColor: "bg-red-100",
    description: "Incidente cancelado ou inválido",
    isActive: false,
    canTransitionTo: [],
    userActions: ["note"],
  },
  "18": {
    value: "18",
    label: "Designado",
    labelEn: "Assigned",
    color: "text-indigo-700",
    bgColor: "bg-indigo-100",
    description: "Incidente atribuído a um analista específico",
    isActive: true,
    canTransitionTo: ["2", "3", "6", "8"],
    userActions: ["note", "in_progress", "hold", "resolve", "cancel"],
  },
};

// ServiceNow Change Task Status Mapping
export const CHANGE_TASK_STATUSES: Record<string, StatusConfig> = {
  "-5": {
    value: "-5",
    label: "Pendente",
    labelEn: "Pending",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    description: "Tarefa criada, aguardando início",
    isActive: true,
    canTransitionTo: ["1", "2", "3"],
    userActions: ["assign", "note", "open"],
  },
  "1": {
    value: "1",
    label: "Aberto",
    labelEn: "Open",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
    description: "Tarefa aberta e pronta para execução",
    isActive: true,
    canTransitionTo: ["2", "3", "4", "7", "8"],
    userActions: ["assign", "note", "in_progress"],
  },
  "2": {
    value: "2",
    label: "Designado",
    labelEn: "Assigned",
    color: "text-indigo-700",
    bgColor: "bg-indigo-100",
    description: "Tarefa atribuída a um responsável",
    isActive: true,
    canTransitionTo: ["3", "4", "7", "8"],
    userActions: ["note", "in_progress", "complete", "skip", "incomplete"],
  },
  "3": {
    value: "3",
    label: "Em Andamento",
    labelEn: "Work in Progress",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
    description: "Tarefa sendo executada",
    isActive: true,
    canTransitionTo: ["4", "7", "8"],
    userActions: ["note", "complete", "skip", "incomplete"],
  },
  "4": {
    value: "4",
    label: "Fechado Completo",
    labelEn: "Closed Complete",
    color: "text-green-700",
    bgColor: "bg-green-100",
    description: "Tarefa completada com sucesso",
    isActive: false,
    canTransitionTo: [],
    userActions: ["note"],
  },
  "7": {
    value: "7",
    label: "Fechado Pulado",
    labelEn: "Closed Skipped",
    color: "text-gray-700",
    bgColor: "bg-gray-100",
    description: "Tarefa pulada/não executada",
    isActive: false,
    canTransitionTo: [],
    userActions: ["note"],
  },
  "8": {
    value: "8",
    label: "Fechado Incompleto",
    labelEn: "Closed Incomplete",
    color: "text-red-700",
    bgColor: "bg-red-100",
    description: "Tarefa fechada sem completar",
    isActive: false,
    canTransitionTo: [],
    userActions: ["note"],
  },
};

// ServiceNow Service Catalog Task Status Mapping
export const SC_TASK_STATUSES: Record<string, StatusConfig> = {
  "-5": {
    value: "-5",
    label: "Pendente",
    labelEn: "Pending",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    description: "Tarefa de catálogo criada, aguardando processamento",
    isActive: true,
    canTransitionTo: ["1", "2", "3"],
    userActions: ["assign", "note", "open"],
  },
  "1": {
    value: "1",
    label: "Aberto",
    labelEn: "Open",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
    description: "Tarefa aberta e pronta para execução",
    isActive: true,
    canTransitionTo: ["2", "3", "4", "7"],
    userActions: ["assign", "note", "in_progress"],
  },
  "2": {
    value: "2",
    label: "Designado",
    labelEn: "Assigned",
    color: "text-indigo-700",
    bgColor: "bg-indigo-100",
    description: "Tarefa atribuída a um responsável",
    isActive: true,
    canTransitionTo: ["3", "4", "7"],
    userActions: ["note", "in_progress", "complete", "skip"],
  },
  "3": {
    value: "3",
    label: "Em Andamento",
    labelEn: "Work in Progress",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
    description: "Tarefa sendo executada",
    isActive: true,
    canTransitionTo: ["4", "7"],
    userActions: ["note", "complete", "skip"],
  },
  "4": {
    value: "4",
    label: "Fechado Completo",
    labelEn: "Closed Complete",
    color: "text-green-700",
    bgColor: "bg-green-100",
    description: "Tarefa completada com sucesso",
    isActive: false,
    canTransitionTo: [],
    userActions: ["note"],
  },
  "7": {
    value: "7",
    label: "Fechado Pulado",
    labelEn: "Closed Skipped",
    color: "text-gray-700",
    bgColor: "bg-gray-100",
    description: "Tarefa pulada/não executada",
    isActive: false,
    canTransitionTo: [],
    userActions: ["note"],
  },
};

// Complete Ticket Type Configuration
export const TICKET_TYPES: Record<string, TicketTypeConfig> = {
  incident: {
    name: "incident",
    label: "Incidentes",
    table: "incident",
    statuses: INCIDENT_STATUSES,
    fields: [
      "sys_id",
      "number",
      "state",
      "short_description",
      "description",
      "priority",
      "urgency",
      "impact",
      "category",
      "subcategory",
      "assignment_group",
      "assigned_to",
      "caller_id",
      "opened_by",
      "sys_created_on",
      "sys_updated_on",
      "due_date",
      "business_service",
      "cmdb_ci",
      "close_notes",
      "work_notes",
    ],
    detailFields: [
      "number",
      "state",
      "short_description",
      "description",
      "priority",
      "urgency",
      "impact",
      "category",
      "subcategory",
      "assignment_group",
      "assigned_to",
      "caller_id",
      "opened_by",
      "sys_created_on",
      "sys_updated_on",
      "due_date",
      "business_service",
      "cmdb_ci",
      "close_notes",
      "work_notes",
      "correlation_id",
      "correlation_display",
    ],
    actions: {
      assign: {
        label: "Assumir",
        icon: "user-check",
        targetStatus: "2",
        requiresNote: false,
      },
      note: { label: "Anotar", icon: "message-square", requiresNote: true },
      in_progress: {
        label: "Colocar em Andamento",
        icon: "play",
        targetStatus: "2",
        requiresNote: false,
      },
      hold: {
        label: "Colocar em Espera",
        icon: "pause",
        targetStatus: "3",
        requiresNote: true,
      },
      resolve: {
        label: "Resolver",
        icon: "check-circle",
        targetStatus: "6",
        requiresNote: true,
      },
      close: {
        label: "Fechar",
        icon: "x-circle",
        targetStatus: "7",
        requiresNote: false,
      },
      cancel: {
        label: "Cancelar",
        icon: "ban",
        targetStatus: "8",
        requiresNote: true,
        confirmMessage: "Deseja realmente cancelar este incidente?",
      },
      reopen: {
        label: "Reabrir",
        icon: "refresh-cw",
        targetStatus: "2",
        requiresNote: true,
      },
    },
  },
  change_task: {
    name: "change_task",
    label: "Change Tasks",
    table: "change_task",
    statuses: CHANGE_TASK_STATUSES,
    fields: [
      "sys_id",
      "number",
      "state",
      "short_description",
      "description",
      "assignment_group",
      "assigned_to",
      "change_request",
      "type",
      "sys_created_on",
      "sys_updated_on",
      "due_date",
      "planned_start_date",
      "planned_end_date",
      "work_notes",
      "close_notes",
    ],
    detailFields: [
      "number",
      "state",
      "short_description",
      "description",
      "assignment_group",
      "assigned_to",
      "change_request",
      "type",
      "sys_created_on",
      "sys_updated_on",
      "due_date",
      "planned_start_date",
      "planned_end_date",
      "work_notes",
      "close_notes",
    ],
    actions: {
      assign: {
        label: "Assumir",
        icon: "user-check",
        targetStatus: "2",
        requiresNote: false,
      },
      note: { label: "Anotar", icon: "message-square", requiresNote: true },
      in_progress: {
        label: "Colocar em Andamento",
        icon: "play",
        targetStatus: "3",
        requiresNote: false,
      },
      complete: {
        label: "Completar",
        icon: "check-circle",
        targetStatus: "4",
        requiresNote: false,
      },
      skip: {
        label: "Pular",
        icon: "skip-forward",
        targetStatus: "7",
        requiresNote: true,
        confirmMessage: "Deseja pular esta tarefa?",
      },
      incomplete: {
        label: "Fechar Incompleto",
        icon: "x-circle",
        targetStatus: "8",
        requiresNote: true,
        confirmMessage: "Deseja fechar esta tarefa como incompleta?",
      },
    },
  },
  sc_task: {
    name: "sc_task",
    label: "Service Catalog Tasks",
    table: "sc_task",
    statuses: SC_TASK_STATUSES,
    fields: [
      "sys_id",
      "number",
      "state",
      "short_description",
      "description",
      "assignment_group",
      "assigned_to",
      "request",
      "request_item",
      "sys_created_on",
      "sys_updated_on",
      "due_date",
      "work_notes",
      "close_notes",
    ],
    detailFields: [
      "number",
      "state",
      "short_description",
      "description",
      "assignment_group",
      "assigned_to",
      "request",
      "request_item",
      "sys_created_on",
      "sys_updated_on",
      "due_date",
      "work_notes",
      "close_notes",
    ],
    actions: {
      assign: {
        label: "Assumir",
        icon: "user-check",
        targetStatus: "2",
        requiresNote: false,
      },
      note: { label: "Anotar", icon: "message-square", requiresNote: true },
      in_progress: {
        label: "Colocar em Andamento",
        icon: "play",
        targetStatus: "3",
        requiresNote: false,
      },
      complete: {
        label: "Completar",
        icon: "check-circle",
        targetStatus: "4",
        requiresNote: false,
      },
      skip: {
        label: "Pular",
        icon: "skip-forward",
        targetStatus: "7",
        requiresNote: true,
        confirmMessage: "Deseja pular esta tarefa?",
      },
    },
  },
};

// Helper functions
export function getStatusConfig(
  ticketType: string,
  stateValue: string,
): StatusConfig | null {
  const typeConfig = TICKET_TYPES[ticketType];
  if (!typeConfig) return null;

  return typeConfig.statuses[stateValue] || null;
}

export function getActiveStatuses(ticketType: string): StatusConfig[] {
  const typeConfig = TICKET_TYPES[ticketType];
  if (!typeConfig) return [];

  return Object.values(typeConfig.statuses).filter((status) => status.isActive);
}

export function getAllStatuses(ticketType: string): StatusConfig[] {
  const typeConfig = TICKET_TYPES[ticketType];
  if (!typeConfig) return [];

  return Object.values(typeConfig.statuses);
}

export function canTransitionTo(
  ticketType: string,
  fromState: string,
  toState: string,
): boolean {
  const statusConfig = getStatusConfig(ticketType, fromState);
  if (!statusConfig) return false;

  return statusConfig.canTransitionTo.includes(toState);
}

export function getUserActions(
  ticketType: string,
  currentState: string,
): string[] {
  const statusConfig = getStatusConfig(ticketType, currentState);
  if (!statusConfig) return [];

  return statusConfig.userActions;
}

// Status filter mapping for API queries
export const STATUS_FILTERS = {
  all: "stateINAll",
  active: "stateIN1,2,3,18,-5", // All active states across all types
  new: "state=1",
  assigned: "stateIN2,18", // Both "Assigned" and "Designated"
  in_progress: "stateIN2,3", // In Progress and On Hold
  resolved: "state=6",
  closed: "stateIN4,7,8", // All closed states
  pending: "state=-5",
};
