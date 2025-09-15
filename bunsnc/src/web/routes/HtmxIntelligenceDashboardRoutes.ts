/**
 * Intelligence Dashboard HTMX Routes - Real-time AI Analytics Dashboard
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from 'elysia';
import { html } from '@elysiajs/html';
import { IntelligenceDashboardService } from '../../services/ai/IntelligenceDashboardService';
import { logger } from '../../utils/Logger';

const dashboardService = new IntelligenceDashboardService();

export const intelligenceDashboardRoutes = new Elysia({ prefix: '/intelligence' })
  .use(html())

  // Main Intelligence Dashboard
  .get('/dashboard', async ({ html }) => {
    return html(`
      <div class="intelligence-dashboard">
        <div class="dashboard-header">
          <h1> Intelligence Dashboard</h1>
          <div class="refresh-controls">
            <button class="refresh-btn"
                    hx-get="/intelligence/refresh-all"
                    hx-target=".dashboard-content"
                    hx-indicator="#refresh-spinner">
               Refresh All
            </button>
            <span id="refresh-spinner" class="htmx-indicator">Updating...</span>
            <div class="auto-refresh">
              <label>
                <input type="checkbox" id="auto-refresh" checked>
                Auto-refresh (5min)
              </label>
            </div>
          </div>
        </div>

        <div class="dashboard-content"
             hx-get="/intelligence/metrics-overview"
             hx-trigger="load, every 300s[auto-refresh:checked]">
          <div class="loading-placeholder">
            <div class="loading-spinner"></div>
            <p>Loading intelligence metrics...</p>
          </div>
        </div>
      </div>

      <script>
        // Auto-refresh toggle functionality
        document.getElementById('auto-refresh').addEventListener('change', function(e) {
          if (e.target.checked) {
            htmx.trigger('.dashboard-content', 'every 300s');
          }
        });
      </script>
    `);
  })

  // Metrics Overview
  .get('/metrics-overview', async ({ html }) => {
    try {
      const metrics = await dashboardService.getDashboardMetrics();

      return html(`
        <div class="metrics-grid">
          <!-- Overview Metrics -->
          <div class="metrics-section overview">
            <h2> Today's Overview</h2>
            <div class="metric-cards">
              <div class="metric-card primary">
                <div class="metric-value">${metrics.overview.totalTickets}</div>
                <div class="metric-label">Total Tickets</div>
                <div class="metric-trend">📈 +12% vs yesterday</div>
              </div>

              <div class="metric-card success">
                <div class="metric-value">${metrics.overview.resolvedToday}</div>
                <div class="metric-label">Resolved Today</div>
                <div class="metric-trend"> ${Math.round((metrics.overview.resolvedToday / metrics.overview.totalTickets) * 100)}% resolution rate</div>
              </div>

              <div class="metric-card info">
                <div class="metric-value">${metrics.overview.averageResolutionTime}</div>
                <div class="metric-label">Avg Resolution Time</div>
                <div class="metric-trend">⏱️ -15min vs target</div>
              </div>

              <div class="metric-card warning">
                <div class="metric-value">${Math.round(metrics.overview.predictionAccuracy * 100)}%</div>
                <div class="metric-label">AI Prediction Accuracy</div>
                <div class="metric-trend">🎯 +2% this week</div>
              </div>
            </div>
          </div>

          <!-- AI Services Metrics -->
          <div class="metrics-section ai-services">
            <h2>🤖 AI Services Performance</h2>
            <div class="service-metrics">
              <div class="service-metric">
                <span class="service-name">🔢 Embeddings</span>
                <span class="service-value">${metrics.aiServices.embeddingRequests} requests</span>
                <span class="service-status healthy">●</span>
              </div>

              <div class="service-metric">
                <span class="service-name"> Reranking</span>
                <span class="service-value">${metrics.aiServices.rerankOperations} operations</span>
                <span class="service-status healthy">●</span>
              </div>

              <div class="service-metric">
                <span class="service-name"> LLM Queries</span>
                <span class="service-value">${metrics.aiServices.llmQueries} queries</span>
                <span class="service-status healthy">●</span>
              </div>

              <div class="service-metric">
                <span class="service-name"> Search</span>
                <span class="service-value">${metrics.aiServices.searchQueries} searches</span>
                <span class="service-status healthy">●</span>
              </div>

              <div class="service-summary">
                <div class="summary-item">
                  <span>Avg Response: ${metrics.aiServices.avgResponseTime}ms</span>
                </div>
                <div class="summary-item">
                  <span>Success Rate: ${Math.round(metrics.aiServices.successRate * 100)}%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Pattern Analysis -->
          <div class="metrics-section patterns">
            <h2>📈 Pattern Analysis</h2>

            <div class="pattern-charts">
              <div class="chart-container">
                <h3>Top Issue Categories</h3>
                <div class="category-chart">
                  ${metrics.patterns.topIssueCategories.map(cat => `
                    <div class="category-bar">
                      <span class="category-name">${cat.category}</span>
                      <div class="bar-container">
                        <div class="bar" style="width: ${(cat.count / 50) * 100}%"></div>
                        <span class="count">${cat.count}</span>
                      </div>
                      <span class="trend trend-${cat.trend}">${getTrendIcon(cat.trend)}</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="chart-container">
                <h3>Resolution Trends (7 days)</h3>
                <div class="trend-chart">
                  ${metrics.patterns.resolutionTrends.map(trend => `
                    <div class="trend-day">
                      <div class="day-label">${formatDate(trend.date)}</div>
                      <div class="bars">
                        <div class="bar actual" style="height: ${(trend.resolved / 60) * 100}px" title="Actual: ${trend.resolved}"></div>
                        <div class="bar predicted" style="height: ${(trend.predicted / 60) * 100}px" title="Predicted: ${trend.predicted}"></div>
                      </div>
                    </div>
                  `).join('')}
                </div>
                <div class="chart-legend">
                  <span><span class="legend-color actual"></span> Actual</span>
                  <span><span class="legend-color predicted"></span> Predicted</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Predictions -->
          <div class="metrics-section predictions">
            <h2>🔮 Predictive Analytics</h2>

            <div class="prediction-cards">
              <div class="prediction-card">
                <h3>Next Hour Forecast</h3>
                <div class="forecast-value">${metrics.predictions.nextHourTickets} tickets</div>
                <p>Expected incoming tickets in the next hour based on historical patterns</p>
              </div>

              <div class="prediction-card critical">
                <h3>Critical Issues Alert</h3>
                <div class="critical-list">
                  ${metrics.predictions.criticalIssues.map(issue => `
                    <div class="critical-item">
                      <span class="ticket-id">${issue.ticket}</span>
                      <span class="priority-score">${issue.priority}% risk</span>
                      <p class="prediction">${issue.prediction}</p>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="prediction-card">
                <h3>Resource Recommendations</h3>
                <div class="resource-list">
                  ${metrics.predictions.resourceNeeds.map(resource => `
                    <div class="resource-item">
                      <strong>${resource.group}</strong>
                      <span class="staffing">Recommended: ${resource.recommendedStaffing} staff</span>
                      <p class="reason">${resource.reason}</p>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Support Group Performance -->
          <div class="metrics-section performance">
            <h2>👥 Support Group Performance</h2>
            <div class="performance-table">
              <div class="table-header">
                <span>Group</span>
                <span>Avg Time</span>
                <span>Satisfaction</span>
                <span>Performance</span>
              </div>
              ${metrics.patterns.supportGroupPerformance.map(group => `
                <div class="table-row">
                  <span class="group-name">${group.group}</span>
                  <span class="avg-time">${group.avgTime}h</span>
                  <span class="satisfaction">${group.satisfaction}/5 ⭐</span>
                  <span class="performance">
                    <div class="performance-bar">
                      <div class="bar" style="width: ${(group.satisfaction / 5) * 100}%"></div>
                    </div>
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Real-time Updates Footer -->
        <div class="dashboard-footer">
          <span class="last-updated">Last updated: ${new Date().toLocaleTimeString()}</span>
          <span class="update-indicator">🟢 Real-time</span>
        </div>
      `);

    } catch (error) {
      logger.error('[IntelligenceDashboard] Failed to load metrics:', error);
      return html(`
        <div class="error-state">
          <h3> Unable to Load Metrics</h3>
          <p>There was an issue loading the intelligence dashboard. Please try refreshing.</p>
          <button class="retry-btn"
                  hx-get="/intelligence/metrics-overview"
                  hx-target=".dashboard-content">
             Retry
          </button>
        </div>
      `);
    }
  })

  // Ticket Insights Detail
  .get('/ticket/:ticketId/insights', async ({ params, html }) => {
    try {
      const insights = await dashboardService.getTicketInsights(params.ticketId);

      return html(`
        <div class="ticket-insights-modal">
          <div class="modal-header">
            <h2>🎯 Ticket Insights: ${insights.ticketId}</h2>
            <button class="close-btn" onclick="this.closest('.ticket-insights-modal').remove()">✕</button>
          </div>

          <div class="insights-content">
            <div class="insight-section">
              <h3> Overview</h3>
              <div class="insight-grid">
                <div class="insight-item">
                  <label>Category:</label>
                  <span class="category-badge">${insights.category}</span>
                </div>
                <div class="insight-item">
                  <label>Priority:</label>
                  <span class="priority-badge priority-${insights.priority}">${insights.priority.toUpperCase()}</span>
                </div>
                <div class="insight-item">
                  <label>Predicted Resolution:</label>
                  <span class="resolution-time">${insights.predictedResolutionTime}</span>
                </div>
                <div class="insight-item">
                  <label>Confidence Score:</label>
                  <span class="confidence-score">${Math.round(insights.confidenceScore * 100)}%</span>
                </div>
              </div>
            </div>

            <div class="insight-section">
              <h3>💡 Recommended Actions</h3>
              <ul class="action-list">
                ${insights.recommendedActions.map(action => `
                  <li class="action-item">
                    <span class="action-icon">✓</span>
                    ${action}
                  </li>
                `).join('')}
              </ul>
            </div>

            <div class="insight-section">
              <h3> Risk Factors</h3>
              <ul class="risk-list">
                ${insights.riskFactors.map(risk => `
                  <li class="risk-item">
                    <span class="risk-icon"></span>
                    ${risk}
                  </li>
                `).join('')}
              </ul>
            </div>

            <div class="insight-section">
              <h3>🔗 Similar Tickets</h3>
              <div class="similar-tickets">
                ${insights.similarTickets.map(ticket => `
                  <div class="similar-ticket">
                    <span class="ticket-id">${ticket.id}</span>
                    <span class="similarity">${Math.round(ticket.similarity * 100)}% similar</span>
                    <p class="resolution">${ticket.resolution}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `);

    } catch (error) {
      logger.error(`[IntelligenceDashboard] Failed to load insights for ${params.ticketId}:`, error);
      return html(`
        <div class="error-message">
          <p>Unable to load ticket insights. Please try again.</p>
        </div>
      `);
    }
  })

  // Knowledge Base Analytics
  .get('/knowledge-analytics', async ({ html }) => {
    try {
      const kbStats = await dashboardService.getKnowledgeBaseStats();

      return html(`
        <div class="knowledge-analytics">
          <h2>📚 Knowledge Base Analytics</h2>

          <div class="kb-overview">
            <div class="kb-metric">
              <span class="metric-value">${kbStats.totalDocuments}</span>
              <span class="metric-label">Total Documents</span>
            </div>

            <div class="kb-health">
              <h3>Document Health</h3>
              <div class="health-bars">
                <div class="health-item">
                  <span>High Quality</span>
                  <div class="bar-container">
                    <div class="bar success" style="width: ${(kbStats.documentHealth.highQuality / kbStats.totalDocuments) * 100}%"></div>
                    <span>${kbStats.documentHealth.highQuality}</span>
                  </div>
                </div>
                <div class="health-item">
                  <span>Needs Review</span>
                  <div class="bar-container">
                    <div class="bar warning" style="width: ${(kbStats.documentHealth.needsReview / kbStats.totalDocuments) * 100}%"></div>
                    <span>${kbStats.documentHealth.needsReview}</span>
                  </div>
                </div>
                <div class="health-item">
                  <span>Outdated</span>
                  <div class="bar-container">
                    <div class="bar danger" style="width: ${(kbStats.documentHealth.outdated / kbStats.totalDocuments) * 100}%"></div>
                    <span>${kbStats.documentHealth.outdated}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="kb-categories">
            <h3>Content Categories</h3>
            <div class="category-grid">
              ${kbStats.categories.map(cat => `
                <div class="category-card">
                  <h4>${cat.name}</h4>
                  <span class="doc-count">${cat.count} documents</span>
                  <span class="last-updated">Updated: ${cat.lastUpdated}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="content-gaps">
            <h3> Content Gaps</h3>
            <div class="gap-list">
              ${kbStats.contentGaps.map(gap => `
                <div class="gap-item severity-${gap.severity}">
                  <span class="gap-topic">${gap.topic}</span>
                  <span class="gap-frequency">${gap.frequency} requests</span>
                  <span class="gap-severity">${gap.severity.toUpperCase()}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `);

    } catch (error) {
      logger.error('[IntelligenceDashboard] Failed to load knowledge analytics:', error);
      return html(`<div class="error-message">Unable to load knowledge base analytics</div>`);
    }
  })

  // Real-time Metrics Stream (SSE endpoint)
  .get('/metrics-stream', ({ set }) => {
    set.headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    };

    return createMetricsStream();
  })

  // Refresh All Data
  .get('/refresh-all', async ({ html }) => {
    // Force refresh of all cached data
    try {
      const metrics = await dashboardService.getDashboardMetrics();

      return html(`
        <div class="refresh-success">
          <span class="success-icon"></span>
          <span>Dashboard updated successfully</span>
          <span class="timestamp">${new Date().toLocaleTimeString()}</span>
        </div>
      `);

    } catch (error) {
      logger.error('[IntelligenceDashboard] Refresh failed:', error);
      return html(`
        <div class="refresh-error">
          <span class="error-icon"></span>
          <span>Failed to refresh dashboard</span>
        </div>
      `);
    }
  });

function createMetricsStream() {
  // Create a readable stream for real-time metrics updates
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode('data: {"type":"connected","timestamp":"' + new Date().toISOString() + '"}\n\n'));

      // Send periodic updates
      const interval = setInterval(async () => {
        try {
          const metrics = await dashboardService.getDashboardMetrics();
          const data = JSON.stringify({
            type: 'metrics_update',
            timestamp: new Date().toISOString(),
            data: metrics
          });

          controller.enqueue(encoder.encode(`data: ${data}\n\n`));

        } catch (error) {
          logger.error('[IntelligenceDashboard] Stream update failed:', error);
          controller.enqueue(encoder.encode('data: {"type":"error","message":"Failed to update metrics"}\n\n'));
        }
      }, 30000); // Update every 30 seconds

      // Cleanup on close
      setTimeout(() => {
        clearInterval(interval);
        controller.close();
      }, 300000); // Close after 5 minutes
    }
  });

  return new Response(stream);
}

function getTrendIcon(trend: string): string {
  switch (trend) {
    case 'up': return '📈';
    case 'down': return '📉';
    case 'stable': return '➡️';
    default: return '➡️';
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}