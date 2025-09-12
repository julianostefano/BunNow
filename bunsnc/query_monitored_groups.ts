/**
 * Query Monitored Groups Script - Detailed Ticket Information with SLA and Notes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Queries tickets from monitored groups with complete details including SLA and notes
 * Focus on "L2-NE-IT APP AND DATABASE" as requested by user
 */

import { ServiceNowAuthClient } from './src/services/ServiceNowAuthClient';
import { EnhancedTicketStorageService } from './src/services/EnhancedTicketStorageService';

interface TicketDetails {
  // Basic ticket information
  sys_id: string;
  number: string;
  short_description: string;
  description?: string;
  state: string;
  priority: string;
  urgency?: string;
  impact?: string;
  category?: string;
  subcategory?: string;
  
  // Assignment information
  assignment_group?: {
    display_value: string;
    value: string;
  };
  assigned_to?: {
    display_value: string;
    value: string;
  };
  caller_id?: {
    display_value: string;
    value: string;
  };
  
  // Timestamps
  sys_created_on: string;
  sys_updated_on: string;
  resolved_at?: string;
  closed_at?: string;
  
  // SLA Information
  sla_data: SLAInfo[];
  
  // Notes Information  
  notes: NoteInfo[];
  
  // Additional metadata
  table_name: 'incident' | 'change_task' | 'sc_task';
}

interface SLAInfo {
  sys_id: string;
  sla_name: string;
  stage: string;
  business_percentage: number;
  has_breached: boolean;
  start_time?: string;
  end_time?: string;
  planned_end_time?: string;
  business_duration?: string;
  remaining_time?: string;
}

interface NoteInfo {
  sys_id: string;
  value: string;
  sys_created_on: string;
  sys_created_by: {
    display_value: string;
    value: string;
  };
  element?: string;
  type: 'work_notes' | 'comments' | 'additional_comments';
}

class MonitoredGroupsQuerier {
  private serviceNowClient: ServiceNowAuthClient;
  private mongoStorage: EnhancedTicketStorageService;
  
  // Monitored groups from htmx-dashboard-clean.ts
  private readonly MONITORED_GROUPS = [
    "L2-NE-IT APP AND DATABASE",
    "L2-NE-IT SAP BASIS", 
    "L2-NE-IT APP AND SERVICES",
    "L2-NE-IT PROCESSING",
    "L2-NE-IT NETWORK SECURITY",
    "L2-NE-IT NETWORK",
    "L2-NE-CLOUDSERVICES",
    "L2-NE-IT MONITORY",
    "L2-NE-IT SO UNIX",
    "L2-NE-IT BOC",
    "L2-NE-IT MIDDLEWARE",
    "L2-NE-IT BACKUP",
    "L2-NE-IT STORAGE",
    "L2-NE-IT VOIP",
    "L2-NE-IT NOC",
    "L2-NE-IT PCP PRODUCTION"
  ];

