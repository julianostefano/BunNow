/**
 * CLI Command for Waiting Tickets Analysis - Real ServiceNow API Integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { serviceNowAuthClient } from "../services/ServiceNowAuthClient";

const FALLBACK_GROUPS = [
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
  "L2-NE-IT PCP PRODUCTION",
];

interface WaitingTicketSummary {
  grupo: string;
  incidents_waiting: number;
  ctasks_waiting: number;
  sctasks_waiting: number;
  total_waiting: number;
}

/**
 * Query waiting tickets (state = 3) for all fallback groups using real ServiceNow API
 */
async function getWaitingTicketsByGroups(): Promise<WaitingTicketSummary[]> {
  console.log(" Consultando chamados em espera no ServiceNow...\n");

  // Use real ServiceNow API to get summary
  const results =
    await serviceNowAuthClient.getWaitingTicketsSummary(FALLBACK_GROUPS);

  // Display progress for each group
  results.forEach((item, index) => {
    console.log(`${index + 1}. ${item.grupo}`);
    if (item.total_waiting > 0) {
      console.log(`   ⏳ Incidents: ${item.incidents_waiting}`);
      console.log(`   ⏳ Change Tasks: ${item.ctasks_waiting}`);
      console.log(`   ⏳ SC Tasks: ${item.sctasks_waiting}`);
      console.log(`    Total: ${item.total_waiting}`);
    } else {
      console.log(`    Nenhum chamado em espera`);
    }
    console.log("");
  });

  return results;
}

/**
 * Get detailed waiting tickets using real ServiceNow API
 */
async function getWaitingTicketsDetails(targetGroup?: string): Promise<any[]> {
  const groupsToQuery = targetGroup ? [targetGroup] : FALLBACK_GROUPS;

  console.log(
    ` Detalhes dos chamados em espera${targetGroup ? ` para: ${targetGroup}` : " (todos os grupos)"}\n`,
  );

  try {
    // Use real ServiceNow API to get detailed tickets
    const details =
      await serviceNowAuthClient.getWaitingTicketsDetails(groupsToQuery);
    return details;
  } catch (error: unknown) {
    console.error(" Erro ao buscar detalhes dos chamados:", error);
    return [];
  }
}

/**
 * CLI Command handler
 */
export async function waitingTicketsCommand(options: {
  group?: string;
  details?: boolean;
}) {
  try {
    console.log(" BunSNC - Análise de Chamados em Espera");
    console.log("=".repeat(50));
    console.log("");

    console.log(" Iniciando autenticação ServiceNow...");
    console.log("📦 Redis cache habilitado para performance otimizada");

    if (options.details) {
      // Show detailed tickets
      const details = await getWaitingTicketsDetails(options.group);

      if (details.length === 0) {
        console.log(" Nenhum chamado em espera encontrado!");
        return;
      }

      console.log(`📋 Encontrados ${details.length} chamados em espera:\n`);

      details.forEach((ticket, index) => {
        console.log(
          `${index + 1}. ${ticket.numero} [${ticket.tipo_chamado.toUpperCase()}]`,
        );
        console.log(`    ${ticket.descricao || "Sem descrição"}`);
        console.log(
          `   👥 Grupo: ${ticket.grupo_atribuicao || "Não atribuído"}`,
        );
        console.log(`    Prioridade: ${ticket.prioridade || "N/A"}`);
        console.log(
          `   📅 Criado: ${new Date(ticket.data_criacao).toLocaleDateString("pt-BR")}`,
        );
        console.log("");
      });
    } else {
      // Show summary by groups
      const summary = await getWaitingTicketsByGroups();

      // Sort by total waiting (descending)
      summary.sort((a, b) => b.total_waiting - a.total_waiting);

      console.log(" RESUMO POR GRUPO DE ATRIBUIÇÃO");
      console.log("=".repeat(50));
      console.log("");

      let totalIncidents = 0;
      let totalCtasks = 0;
      let totalSctasks = 0;
      let totalWaiting = 0;

      summary.forEach((item, index) => {
        if (item.total_waiting > 0) {
          console.log(`${index + 1}. ${item.grupo}`);
          console.log(`   🎫 Incidents: ${item.incidents_waiting}`);
          console.log(`    Change Tasks: ${item.ctasks_waiting}`);
          console.log(`   📋 SC Tasks: ${item.sctasks_waiting}`);
          console.log(`    Total: ${item.total_waiting}`);
          console.log("");
        }

        totalIncidents += item.incidents_waiting;
        totalCtasks += item.ctasks_waiting;
        totalSctasks += item.sctasks_waiting;
        totalWaiting += item.total_waiting;
      });

      console.log("=".repeat(50));
      console.log("📈 TOTAIS GERAIS:");
      console.log(`   🎫 Total Incidents em Espera: ${totalIncidents}`);
      console.log(`    Total Change Tasks em Espera: ${totalCtasks}`);
      console.log(`   📋 Total SC Tasks em Espera: ${totalSctasks}`);
      console.log(`    TOTAL GERAL: ${totalWaiting}`);
      console.log("");

      if (totalWaiting === 0) {
        console.log(
          "🎉 Excelente! Nenhum chamado em espera nos grupos de fallback!",
        );
      } else {
        console.log("💡 Dica: Use --details para ver os chamados específicos");
        console.log(
          '💡 Exemplo: bun src/cli/waiting-tickets.ts --details --group "L2-NE-IT NETWORK"',
        );
      }

      // Show cache metrics
      console.log("");
      console.log(" MÉTRICAS DO CACHE:");
      const cacheMetrics = serviceNowAuthClient.getCacheMetrics();
      console.log(
        `   🎯 Hit Rate: ${(cacheMetrics.hitRate * 100).toFixed(1)}%`,
      );
      console.log(`   📈 Cache Hits: ${cacheMetrics.hits}`);
      console.log(`   📉 Cache Misses: ${cacheMetrics.misses}`);
      console.log(`   🗃️  Total Keys: ${cacheMetrics.totalKeys}`);
    }
  } catch (error: unknown) {
    console.error(" Erro na consulta:", error);
    process.exit(1);
  } finally {
    console.log(" Consulta finalizada.");
  }
}

// CLI execution
if (import.meta.main) {
  const args = process.argv.slice(2);
  const options = {
    details: args.includes("--details"),
    group: args.includes("--group")
      ? args[args.indexOf("--group") + 1]
      : undefined,
  };

  await waitingTicketsCommand(options);
}
