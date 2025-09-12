/**
 * TicketFilters - Ticket Filtering and State Management Configuration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Centralized configuration for ticket filtering, state management, and tab organization.
 * Provides type-specific state mappings and group filtering options.
 */

/**
 * Available ticket types in the system
 */
export type TicketType = 'incident' | 'change_task' | 'sc_task';

/**
 * Group filter options interface
 */
export interface GroupOption {
  value: string;
  label: string;
}

/**
 * State configuration for each ticket type
 */
export interface TicketTypeStates {
  [key: string]: string;
}

/**
 * Complete ticket type configuration
 */
export interface TicketTypeConfig {
  states: TicketTypeStates;
  icon: string;
  label: string;
  description: string;
}

/**
 * Dashboard state interface for Alpine.js
 */
export interface DashboardState {
  activeTab: TicketType;
  group: string;
  state: string;
  autoRefreshPaused: boolean;
  refreshInterval: number;
}

/**
 * Available groups for filtering tickets
 */
export const GROUP_OPTIONS: GroupOption[] = [
  { value: 'all', label: 'Todos os Grupos' },
  { value: 'L2-NE-IT APP AND DATABASE', label: 'App & Database' },
  { value: 'L2-NE-IT SAP BASIS', label: 'SAP Basis' },
  { value: 'L2-NE-IT APP AND SERVICES', label: 'App & Services' },
  { value: 'L2-NE-IT PROCESSING', label: 'Processing' },
  { value: 'L2-NE-IT NETWORK SECURITY', label: 'Network Security' },
  { value: 'L2-NE-IT NETWORK', label: 'Network' },
  { value: 'L2-NE-CLOUDSERVICES', label: 'Cloud Services' },
  { value: 'L2-NE-IT MONITORY', label: 'Monitoring' },
  { value: 'L2-NE-IT SO UNIX', label: 'Unix Systems' },
  { value: 'L2-NE-IT BOC', label: 'BOC' },
  { value: 'L2-NE-IT MIDDLEWARE', label: 'Middleware' },
  { value: 'L2-NE-IT BACKUP', label: 'Backup' },
  { value: 'L2-NE-IT STORAGE', label: 'Storage' },
  { value: 'L2-NE-IT VOIP', label: 'VoIP' },
  { value: 'L2-NE-IT NOC', label: 'NOC' }
];

/**
 * Global state labels mapping - common across all ticket types
 */
export const GLOBAL_STATE_LABELS: { [key: string]: string } = {
  'all': 'Todos Status',
  'new': 'Novo',
  'in_progress': 'Em Andamento',
  'designated': 'Designado',
  'waiting': 'Em Espera',
  'resolved': 'Resolvido',
  'closed': 'Fechado',
  'cancelled': 'Cancelado'
};

/**
 * Status específicos por tipo de ticket usando estados nomeados consistentes
 */
export const TICKET_TYPE_CONFIGURATIONS: { [K in TicketType]: TicketTypeConfig } = {
  incident: {
    states: {
      'all': 'Todos Status',
      'new': 'Novo',
      'in_progress': 'Em Andamento',
      'assigned': 'Designado',
      'awaiting': 'Em Espera',
      'resolved': 'Resolvido',
      'closed': 'Fechado',
      'cancelled': 'Cancelado'
    },
    icon: 'alert-circle',
    label: 'Incidents',
    description: 'Incidentes do ServiceNow'
  },
  change_task: {
    states: {
      'all': 'Todos Status',
      'new': 'Novo',
      'in_progress': 'Em Andamento',
      'awaiting': 'Em Espera',
      'scheduled': 'Agendado',
      'complete': 'Completo',
      'closed': 'Fechado',
      'cancelled': 'Cancelado'
    },
    icon: 'git-branch',
    label: 'Change Tasks',
    description: 'Tarefas de mudança'
  },
  sc_task: {
    states: {
      'all': 'Todos Status',
      'new': 'Novo',
      'in_progress': 'Em Andamento',
      'awaiting': 'Em Espera',
      'closed_complete': 'Fechado Completo',
      'closed_incomplete': 'Fechado Incompleto',
      'closed_skipped': 'Fechado Ignorado'
    },
    icon: 'shopping-cart',
    label: 'Service Tasks',
    description: 'Tarefas de serviço'
  }
};

/**
 * Default dashboard configuration
 */
