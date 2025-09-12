/**
 * StatusConfig - Unified Status Management System
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Centralized configuration for ServiceNow ticket status mapping.
 * Handles conversion between named states (frontend) and numeric codes (ServiceNow API).
 */

/**
 * Configuration interface for ticket status display and mapping
 */
export interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  numericCode: string;
}

/**
 * Unified state mapping - source of truth for all status conversions
 * Maps both named states (frontend) and numeric codes (ServiceNow API) to consistent configuration
 */
export const UNIFIED_STATUS_MAP: Record<string, StatusConfig> = {
  // Named states (used by frontend)
  'new': { 
    label: 'Novo', 
    color: 'text-blue-300', 
    bgColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    numericCode: '1'
  },
  'in_progress': { 
    label: 'Em Andamento', 
    color: 'text-yellow-300', 
    bgColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    numericCode: '2'
  },
  'designated': { 
    label: 'Designado', 
    color: 'text-indigo-300', 
    bgColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    numericCode: '18'
  },
  'assigned': { 
    label: 'Atribuído', 
    color: 'text-purple-300', 
    bgColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    numericCode: '18'  // Same as designated - ServiceNow uses same code
  },
  'waiting': { 
    label: 'Em Espera', 
    color: 'text-orange-300', 
    bgColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    numericCode: '3'
  },
  'awaiting': { 
    label: 'Aguardando', 
    color: 'text-amber-300', 
    bgColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    numericCode: '3'  // Same as waiting - ServiceNow uses same code
  },
  'resolved': { 
    label: 'Resolvido', 
    color: 'text-green-300', 
    bgColor: 'bg-green-500/20 text-green-300 border-green-500/30',
    numericCode: '6'
  },
  'closed': { 
    label: 'Fechado', 
    color: 'text-gray-300', 
    bgColor: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    numericCode: '7'
  },
  'cancelled': { 
    label: 'Cancelado', 
    color: 'text-red-300', 
    bgColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    numericCode: '8'
  },
  // Additional states for Change Tasks
  'scheduled': { 
    label: 'Agendado', 
    color: 'text-purple-300', 
    bgColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    numericCode: '4'
  },
  'complete': { 
    label: 'Completo', 
    color: 'text-emerald-300', 
    bgColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    numericCode: '6'
  },
  // Additional states for SC Tasks
  'closed_complete': { 
    label: 'Fechado Completo', 
    color: 'text-green-300', 
    bgColor: 'bg-green-500/20 text-green-300 border-green-500/30',
    numericCode: '3'
  },
  'closed_incomplete': { 
    label: 'Fechado Incompleto', 
    color: 'text-amber-300', 
    bgColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    numericCode: '4'
  },
  'closed_skipped': { 
    label: 'Fechado Ignorado', 
    color: 'text-gray-400', 
    bgColor: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
    numericCode: '7'
  },
  // Numeric states (returned by ServiceNow API) - mapped back to same config
  '1': { 
    label: 'Novo', 
    color: 'text-blue-300', 
    bgColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    numericCode: '1'
  },
  '2': { 
    label: 'Em Andamento', 
    color: 'text-yellow-300', 
    bgColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    numericCode: '2'
  },
  '18': { 
    label: 'Designado', 
    color: 'text-indigo-300', 
    bgColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    numericCode: '18'
  },
  '3': { 
    label: 'Em Espera', 
    color: 'text-orange-300', 
    bgColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    numericCode: '3'
  },
  '6': { 
    label: 'Resolvido', 
    color: 'text-green-300', 
    bgColor: 'bg-green-500/20 text-green-300 border-green-500/30',
    numericCode: '6'
  },
  '7': { 
    label: 'Fechado', 
    color: 'text-gray-300', 
    bgColor: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    numericCode: '7'
  },
  '8': { 
    label: 'Cancelado', 
    color: 'text-red-300', 
    bgColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    numericCode: '8'
  },
  // Additional numeric codes for extended states
  '4': { 
    label: 'Agendado/Incompleto', 
    color: 'text-purple-300', 
    bgColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    numericCode: '4'
  }
};

/**
 * Get status configuration for any state (named or numeric)
 * @param state - The state value (e.g., 'designated', '18', 'in_progress', '2')
 * @returns StatusConfig object with label, colors, and numeric code
 */
export function getUnifiedStatusConfig(state: string): StatusConfig {
  const config = UNIFIED_STATUS_MAP[state];
  if (!config) {
    console.warn(`Unknown state: ${state}, using default`);
    return {
      label: 'Desconhecido',
      color: 'text-gray-300',
      bgColor: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
      numericCode: '1'
    };
  }
  return config;
}

/**
 * Convert named state to numeric code for ServiceNow API
 * @param namedState - Named state like 'designated', 'in_progress'  
 * @returns Numeric code like '18', '2'
 */
export function stateToNumeric(namedState: string): string {
  // If already numeric, return as-is
  if (/^\d+$/.test(namedState)) {
    return namedState;
  }
  
  const config = UNIFIED_STATUS_MAP[namedState];
  return config ? config.numericCode : '1';
}

/**
 * Convert numeric code to named state for frontend display
 * @param numericCode - Numeric code like '18', '2'
 * @returns Named state or original code if no mapping found
 */
export function numericToState(numericCode: string): string {
  // Find the first named state that maps to this numeric code
  for (const [key, config] of Object.entries(UNIFIED_STATUS_MAP)) {
    if (config.numericCode === numericCode && !/^\d+$/.test(key)) {
      return key;
    }
  }
  
  // Return original if no named mapping found
  return numericCode;
}

/**
 * Get all available status configurations
 * @returns Array of all status configurations with their keys
 */
export function getAllStatusConfigs(): Array<{ key: string; config: StatusConfig }> {
  return Object.entries(UNIFIED_STATUS_MAP)
    .filter(([key]) => !/^\d+$/.test(key)) // Only return named states
    .map(([key, config]) => ({ key, config }));
}

/**
 * Check if a state represents a closed/completed ticket
 * @param state - State value (named or numeric)
 * @returns True if the ticket is in a closed state
 */
export function isClosedState(state: string): boolean {
  const numericCode = stateToNumeric(state);
  return ['6', '7', '8'].includes(numericCode);
}

/**
 * Check if a state represents an active/open ticket
 * @param state - State value (named or numeric) 
 * @returns True if the ticket is in an active state
 */
export function isActiveState(state: string): boolean {
  return !isClosedState(state);
}