  constructor() {
    this.serviceNowClient = new ServiceNowAuthClient();
    this.mongoStorage = new EnhancedTicketStorageService();
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Monitored Groups Querier...');
    
    try {
      // Initialize connections
      await this.mongoStorage.initialize();
      await this.serviceNowClient.authenticate();
      
      console.log('✅ All services initialized successfully');
      console.log(`📋 Monitoring ${this.MONITORED_GROUPS.length} groups`);
      console.log(`🎯 Primary focus: "L2-NE-IT APP AND DATABASE"`);
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  async queryGroupTickets(groupName: string, limit: number = 10): Promise<TicketDetails[]> {
    console.log(`\n🔍 Querying tickets for group: "${groupName}"`);
    
    const allTickets: TicketDetails[] = [];
    
    // Query incidents
    const incidents = await this.queryIncidents(groupName, Math.ceil(limit / 3));
    allTickets.push(...incidents);
    
    // Query change tasks
    const changeTasks = await this.queryChangeTasks(groupName, Math.ceil(limit / 3));
    allTickets.push(...changeTasks);
    
    // Query service request tasks
    const scTasks = await this.querySCTasks(groupName, Math.ceil(limit / 3));
    allTickets.push(...scTasks);
    
    // Sort by creation date (newest first)
    allTickets.sort((a, b) => new Date(b.sys_created_on).getTime() - new Date(a.sys_created_on).getTime());
    
    return allTickets.slice(0, limit);
  }

  private async queryIncidents(groupName: string, limit: number): Promise<TicketDetails[]> {
    try {
      const query = `assignment_group.nameCONTAINS${groupName}^state!=6^state!=7`; // Exclude resolved/closed
      
      const response = await this.serviceNowClient.makeRequestFullFields(
        'incident',
        query,
        limit,
        'sys_id,number,short_description,description,state,priority,urgency,impact,category,subcategory,assignment_group,assigned_to,caller_id,opened_by,sys_created_on,sys_updated_on,resolved_at,closed_at,close_code,close_notes,resolution_code,resolution_notes'
      );
      
      if (!response?.result || response.result.length === 0) {
        console.log(`   📝 No active incidents found for group "${groupName}"`);
        return [];
      }
      
      console.log(`   📝 Found ${response.result.length} incidents for group "${groupName}"`);
      
      const tickets: TicketDetails[] = [];
      
      for (const incident of response.result) {
        const ticketDetails = await this.enrichTicketWithSLAAndNotes(incident, 'incident');
        tickets.push(ticketDetails);
      }
      
      return tickets;
      
    } catch (error) {
      console.error(`❌ Error querying incidents for group "${groupName}":`, error);
      return [];
    }
  }

  private async queryChangeTasks(groupName: string, limit: number): Promise<TicketDetails[]> {
    try {
      const query = `assignment_group.nameCONTAINS${groupName}^state!=3^state!=-5`; // Exclude closed states
      
      const response = await this.serviceNowClient.makeRequestFullFields(
        'change_task',
        query,
        limit,
        'sys_id,number,short_description,description,state,priority,urgency,impact,assignment_group,assigned_to,change_request,sys_created_on,sys_updated_on'
      );
      
      if (!response?.result || response.result.length === 0) {
        console.log(`   🔄 No active change tasks found for group "${groupName}"`);
        return [];
      }
      
      console.log(`   🔄 Found ${response.result.length} change tasks for group "${groupName}"`);
      
      const tickets: TicketDetails[] = [];
      
      for (const task of response.result) {
        const ticketDetails = await this.enrichTicketWithSLAAndNotes(task, 'change_task');
        tickets.push(ticketDetails);
      }
      
      return tickets;
      
    } catch (error) {
      console.error(`❌ Error querying change tasks for group "${groupName}":`, error);
      return [];
    }
  }

  private async querySCTasks(groupName: string, limit: number): Promise<TicketDetails[]> {
    try {
      const query = `assignment_group.nameCONTAINS${groupName}^state!=3^state!=-5`; // Exclude closed states
      
      const response = await this.serviceNowClient.makeRequestFullFields(
        'sc_task',
        query,
        limit,
        'sys_id,number,short_description,description,state,priority,urgency,impact,assignment_group,assigned_to,request,sys_created_on,sys_updated_on'
      );
      
      if (!response?.result || response.result.length === 0) {
        console.log(`   🎫 No active service request tasks found for group "${groupName}"`);
        return [];
      }
      
      console.log(`   🎫 Found ${response.result.length} service request tasks for group "${groupName}"`);
      
      const tickets: TicketDetails[] = [];
      
      for (const task of response.result) {
        const ticketDetails = await this.enrichTicketWithSLAAndNotes(task, 'sc_task');
        tickets.push(ticketDetails);
      }
      
      return tickets;
      
    } catch (error) {
      console.error(`❌ Error querying service request tasks for group "${groupName}":`, error);
      return [];
    }
  }

  private async enrichTicketWithSLAAndNotes(ticket: any, tableName: 'incident' | 'change_task' | 'sc_task'): Promise<TicketDetails> {
    // Get SLA data
    const slaData = await this.getSLAData(ticket.sys_id);
    
    // Get notes data
    const notes = await this.getNotesData(ticket.sys_id);
    
    // Helper function to safely extract ServiceNow field values
    const extractValue = (field: any): string => {
      if (!field) return '';
      if (typeof field === 'string') return field;
      if (field.value !== undefined) return field.value;
      if (field.display_value !== undefined) return field.display_value;
      return String(field);
    };

    // Helper function to safely extract reference field values
    const extractReference = (field: any): { display_value: string; value: string } | undefined => {
      if (!field) return undefined;
      if (typeof field === 'string') return { display_value: field, value: field };
      if (field.display_value !== undefined || field.value !== undefined) {
        return {
          display_value: field.display_value || field.value || '',
          value: field.value || field.display_value || ''
        };
      }
      return { display_value: String(field), value: String(field) };
    };

    // Build enriched ticket details with proper value extraction
    const enrichedTicket: TicketDetails = {
      sys_id: extractValue(ticket.sys_id),
      number: extractValue(ticket.number),
      short_description: extractValue(ticket.short_description),
      description: extractValue(ticket.description),
      state: extractValue(ticket.state),
      priority: extractValue(ticket.priority),
      urgency: extractValue(ticket.urgency),
      impact: extractValue(ticket.impact),
      category: extractValue(ticket.category),
      subcategory: extractValue(ticket.subcategory),
      assignment_group: extractReference(ticket.assignment_group),
      assigned_to: extractReference(ticket.assigned_to),
      caller_id: extractReference(ticket.caller_id || ticket.opened_by),
      sys_created_on: extractValue(ticket.sys_created_on),
      sys_updated_on: extractValue(ticket.sys_updated_on),
      resolved_at: extractValue(ticket.resolved_at),
      closed_at: extractValue(ticket.closed_at),
      sla_data: slaData,
      notes: notes,
      table_name: tableName
    };
    
    return enrichedTicket;
  }

  private async getSLAData(taskSysId: string): Promise<SLAInfo[]> {
    try {
      const response = await this.serviceNowClient.makeRequestFullFields(
        'task_sla',
        `task=${taskSysId}`,
        50,
        'sys_id,sla.name,stage,business_percentage,has_breached,start_time,end_time,planned_end_time,business_duration'
      );
      
      if (!response?.result) {
        return [];
      }
      
      return response.result.map((sla: any): SLAInfo => ({
        sys_id: sla.sys_id,
        sla_name: sla.sla?.display_value || sla.sla?.name || 'Unknown SLA',
        stage: sla.stage || 'Unknown',
        business_percentage: parseFloat(sla.business_percentage) || 0,
        has_breached: sla.has_breached === 'true' || sla.has_breached === true,
        start_time: sla.start_time,
        end_time: sla.end_time,
        planned_end_time: sla.planned_end_time,
        business_duration: sla.business_duration
      }));
      
    } catch (error) {
      console.error(`⚠️ Error getting SLA data for task ${taskSysId}:`, error);
      return [];
    }
  }

  private async getNotesData(taskSysId: string): Promise<NoteInfo[]> {
    try {
      const response = await this.serviceNowClient.makeRequestFullFields(
        'sys_journal_field',
        `element_id=${taskSysId}`,
        50,
        'sys_id,element,value,sys_created_on,sys_created_by'
      );
      
      if (!response?.result) {
        return [];
      }
      
      return response.result
        .filter((note: any) => note.value && note.value.trim().length > 0) // Filter out empty notes
        .map((note: any): NoteInfo => ({
          sys_id: note.sys_id,
          value: note.value,
          sys_created_on: note.sys_created_on,
          sys_created_by: note.sys_created_by || { display_value: 'Unknown', value: '' },
          element: note.element,
          type: this.determineNoteType(note.element)
        }))
        .sort((a, b) => new Date(b.sys_created_on).getTime() - new Date(a.sys_created_on).getTime()); // Newest first
      
    } catch (error) {
      console.error(`⚠️ Error getting notes data for task ${taskSysId}:`, error);
      return [];
    }
  }

  private determineNoteType(element: string): 'work_notes' | 'comments' | 'additional_comments' {
    if (element === 'work_notes') return 'work_notes';
    if (element === 'comments') return 'comments';
    if (element === 'additional_comments') return 'additional_comments';
    return 'work_notes'; // default
  }

  private formatTicketReport(ticket: TicketDetails): string {
    const stateNames: Record<string, string> = {
      '1': 'Novo',
      '2': 'Em Progresso', 
      '3': 'Fechado',
      '6': 'Resolvido',
      '7': 'Fechado',
      '-5': 'Cancelado'
    };
    
    const priorityNames: Record<string, string> = {
      '1': 'Crítica',
      '2': 'Alta',
      '3': 'Moderada', 
      '4': 'Baixa',
      '5': 'Planejamento'
    };

    // Helper function to safely format ServiceNow dates
    const formatDate = (dateStr: string): string => {
      if (!dateStr || dateStr === '' || dateStr === 'undefined' || dateStr === 'null') return 'Não informado';
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return 'Data inválida';
        return date.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (error) {
        return dateStr; // Return original string if formatting fails
      }
    };

    // Safe value extraction (already done by enrichTicketWithSLAAndNotes, but just to be sure)
    const safeString = (value: any): string => {
      if (!value) return 'N/A';
      if (typeof value === 'string') return value;
      return String(value);
    };
    
    let report = `
┌─ ${ticket.table_name.toUpperCase()} ${safeString(ticket.number)} ────────────────────────────────
│ 📝 Descrição: ${safeString(ticket.short_description)}
│ 🏷️  Estado: ${stateNames[ticket.state] || safeString(ticket.state)} | Prioridade: ${priorityNames[ticket.priority] || safeString(ticket.priority)}
│ 👥 Grupo: ${ticket.assignment_group?.display_value || 'Não atribuído'}
│ 👤 Responsável: ${ticket.assigned_to?.display_value || 'Não atribuído'}
│ 📞 Solicitante: ${ticket.caller_id?.display_value || 'Não informado'}
│ 📅 Criado: ${formatDate(ticket.sys_created_on)}
│ 🔄 Atualizado: ${formatDate(ticket.sys_updated_on)}`;

    // Additional timing information if available
    if (ticket.resolved_at) {
      report += `\n│ ✅ Resolvido: ${formatDate(ticket.resolved_at)}`;
    }
    if (ticket.closed_at) {
      report += `\n│ 🔒 Fechado: ${formatDate(ticket.closed_at)}`;
    }

    // SLA Information
    if (ticket.sla_data.length > 0) {
      report += `\n│\n│ 📊 SLAs (${ticket.sla_data.length}):`; 
      ticket.sla_data.forEach(sla => {
        const breachIcon = sla.has_breached ? '🔴' : (sla.business_percentage > 80 ? '🟡' : '🟢');
        report += `\n│   ${breachIcon} ${sla.sla_name}: ${sla.business_percentage.toFixed(1)}% (${sla.stage})`;
        if (sla.has_breached) {
          report += ' - VIOLADO';
        } else if (sla.business_percentage > 80) {
          report += ' - ATENÇÃO';
        }
      });
    } else {
      report += `\n│\n│ 📊 SLAs: Nenhum SLA encontrado`;
    }

    // Notes Information
    if (ticket.notes.length > 0) {
      report += `\n│\n│ 📝 Anotações (${ticket.notes.length}):`;
      ticket.notes.slice(0, 3).forEach(note => { // Show only latest 3 notes
        const noteDate = formatDate(note.sys_created_on);
        const notePreview = note.value.substring(0, 100) + (note.value.length > 100 ? '...' : '');
        const noteAuthor = note.sys_created_by?.display_value || 'Usuário desconhecido';
        report += `\n│   📄 ${noteDate} - ${noteAuthor}`;
        report += `\n│      ${notePreview.replace(/\n/g, ' ')}`;
      });
      if (ticket.notes.length > 3) {
        report += `\n│   ... e mais ${ticket.notes.length - 3} anotações`;
      }
    } else {
      report += `\n│\n│ 📝 Anotações: Nenhuma anotação encontrada`;
    }

    report += `\n└${'─'.repeat(60)}`;
    
    return report;
  }

  async queryAndReportPrimaryGroup(): Promise<void> {
    const primaryGroup = "L2-NE-IT APP AND DATABASE";
    
    console.log(`\n🎯 Consultando tickets do grupo principal: "${primaryGroup}"`);
    console.log('═'.repeat(80));
    
    const tickets = await this.queryGroupTickets(primaryGroup, 10);
    
    if (tickets.length === 0) {
      console.log(`\n⚠️ Nenhum ticket ativo encontrado para o grupo "${primaryGroup}"`);
      console.log('   Possíveis motivos:');
      console.log('   - Todos os tickets estão resolvidos/fechados');
      console.log('   - Nome do grupo pode estar diferente no ServiceNow');
      console.log('   - Problemas de conectividade ou autenticação');
      return;
    }
    
    console.log(`\n✅ Encontrados ${tickets.length} tickets ativos para o grupo "${primaryGroup}"`);
    console.log('   Distribuição por tipo:');
    
    const typeCount = tickets.reduce((acc, ticket) => {
      acc[ticket.table_name] = (acc[ticket.table_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(typeCount).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count} tickets`);
    });
    
    console.log('\n📋 Detalhes dos Tickets:');
    console.log('═'.repeat(80));
    
    tickets.forEach(ticket => {
      console.log(this.formatTicketReport(ticket));
    });
  }

  async queryAllMonitoredGroups(): Promise<void> {
    console.log('\n🌐 Consultando todos os grupos monitorados...');
    console.log('═'.repeat(80));
    
    const groupStats: Array<{
      group: string;
      incidents: number;
      change_tasks: number;
      sc_tasks: number;
      total: number;
    }> = [];
    
    for (const group of this.MONITORED_GROUPS) {
      console.log(`\n🔍 Verificando grupo: "${group}"`);
      
      const tickets = await this.queryGroupTickets(group, 5);
      
      const stats = {
        group,
        incidents: tickets.filter(t => t.table_name === 'incident').length,
        change_tasks: tickets.filter(t => t.table_name === 'change_task').length,  
        sc_tasks: tickets.filter(t => t.table_name === 'sc_task').length,
        total: tickets.length
      };
      
      groupStats.push(stats);
      
      if (tickets.length > 0) {
        console.log(`   ✅ ${tickets.length} tickets ativos encontrados`);
      } else {
        console.log('   📭 Nenhum ticket ativo encontrado');
      }
    }
    
    console.log('\n📊 Resumo Geral dos Grupos Monitorados:');
    console.log('═'.repeat(80));
    
    const totalTickets = groupStats.reduce((sum, stat) => sum + stat.total, 0);
    console.log(`Total de tickets ativos: ${totalTickets}`);
    
    console.log('\n🏆 Top 5 grupos com mais tickets:');
    groupStats
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .forEach((stat, index) => {
        console.log(`${index + 1}. ${stat.group}: ${stat.total} tickets`);
        if (stat.total > 0) {
          console.log(`   └─ Incidents: ${stat.incidents}, Change Tasks: ${stat.change_tasks}, SC Tasks: ${stat.sc_tasks}`);
        }
      });
  }

  async run(): Promise<void> {
    try {
      await this.initialize();
      
      // First, query the primary group as requested by user
      await this.queryAndReportPrimaryGroup();
      
      // Then, query all monitored groups for overview
      await this.queryAllMonitoredGroups();
      
      console.log('\n✅ Consulta completa finalizada!');
      
    } catch (error) {
      console.error('\n💥 Erro na execução:', error);
      throw error;
    }
  }
}

// Export for use in other scripts
export { MonitoredGroupsQuerier, TicketDetails, SLAInfo, NoteInfo };

// Run if called directly
if (import.meta.main) {
  console.log('🚀 Iniciando consulta de tickets dos grupos monitorados...');
  
  const querier = new MonitoredGroupsQuerier();
  
  querier.run()
    .then(() => {
      console.log('\n🎯 Consulta concluída com sucesso!');
      console.log('📊 Verifique os detalhes dos tickets acima.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Falha na consulta:', error);
      process.exit(1);
    });
}