export const DEFAULT_DASHBOARD_STATE: DashboardState = {
  activeTab: 'incident',
  group: 'all',
  state: 'in_progress',
  autoRefreshPaused: false,
  refreshInterval: 15
};

/**
 * Get states available for a specific ticket type
 * @param ticketType - The ticket type
 * @returns Object with state keys and labels
 */
export function getAvailableStates(ticketType: TicketType): TicketTypeStates {
  return TICKET_TYPE_CONFIGURATIONS[ticketType]?.states || {};
}

/**
 * Get configuration for a specific ticket type
 * @param ticketType - The ticket type
 * @returns Complete configuration object
 */
export function getTicketTypeConfig(ticketType: TicketType): TicketTypeConfig {
  return TICKET_TYPE_CONFIGURATIONS[ticketType];
}

/**
 * Check if a ticket type is valid
 * @param ticketType - Type to validate
 * @returns True if valid ticket type
 */
export function isValidTicketType(ticketType: string): ticketType is TicketType {
  return ['incident', 'change_task', 'sc_task'].includes(ticketType);
}

/**
 * Get all available ticket types with their configurations
 * @returns Array of ticket type configurations with keys
 */
export function getAllTicketTypes(): Array<{ key: TicketType; config: TicketTypeConfig }> {
  return Object.entries(TICKET_TYPE_CONFIGURATIONS).map(([key, config]) => ({
    key: key as TicketType,
    config
  }));
}

/**
 * Get group option by value
 * @param value - Group value to search for
 * @returns Group option or undefined if not found
 */
export function getGroupOption(value: string): GroupOption | undefined {
  return GROUP_OPTIONS.find(option => option.value === value);
}

/**
 * Check if a group is valid
 * @param group - Group value to validate
 * @returns True if group exists in options
 */
export function isValidGroup(group: string): boolean {
  return GROUP_OPTIONS.some(option => option.value === group);
}

/**
 * Generate filter query parameters for API calls
 * @param filters - Filter state object
 * @returns URL search parameters string
 */
export function generateFilterParams(filters: {
  group?: string;
  state?: string;
  ticketType?: TicketType;
  page?: number;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  
  if (filters.group && filters.group !== 'all') {
    params.append('group', filters.group);
  }
  
  if (filters.state && filters.state !== 'all') {
    params.append('state', filters.state);
  }
  
  if (filters.ticketType) {
    params.append('ticketType', filters.ticketType);
  }
  
  if (filters.page) {
    params.append('page', filters.page.toString());
  }
  
  if (filters.limit) {
    params.append('limit', filters.limit.toString());
  }
  
  return params.toString();
}

/**
 * Create dashboard Alpine.js data object
 * @param initialState - Initial dashboard state
 * @returns Complete Alpine.js data object
 */
export function createDashboardData(initialState: Partial<DashboardState> = {}): any {
  const state = { ...DEFAULT_DASHBOARD_STATE, ...initialState };
  
  return {
    ...state,
    stateLabels: GLOBAL_STATE_LABELS,
    ticketTypeStates: TICKET_TYPE_CONFIGURATIONS,
    
    // Getter para status disponíveis do tipo ativo
    get availableStates() {
      return getAvailableStates(this.activeTab);
    },
    
    // Load specific tab with current filters
    loadTab(tabType: TicketType) {
      this.activeTab = tabType;
      const params = generateFilterParams({
        group: this.group,
        state: this.state,
        ticketType: tabType,
        page: 1,
        limit: 10
      });
      
      // Trigger lazy loading for the selected tab
      (window as any).htmx.ajax('GET', `/clean/tickets-lazy?${params}`, {
        target: `#tickets-container-${tabType}`,
        swap: 'innerHTML'
      });
    },
    
    // Update filters and refresh current tab
    updateFilters() {
      this.loadTab(this.activeTab);
    },
    
    // Toggle auto-refresh functionality
    toggleAutoRefresh() {
      this.autoRefreshPaused = !this.autoRefreshPaused;
      console.log('Auto-refresh:', this.autoRefreshPaused ? 'Pausado' : 'Ativo');
    },
    
    // Adjust refresh interval
    adjustRefreshInterval(interval: number) {
      this.refreshInterval = interval;
      console.log('Intervalo de atualização ajustado para:', interval + 's');
    }
  };
}