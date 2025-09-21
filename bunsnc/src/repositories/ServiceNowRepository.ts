/**
 * ServiceNow Repository with optimized queries for status resolution
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { db, query, transaction, type QueryResult } from "../config/database";

export interface ServiceNowStatusQuery {
  tipo_chamado: string;
  numero: string;
  estado_numero: string;
  status_portugues: string;
  descricao: string;
  grupo_atribuicao: string;
  data_fechamento?: string;
  sys_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface StatusStatistics {
  tipo_chamado: string;
  estado_numero: string;
  status_portugues: string;
  total_chamados: number;
  percentual: number;
}

export interface ServiceNowMetrics {
  total_tickets: number;
  resolved_tickets: number;
  closed_tickets: number;
  cancelled_tickets: number;
  active_tickets: number;
  by_type: {
    incidents: number;
    change_tasks: number;
    service_catalog_tasks: number;
  };
  by_status: StatusStatistics[];
  response_time_avg: number;
}

export class ServiceNowRepository {
  /**
   * Get all resolved/closed/cancelled tickets with Portuguese status descriptions
   */
  async getResolvedTickets(
    limit = 1000,
    offset = 0,
  ): Promise<ServiceNowStatusQuery[]> {
    const sql = `
      SELECT 
          'incident' as tipo_chamado,
          data->'incident'->>'number' as numero,
          data->'incident'->>'state' as estado_numero,
          CASE 
              WHEN data->'incident'->>'state' = '6' THEN 'Resolvido'
              WHEN data->'incident'->>'state' = '7' THEN 'Fechado'
              WHEN data->'incident'->>'state' = '8' THEN 'Cancelado'
          END as status_portugues,
          data->'incident'->>'short_description' as descricao,
          data->'incident'->>'assignment_group' as grupo_atribuicao,
          data->'incident'->>'closed_at' as data_fechamento,
          data->'incident'->>'sys_id' as sys_id,
          created_at,
          updated_at
      FROM sn_incidents_collection 
      WHERE data->'incident'->>'state' IN ('6', '7', '8')

      UNION ALL

      SELECT 
          'change_task' as tipo_chamado,
          data->'ctask'->>'number' as numero,
          data->'ctask'->>'state' as estado_numero,
          CASE 
              WHEN data->'ctask'->>'state' = '4' THEN 'Fechado Completo'
              WHEN data->'ctask'->>'state' = '7' THEN 'Fechado Pulado'
              WHEN data->'ctask'->>'state' = '8' THEN 'Fechado Incompleto'
          END as status_portugues,
          data->'ctask'->>'short_description' as descricao,
          data->'ctask'->>'assignment_group' as grupo_atribuicao,
          data->'ctask'->>'closed_at' as data_fechamento,
          data->'ctask'->>'sys_id' as sys_id,
          created_at,
          updated_at
      FROM sn_ctasks_collection 
      WHERE data->'ctask'->>'state' IN ('4', '7', '8')

      UNION ALL

      SELECT 
          'sc_task' as tipo_chamado,
          data->'sctask'->>'number' as numero,
          data->'sctask'->>'state' as estado_numero,
          CASE 
              WHEN data->'sctask'->>'state' = '4' THEN 'Fechado Completo'
              WHEN data->'sctask'->>'state' = '7' THEN 'Fechado Pulado'
          END as status_portugues,
          data->'sctask'->>'short_description' as descricao,
          data->'sctask'->>'assignment_group' as grupo_atribuicao,
          data->'sctask'->>'closed_at' as data_fechamento,
          data->'sctask'->>'sys_id' as sys_id,
          created_at,
          updated_at
      FROM sn_sctasks_collection 
      WHERE data->'sctask'->>'state' IN ('4', '7')

      ORDER BY data_fechamento DESC NULLS LAST
      LIMIT $1 OFFSET $2
    `;

    const result = await query<ServiceNowStatusQuery>(sql, [limit, offset]);
    return result.rows;
  }

  /**
   * Get all active tickets (NOT resolved/closed/cancelled)
   */
  async getActiveTickets(
    limit = 1000,
    offset = 0,
  ): Promise<ServiceNowStatusQuery[]> {
    const sql = `
      SELECT 
          'incident' as tipo_chamado,
          data->'incident'->>'number' as numero,
          data->'incident'->>'state' as estado_numero,
          CASE 
              WHEN data->'incident'->>'state' = '1' THEN 'Novo'
              WHEN data->'incident'->>'state' = '2' THEN 'Em Andamento'
              WHEN data->'incident'->>'state' = '3' THEN 'Em Espera'
              WHEN data->'incident'->>'state' = '4' THEN 'Aguardando Aprovação'
              WHEN data->'incident'->>'state' = '5' THEN 'Aguardando Fornecedor'
              ELSE 'Outros'
          END as status_portugues,
          data->'incident'->>'short_description' as descricao,
          data->'incident'->>'assignment_group' as grupo_atribuicao,
          data->'incident'->>'closed_at' as data_fechamento,
          data->'incident'->>'sys_id' as sys_id,
          created_at,
          updated_at
      FROM sn_incidents_collection 
      WHERE data->'incident'->>'state' NOT IN ('6', '7', '8')

      UNION ALL

      SELECT 
          'change_task' as tipo_chamado,
          data->'ctask'->>'number' as numero,
          data->'ctask'->>'state' as estado_numero,
          CASE 
              WHEN data->'ctask'->>'state' = '1' THEN 'Pending'
              WHEN data->'ctask'->>'state' = '2' THEN 'Open'
              WHEN data->'ctask'->>'state' = '3' THEN 'Work in Progress'
              ELSE 'Outros'
          END as status_portugues,
          data->'ctask'->>'short_description' as descricao,
          data->'ctask'->>'assignment_group' as grupo_atribuicao,
          data->'ctask'->>'closed_at' as data_fechamento,
          data->'ctask'->>'sys_id' as sys_id,
          created_at,
          updated_at
      FROM sn_ctasks_collection 
      WHERE data->'ctask'->>'state' NOT IN ('4', '7', '8')

      UNION ALL

      SELECT 
          'sc_task' as tipo_chamado,
          data->'sctask'->>'number' as numero,
          data->'sctask'->>'state' as estado_numero,
          CASE 
              WHEN data->'sctask'->>'state' = '1' THEN 'Pending'
              WHEN data->'sctask'->>'state' = '2' THEN 'Open'
              WHEN data->'sctask'->>'state' = '3' THEN 'Work in Progress'
              ELSE 'Outros'
          END as status_portugues,
          data->'sctask'->>'short_description' as descricao,
          data->'sctask'->>'assignment_group' as grupo_atribuicao,
          data->'sctask'->>'closed_at' as data_fechamento,
          data->'sctask'->>'sys_id' as sys_id,
          created_at,
          updated_at
      FROM sn_sctasks_collection 
      WHERE data->'sctask'->>'state' NOT IN ('4', '7')

      ORDER BY updated_at DESC NULLS LAST
      LIMIT $1 OFFSET $2
    `;

    const result = await query<ServiceNowStatusQuery>(sql, [limit, offset]);
    return result.rows;
  }

  /**
   * Get status statistics for all ticket types
   */
  async getStatusStatistics(): Promise<StatusStatistics[]> {
    const sql = `
      SELECT 
          tipo_chamado,
          estado_numero,
          status_portugues,
          COUNT(*) as total_chamados,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY tipo_chamado), 2) as percentual
      FROM (
          SELECT 'incident' as tipo_chamado, 
                 data->'incident'->>'state' as estado_numero,
                 CASE 
                     WHEN data->'incident'->>'state' = '1' THEN 'Novo'
                     WHEN data->'incident'->>'state' = '2' THEN 'Em Andamento'
                     WHEN data->'incident'->>'state' = '3' THEN 'Em Espera'
                     WHEN data->'incident'->>'state' = '4' THEN 'Aguardando Aprovação'
                     WHEN data->'incident'->>'state' = '5' THEN 'Aguardando Fornecedor'
                     WHEN data->'incident'->>'state' = '6' THEN 'Resolvido'
                     WHEN data->'incident'->>'state' = '7' THEN 'Fechado'
                     WHEN data->'incident'->>'state' = '8' THEN 'Cancelado'
                     ELSE 'Outros'
                 END as status_portugues
          FROM sn_incidents_collection
          
          UNION ALL
          
          SELECT 'change_task' as tipo_chamado,
                 data->'ctask'->>'state' as estado_numero,
                 CASE 
                     WHEN data->'ctask'->>'state' = '1' THEN 'Pending'
                     WHEN data->'ctask'->>'state' = '2' THEN 'Open'
                     WHEN data->'ctask'->>'state' = '3' THEN 'Work in Progress'
                     WHEN data->'ctask'->>'state' = '4' THEN 'Fechado Completo'
                     WHEN data->'ctask'->>'state' = '7' THEN 'Fechado Pulado'
                     WHEN data->'ctask'->>'state' = '8' THEN 'Fechado Incompleto'
                     ELSE 'Outros'
                 END as status_portugues
          FROM sn_ctasks_collection
          
          UNION ALL
          
          SELECT 'sc_task' as tipo_chamado,
                 data->'sctask'->>'state' as estado_numero,
                 CASE 
                     WHEN data->'sctask'->>'state' = '1' THEN 'Pending'
                     WHEN data->'sctask'->>'state' = '2' THEN 'Open'
                     WHEN data->'sctask'->>'state' = '3' THEN 'Work in Progress'
                     WHEN data->'sctask'->>'state' = '4' THEN 'Fechado Completo'
                     WHEN data->'sctask'->>'state' = '7' THEN 'Fechado Pulado'
                     ELSE 'Outros'
                 END as status_portugues
          FROM sn_sctasks_collection
      ) chamados
      GROUP BY tipo_chamado, estado_numero, status_portugues
      ORDER BY tipo_chamado, total_chamados DESC
    `;

    const result = await query<StatusStatistics>(sql, []);
    return result.rows;
  }

  /**
   * Get comprehensive metrics for ServiceNow tickets
   */
  async getServiceNowMetrics(): Promise<ServiceNowMetrics> {
    const metricsQueries = await Promise.all([
      // Total tickets count
      query(`
        SELECT 
          (SELECT COUNT(*) FROM sn_incidents_collection) +
          (SELECT COUNT(*) FROM sn_ctasks_collection) +
          (SELECT COUNT(*) FROM sn_sctasks_collection) as total
      `),

      // Resolved tickets count
      query(`
        SELECT 
          (SELECT COUNT(*) FROM sn_incidents_collection WHERE data->'incident'->>'state' IN ('6', '7', '8')) +
          (SELECT COUNT(*) FROM sn_ctasks_collection WHERE data->'ctask'->>'state' IN ('4', '7', '8')) +
          (SELECT COUNT(*) FROM sn_sctasks_collection WHERE data->'sctask'->>'state' IN ('4', '7')) as resolved
      `),

      // Tickets by type
      query(`
        SELECT 
          (SELECT COUNT(*) FROM sn_incidents_collection) as incidents,
          (SELECT COUNT(*) FROM sn_ctasks_collection) as change_tasks,
          (SELECT COUNT(*) FROM sn_sctasks_collection) as service_catalog_tasks
      `),

      // Average response time (using update timestamps)
      query(`
        SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) as avg_hours
        FROM (
          SELECT created_at, updated_at FROM sn_incidents_collection
          UNION ALL
          SELECT created_at, updated_at FROM sn_ctasks_collection
          UNION ALL
          SELECT created_at, updated_at FROM sn_sctasks_collection
        ) all_tickets
        WHERE updated_at IS NOT NULL AND created_at IS NOT NULL
      `),
    ]);

    const totalTickets = metricsQueries[0].rows[0]?.total || 0;
    const resolvedTickets = metricsQueries[1].rows[0]?.resolved || 0;
    const byType = metricsQueries[2].rows[0];
    const avgResponseTime = metricsQueries[3].rows[0]?.avg_hours || 0;

    // Get detailed status statistics
    const statusStats = await this.getStatusStatistics();

    return {
      total_tickets: totalTickets,
      resolved_tickets: resolvedTickets,
      closed_tickets: resolvedTickets, // Same as resolved in this context
      cancelled_tickets: statusStats
        .filter((s) => s.status_portugues === "Cancelado")
        .reduce((sum, s) => sum + s.total_chamados, 0),
      active_tickets: totalTickets - resolvedTickets,
      by_type: {
        incidents: byType?.incidents || 0,
        change_tasks: byType?.change_tasks || 0,
        service_catalog_tasks: byType?.service_catalog_tasks || 0,
      },
      by_status: statusStats,
      response_time_avg: Math.round(avgResponseTime * 10) / 10, // Round to 1 decimal
    };
  }

  /**
   * Search tickets by multiple criteria with full-text search
   */
  async searchTickets(
    searchTerm?: string,
    ticketType?: string,
    status?: string,
    assignmentGroup?: string,
    dateFrom?: string,
    dateTo?: string,
    limit = 100,
    offset = 0,
  ): Promise<ServiceNowStatusQuery[]> {
    let whereConditions: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    // Build dynamic WHERE conditions
    if (searchTerm) {
      whereConditions.push(`(
        data->>'short_description' ILIKE $${paramIndex} OR
        data->>'number' ILIKE $${paramIndex} OR
        data->>'description' ILIKE $${paramIndex}
      )`);
      params.push(`%${searchTerm}%`);
      paramIndex++;
    }

    if (assignmentGroup) {
      whereConditions.push(`data->>'assignment_group' ILIKE $${paramIndex}`);
      params.push(`%${assignmentGroup}%`);
      paramIndex++;
    }

    if (dateFrom) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      params.push(dateTo);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0 ? `AND ${whereConditions.join(" AND ")}` : "";

    let unionQueries: string[] = [];

    // Include incidents if no specific type or if type is incident
    if (!ticketType || ticketType === "incident") {
      let incidentStatusFilter = "";
      if (status) {
        incidentStatusFilter = `AND data->'incident'->>'state' = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      unionQueries.push(`
        SELECT 
            'incident' as tipo_chamado,
            data->'incident'->>'number' as numero,
            data->'incident'->>'state' as estado_numero,
            CASE 
                WHEN data->'incident'->>'state' = '1' THEN 'Novo'
                WHEN data->'incident'->>'state' = '2' THEN 'Em Andamento'
                WHEN data->'incident'->>'state' = '3' THEN 'Em Espera'
                WHEN data->'incident'->>'state' = '4' THEN 'Aguardando Aprovação'
                WHEN data->'incident'->>'state' = '5' THEN 'Aguardando Fornecedor'
                WHEN data->'incident'->>'state' = '6' THEN 'Resolvido'
                WHEN data->'incident'->>'state' = '7' THEN 'Fechado'
                WHEN data->'incident'->>'state' = '8' THEN 'Cancelado'
                ELSE 'Outros'
            END as status_portugues,
            data->'incident'->>'short_description' as descricao,
            data->'incident'->>'assignment_group' as grupo_atribuicao,
            data->'incident'->>'closed_at' as data_fechamento,
            data->'incident'->>'sys_id' as sys_id,
            created_at,
            updated_at
        FROM sn_incidents_collection 
        WHERE 1=1 ${whereClause} ${incidentStatusFilter}
      `);
    }

    // Include change tasks if no specific type or if type is change_task
    if (!ticketType || ticketType === "change_task") {
      let ctaskStatusFilter = "";
      if (status && ticketType === "change_task") {
        ctaskStatusFilter = `AND data->'ctask'->>'state' = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      unionQueries.push(`
        SELECT 
            'change_task' as tipo_chamado,
            data->'ctask'->>'number' as numero,
            data->'ctask'->>'state' as estado_numero,
            CASE 
                WHEN data->'ctask'->>'state' = '1' THEN 'Pending'
                WHEN data->'ctask'->>'state' = '2' THEN 'Open'
                WHEN data->'ctask'->>'state' = '3' THEN 'Work in Progress'
                WHEN data->'ctask'->>'state' = '4' THEN 'Fechado Completo'
                WHEN data->'ctask'->>'state' = '7' THEN 'Fechado Pulado'
                WHEN data->'ctask'->>'state' = '8' THEN 'Fechado Incompleto'
                ELSE 'Outros'
            END as status_portugues,
            data->'ctask'->>'short_description' as descricao,
            data->'ctask'->>'assignment_group' as grupo_atribuicao,
            data->'ctask'->>'closed_at' as data_fechamento,
            data->'ctask'->>'sys_id' as sys_id,
            created_at,
            updated_at
        FROM sn_ctasks_collection 
        WHERE 1=1 ${whereClause} ${ctaskStatusFilter}
      `);
    }

    // Include service catalog tasks if no specific type or if type is sc_task
    if (!ticketType || ticketType === "sc_task") {
      let sctaskStatusFilter = "";
      if (status && ticketType === "sc_task") {
        sctaskStatusFilter = `AND data->'sctask'->>'state' = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      unionQueries.push(`
        SELECT 
            'sc_task' as tipo_chamado,
            data->'sctask'->>'number' as numero,
            data->'sctask'->>'state' as estado_numero,
            CASE 
                WHEN data->'sctask'->>'state' = '1' THEN 'Pending'
                WHEN data->'sctask'->>'state' = '2' THEN 'Open'
                WHEN data->'sctask'->>'state' = '3' THEN 'Work in Progress'
                WHEN data->'sctask'->>'state' = '4' THEN 'Fechado Completo'
                WHEN data->'sctask'->>'state' = '7' THEN 'Fechado Pulado'
                ELSE 'Outros'
            END as status_portugues,
            data->'sctask'->>'short_description' as descricao,
            data->'sctask'->>'assignment_group' as grupo_atribuicao,
            data->'sctask'->>'closed_at' as data_fechamento,
            data->'sctask'->>'sys_id' as sys_id,
            created_at,
            updated_at
        FROM sn_sctasks_collection 
        WHERE 1=1 ${whereClause} ${sctaskStatusFilter}
      `);
    }

    params.push(limit, offset);
    const sql = `
      ${unionQueries.join(" UNION ALL ")}
      ORDER BY updated_at DESC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await query<ServiceNowStatusQuery>(sql, params);
    return result.rows;
  }

  /**
   * Get ticket details by sys_id and type
   */
  async getTicketDetails(sysId: string, ticketType: string): Promise<any> {
    let sql = "";
    let tableName = "";

    switch (ticketType) {
      case "incident":
        tableName = "sn_incidents_collection";
        sql = `SELECT data->'incident' as ticket_data, created_at, updated_at FROM ${tableName} WHERE data->'incident'->>'sys_id' = $1`;
        break;
      case "change_task":
        tableName = "sn_ctasks_collection";
        sql = `SELECT data->'ctask' as ticket_data, created_at, updated_at FROM ${tableName} WHERE data->'ctask'->>'sys_id' = $1`;
        break;
      case "sc_task":
        tableName = "sn_sctasks_collection";
        sql = `SELECT data->'sctask' as ticket_data, created_at, updated_at FROM ${tableName} WHERE data->'sctask'->>'sys_id' = $1`;
        break;
      default:
        throw new Error(`Unknown ticket type: ${ticketType}`);
    }

    const result = await query(sql, [sysId]);
    return result.rows[0] || null;
  }

  /**
   * Get database health and performance statistics
   */
  async getHealthStats(): Promise<any> {
    const healthQueries = await Promise.all([
      query(`SELECT COUNT(*) as total FROM sn_incidents_collection`),
      query(`SELECT COUNT(*) as total FROM sn_ctasks_collection`),
      query(`SELECT COUNT(*) as total FROM sn_sctasks_collection`),
      query(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples,
          last_vacuum,
          last_analyze
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'sn_%_collection'
      `),
    ]);

    return {
      table_counts: {
        incidents: healthQueries[0].rows[0]?.total || 0,
        change_tasks: healthQueries[1].rows[0]?.total || 0,
        service_catalog_tasks: healthQueries[2].rows[0]?.total || 0,
      },
      table_stats: healthQueries[3].rows,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const serviceNowRepository = new ServiceNowRepository();
