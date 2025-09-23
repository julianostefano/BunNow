/**
 * Analytics API Routes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { ServiceNowClient } from "../../../client/ServiceNowClient";

const app = new Elysia({ prefix: "/api/v1/analytics" })
  .get("/dashboard", async () => {
    try {
      const client = new ServiceNowClient(
        process.env.SERVICENOW_INSTANCE_URL ||
          "https://dev12345.service-now.com",
        process.env.SERVICENOW_USERNAME || "admin",
        process.env.SERVICENOW_PASSWORD || "admin",
      );

      // Get overview statistics
      const stats = await getOverviewStats(client);

      // Generate chart data
      const chartData = await generateChartData(client);

      // Get processing metrics
      const processingMetrics = getProcessingMetrics();

      return `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <!-- Overview Stats -->
          <div class="lg:col-span-3">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div class="text-center p-6 bg-gradient-to-r from-red-50 to-red-100 rounded-lg">
                <h4 class="text-lg font-semibold text-red-700 mb-2">Active Incidents</h4>
                <div class="text-4xl font-bold text-red-600">${stats.incidents}</div>
                <p class="text-red-600 mt-2">
                  <span class="inline-flex items-center">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                    </svg>
                    ${stats.incidentTrend > 0 ? "+" : ""}${stats.incidentTrend}% from yesterday
                  </span>
                </p>
              </div>
              
              <div class="text-center p-6 bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg">
                <h4 class="text-lg font-semibold text-orange-700 mb-2">Open Problems</h4>
                <div class="text-4xl font-bold text-orange-600">${stats.problems}</div>
                <p class="text-orange-600 mt-2">
                  <span class="inline-flex items-center">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                    </svg>
                    ${stats.problemTrend > 0 ? "+" : ""}${stats.problemTrend}% from yesterday
                  </span>
                </p>
              </div>
              
              <div class="text-center p-6 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
                <h4 class="text-lg font-semibold text-blue-700 mb-2">Pending Changes</h4>
                <div class="text-4xl font-bold text-blue-600">${stats.changes}</div>
                <p class="text-blue-600 mt-2">
                  <span class="inline-flex items-center">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                    </svg>
                    ${stats.changeTrend > 0 ? "+" : ""}${stats.changeTrend}% from yesterday
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Charts Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <!-- Incident Trends Chart -->
          <div class="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div class="flex items-center justify-between mb-4">
              <h4 class="text-lg font-semibold text-gray-900">Incident Trends (7 days)</h4>
              <div class="flex items-center space-x-2">
                <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span class="text-sm text-gray-600">Real-time</span>
              </div>
            </div>
            <div class="h-64 flex items-center justify-center">
              <canvas id="incident-trend-chart" width="400" height="200"></canvas>
            </div>
          </div>

          <!-- Priority Distribution -->
          <div class="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div class="flex items-center justify-between mb-4">
              <h4 class="text-lg font-semibold text-gray-900">Priority Distribution</h4>
              <button class="text-sm text-blue-600 hover:text-blue-800" onclick="refreshChart('priority')">Refresh</button>
            </div>
            <div class="h-64 flex items-center justify-center">
              <canvas id="priority-chart" width="400" height="200"></canvas>
            </div>
          </div>
        </div>

        <!-- Processing Statistics -->
        <div class="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-8">
          <h4 class="text-lg font-semibold text-gray-900 mb-6">Data Processing Statistics</h4>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div class="text-center">
              <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
              </div>
              <div class="text-2xl font-bold text-gray-900">${processingMetrics.recordsProcessed}</div>
              <div class="text-sm text-gray-600">Records Processed Today</div>
              <div class="text-xs text-green-600 mt-1">↑ ${processingMetrics.processingRate}/min</div>
            </div>
            
            <div class="text-center">
              <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
              </div>
              <div class="text-2xl font-bold text-gray-900">${processingMetrics.parquetFiles}</div>
              <div class="text-sm text-gray-600">Parquet Files Generated</div>
              <div class="text-xs text-blue-600 mt-1">${processingMetrics.compressionRatio}% compression</div>
            </div>
            
            <div class="text-center">
              <div class="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg class="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path>
                </svg>
              </div>
              <div class="text-2xl font-bold text-gray-900">${processingMetrics.storageUsed}</div>
              <div class="text-sm text-gray-600">Storage Used (HDFS)</div>
              <div class="text-xs text-purple-600 mt-1">↑ ${processingMetrics.storageGrowth}/day</div>
            </div>
            
            <div class="text-center">
              <div class="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg class="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
              </div>
              <div class="text-2xl font-bold text-gray-900">${processingMetrics.indexedDocuments}</div>
              <div class="text-sm text-gray-600">OpenSearch Documents</div>
              <div class="text-xs text-orange-600 mt-1">${processingMetrics.searchLatency}ms avg query</div>
            </div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="bg-white rounded-lg shadow-md border border-gray-200">
          <div class="p-6 border-b border-gray-200">
            <div class="flex items-center justify-between">
              <h4 class="text-lg font-semibold text-gray-900">Recent Processing Activity</h4>
              <div class="flex items-center space-x-2">
                <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span class="text-sm text-gray-600">Live</span>
              </div>
            </div>
          </div>
          <div class="p-6">
            <div class="space-y-4">
              ${generateRecentActivity()}
            </div>
          </div>
        </div>

        <script>
          // Initialize charts when content is loaded
          document.addEventListener('DOMContentLoaded', function() {
            initializeCharts();
          });
          
          function initializeCharts() {
            // Incident Trend Chart
            const trendCtx = document.getElementById('incident-trend-chart');
            if (trendCtx) {
              new Chart(trendCtx, {
                type: 'line',
                data: {
                  labels: ${JSON.stringify(chartData.trendLabels)},
                  datasets: [{
                    label: 'Incidents',
                    data: ${JSON.stringify(chartData.trendData)},
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                  }]
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                      }
                    },
                    x: {
                      grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                      }
                    }
                  },
                  plugins: {
                    legend: {
                      display: false
                    }
                  }
                }
              });
            }
            
            // Priority Distribution Chart
            const priorityCtx = document.getElementById('priority-chart');
            if (priorityCtx) {
              new Chart(priorityCtx, {
                type: 'doughnut',
                data: {
                  labels: ['Critical', 'High', 'Medium', 'Low', 'Planning'],
                  datasets: [{
                    data: ${JSON.stringify(chartData.priorityData)},
                    backgroundColor: [
                      '#DC2626', // Critical - Red
                      '#EA580C', // High - Orange
                      '#D97706', // Medium - Amber
                      '#059669', // Low - Green
                      '#6B7280'  // Planning - Gray
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                  }]
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: {
                        padding: 20,
                        usePointStyle: true
                      }
                    }
                  }
                }
              });
            }
          }
          
          function refreshChart(chartType) {
            // Refresh specific chart data
            console.log('Refreshing chart:', chartType);
            // TODO: Implement chart refresh via HTMX
          }
        </script>
      `;
    } catch (error: unknown) {
      console.error("Error generating analytics dashboard:", error);
      return `
        <div class="text-center py-12">
          <div class="text-red-600 mb-4">
            <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 14.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Error Loading Analytics</h3>
          <p class="text-gray-600 mb-4">${error.message}</p>
          <button class="btn-primary" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  })

  .get("/performance", async () => {
    try {
      const metrics = await getPerformanceMetrics();

      return {
        success: true,
        data: {
          system: {
            cpu_usage: metrics.cpu,
            memory_usage: metrics.memory,
            disk_usage: metrics.disk,
            network_throughput: metrics.network,
          },
          processing: {
            records_per_second: metrics.recordsPerSecond,
            active_streams: metrics.activeStreams,
            queue_depth: metrics.queueDepth,
            error_rate: metrics.errorRate,
          },
          storage: {
            parquet_files: metrics.parquetFiles,
            total_size_gb: metrics.totalSize,
            compression_ratio: metrics.compressionRatio,
            hdfs_health: metrics.hdfsHealth,
          },
          search: {
            indexed_documents: metrics.indexedDocuments,
            search_latency_ms: metrics.searchLatency,
            index_size_gb: metrics.indexSize,
            query_rate: metrics.queryRate,
          },
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      console.error("Error fetching performance metrics:", error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  .get(
    "/trends/:type",
    async ({ params, query }) => {
      try {
        const type = params.type; // incidents, problems, changes
        const days = parseInt(query.days as string) || 30;

        const client = new ServiceNowClient(
          process.env.SERVICENOW_INSTANCE_URL ||
            "https://dev12345.service-now.com",
          process.env.SERVICENOW_USERNAME || "admin",
          process.env.SERVICENOW_PASSWORD || "admin",
        );

        const trendData = await generateTrendData(client, type, days);

        return {
          success: true,
          data: trendData,
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Error fetching trend data:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        days: t.Optional(t.String()),
      }),
    },
  );

// Helper functions
async function getOverviewStats(client: ServiceNowClient) {
  // Active incidents
  const incidentGr = client.getGlideRecord("incident");
  incidentGr.addQuery("state", "!=", "6");
  incidentGr.addQuery("state", "!=", "7");
  incidentGr.query();
  let incidents = 0;
  while (incidentGr.next()) incidents++;

  // Open problems
  const problemGr = client.getGlideRecord("problem");
  problemGr.addQuery("state", "!=", "6");
  problemGr.query();
  let problems = 0;
  while (problemGr.next()) problems++;

  // Pending changes
  const changeGr = client.getGlideRecord("change_request");
  changeGr.addQuery("state", "IN", "1,2,3");
  changeGr.query();
  let changes = 0;
  while (changeGr.next()) changes++;

  return {
    incidents,
    problems,
    changes,
    incidentTrend: -12, // Mock trend data
    problemTrend: 5,
    changeTrend: 0,
  };
}

async function generateChartData(client: ServiceNowClient) {
  // Generate mock chart data
  // In production, this would query actual ServiceNow data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  return {
    trendLabels: last7Days,
    trendData: [15, 12, 18, 8, 22, 14, 16], // Mock incident counts
    priorityData: [5, 12, 28, 15, 3], // Mock priority distribution
  };
}

function getProcessingMetrics() {
  // Mock processing metrics
  // In production, these would come from Redis, monitoring systems, etc.
  return {
    recordsProcessed: "24,586",
    processingRate: "1,250",
    parquetFiles: 42,
    compressionRatio: 73,
    storageUsed: "8.2 GB",
    storageGrowth: "1.2 GB",
    indexedDocuments: "156,890",
    searchLatency: 45,
  };
}

async function getPerformanceMetrics() {
  // Mock performance data
  // In production, these would come from system monitoring
  return {
    cpu: 23.5,
    memory: 68.2,
    disk: 45.8,
    network: 125.6,
    recordsPerSecond: 1250,
    activeStreams: 4,
    queueDepth: 156,
    errorRate: 0.02,
    parquetFiles: 42,
    totalSize: 8.2,
    compressionRatio: 73,
    hdfsHealth: "healthy",
    indexedDocuments: 156890,
    searchLatency: 45,
    indexSize: 2.1,
    queryRate: 12.5,
  };
}

async function generateTrendData(
  client: ServiceNowClient,
  type: string,
  days: number,
) {
  // Generate trend data for the specified type and time period
  const labels = Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  // Mock data - in production, this would query actual ServiceNow data
  const values = Array.from(
    { length: days },
    () => Math.floor(Math.random() * 20) + 5,
  );

  return {
    labels,
    values,
    type,
    period: `${days} days`,
  };
}

function generateRecentActivity() {
  const activities = [
    {
      type: "export",
      message: "Parquet export completed for incident table",
      time: "2 minutes ago",
      status: "success",
      icon: "M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
    {
      type: "pipeline",
      message: "Real-time processing pipeline started",
      time: "5 minutes ago",
      status: "info",
      icon: "M13 10V3L4 14h7v7l9-11h-7z",
    },
    {
      type: "index",
      message: "OpenSearch index optimization completed",
      time: "12 minutes ago",
      status: "success",
      icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    },
    {
      type: "sync",
      message: "HDFS synchronization in progress",
      time: "18 minutes ago",
      status: "warning",
      icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    },
    {
      type: "error",
      message: "Redis connection timeout resolved",
      time: "25 minutes ago",
      status: "success",
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
  ];

  const statusColors = {
    success: "bg-green-100 text-green-800",
    info: "bg-blue-100 text-blue-800",
    warning: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-800",
  };

  return activities
    .map(
      (activity) => `
    <div class="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
      <div class="flex-shrink-0">
        <div class="w-8 h-8 ${statusColors[activity.status]} rounded-full flex items-center justify-center">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${activity.icon}"></path>
          </svg>
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-900">${activity.message}</p>
        <p class="text-xs text-gray-500">${activity.time}</p>
      </div>
    </div>
  `,
    )
    .join("");
}

export default app;
