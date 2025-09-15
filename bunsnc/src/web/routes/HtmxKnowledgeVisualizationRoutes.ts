/**
 * Knowledge Base Visualization Routes - Interactive knowledge analytics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from 'elysia';
import { html } from '@elysiajs/html';
import { IntelligenceDashboardService } from '../../services/ai/IntelligenceDashboardService';
import { OpenSearchClient } from '../../clients/OpenSearchClient';
import { logger } from '../../utils/Logger';

interface DocumentNode {
  id: string;
  title: string;
  category: string;
  connections: number;
  quality: 'high' | 'medium' | 'low';
  lastAccessed: string;
  relevanceScore: number;
}

interface CategoryMetrics {
  name: string;
  documentCount: number;
  searchFrequency: number;
  averageQuality: number;
  trending: 'up' | 'down' | 'stable';
  gaps: string[];
}

interface UsagePattern {
  timeframe: string;
  searches: number;
  topQueries: Array<{ query: string; count: number; successRate: number }>;
  peakHours: number[];
  userTypes: Array<{ type: string; percentage: number }>;
}

const dashboardService = new IntelligenceDashboardService();
const openSearchClient = new OpenSearchClient({
  host: process.env.OPENSEARCH_HOST || '10.219.8.210',
  port: parseInt(process.env.OPENSEARCH_PORT || '9200'),
  ssl: false,
  timeout: 30000
});

export const knowledgeVisualizationRoutes = new Elysia({ prefix: '/knowledge' })
  .use(html())

  // Main Knowledge Visualization Dashboard
  .get('/visualization', async ({ html }) => {
    return html(`
      <div class="knowledge-viz-container">
        <div class="viz-header">
          <h1>📚 Knowledge Base Visualization</h1>
          <div class="viz-controls">
            <div class="view-tabs">
              <button class="tab-btn active" data-view="overview">Overview</button>
              <button class="tab-btn" data-view="network">Document Network</button>
              <button class="tab-btn" data-view="usage">Usage Patterns</button>
              <button class="tab-btn" data-view="gaps">Content Gaps</button>
            </div>
            <div class="refresh-controls">
              <button class="refresh-btn"
                      hx-get="/knowledge/refresh-data"
                      hx-target="#viz-content">
                 Refresh
              </button>
            </div>
          </div>
        </div>

        <div id="viz-content" class="viz-content"
             hx-get="/knowledge/overview"
             hx-trigger="load">
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading knowledge base analytics...</p>
          </div>
        </div>
      </div>

      <script>
        // Tab switching functionality
        document.querySelectorAll('.tab-btn').forEach(btn => {
          btn.addEventListener('click', function() {
            // Update active tab
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // Load corresponding view
            const view = this.dataset.view;
            htmx.ajax('GET', \`/knowledge/\${view}\`, {target: '#viz-content'});
          });
        });
      </script>
    `);
  })

  // Overview Dashboard
  .get('/overview', async ({ html }) => {
    try {
      const stats = await dashboardService.getKnowledgeBaseStats();
      const categories = await getEnhancedCategoryMetrics();

      return html(`
        <div class="kb-overview-dashboard">
          <div class="overview-metrics">
            <div class="metric-grid">
              <div class="metric-card primary">
                <div class="metric-icon">📄</div>
                <div class="metric-content">
                  <div class="metric-value">${stats.totalDocuments}</div>
                  <div class="metric-label">Total Documents</div>
                  <div class="metric-trend">+23 this month</div>
                </div>
              </div>

              <div class="metric-card success">
                <div class="metric-icon">⭐</div>
                <div class="metric-content">
                  <div class="metric-value">${stats.documentHealth.highQuality}</div>
                  <div class="metric-label">High Quality Docs</div>
                  <div class="metric-trend">${Math.round((stats.documentHealth.highQuality / stats.totalDocuments) * 100)}% of total</div>
                </div>
              </div>

              <div class="metric-card warning">
                <div class="metric-icon"></div>
                <div class="metric-content">
                  <div class="metric-value">${stats.searchHits.reduce((sum, hit) => sum + hit.count, 0)}</div>
                  <div class="metric-label">Total Searches</div>
                  <div class="metric-trend">+15% vs last week</div>
                </div>
              </div>

              <div class="metric-card danger">
                <div class="metric-icon"></div>
                <div class="metric-content">
                  <div class="metric-value">${stats.contentGaps.length}</div>
                  <div class="metric-label">Content Gaps</div>
                  <div class="metric-trend">${stats.contentGaps.filter(g => g.severity === 'high').length} high priority</div>
                </div>
              </div>
            </div>
          </div>

          <div class="overview-charts">
            <div class="chart-section">
              <h3> Category Distribution</h3>
              <div class="category-chart">
                ${categories.map(cat => `
                  <div class="category-row">
                    <div class="category-info">
                      <span class="category-name">${cat.name}</span>
                      <span class="trend-indicator trend-${cat.trending}">${getTrendIcon(cat.trending)}</span>
                    </div>
                    <div class="category-metrics">
                      <div class="metric-bar">
                        <div class="bar" style="width: ${(cat.documentCount / stats.totalDocuments) * 100}%"></div>
                        <span class="count">${cat.documentCount} docs</span>
                      </div>
                      <div class="quality-indicator quality-${getQualityLevel(cat.averageQuality)}">
                        Quality: ${Math.round(cat.averageQuality * 100)}%
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="chart-section">
              <h3>🔥 Popular Search Queries</h3>
              <div class="search-queries-chart">
                ${stats.searchHits.slice(0, 8).map((hit, index) => `
                  <div class="query-row">
                    <span class="query-rank">#${index + 1}</span>
                    <span class="query-text">${hit.query}</span>
                    <div class="query-metrics">
                      <span class="query-count">${hit.count} searches</span>
                      <div class="relevance-bar">
                        <div class="bar" style="width: ${hit.relevance * 100}%"></div>
                        <span class="relevance-score">${Math.round(hit.relevance * 100)}%</span>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="health-dashboard">
            <h3>🏥 Knowledge Base Health</h3>
            <div class="health-grid">
              <div class="health-item">
                <div class="health-icon healthy"></div>
                <div class="health-content">
                  <div class="health-title">Content Freshness</div>
                  <div class="health-value">85% updated within 30 days</div>
                  <div class="health-action">
                    <button class="btn-small"
                            hx-get="/knowledge/outdated-content"
                            hx-target="#modal-content"
                            hx-trigger="click">
                      View Outdated
                    </button>
                  </div>
                </div>
              </div>

              <div class="health-item">
                <div class="health-icon warning"></div>
                <div class="health-content">
                  <div class="health-title">Content Gaps</div>
                  <div class="health-value">${stats.contentGaps.length} identified gaps</div>
                  <div class="health-action">
                    <button class="btn-small"
                            hx-get="/knowledge/content-gaps-detail"
                            hx-target="#modal-content">
                      View Gaps
                    </button>
                  </div>
                </div>
              </div>

              <div class="health-item">
                <div class="health-icon info">ℹ️</div>
                <div class="health-content">
                  <div class="health-title">Search Success Rate</div>
                  <div class="health-value">78% of searches find relevant results</div>
                  <div class="health-action">
                    <button class="btn-small"
                            hx-get="/knowledge/search-analytics"
                            hx-target="#modal-content">
                      View Analytics
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);

    } catch (error) {
      logger.error('[KnowledgeViz] Overview loading failed:', error);
      return html(`<div class="error-state">Failed to load knowledge base overview</div>`);
    }
  })

  // Document Network Visualization
  .get('/network', async ({ html }) => {
    try {
      const networkData = await generateDocumentNetwork();

      return html(`
        <div class="network-visualization">
          <div class="network-controls">
            <h3>🕸️ Document Relationship Network</h3>
            <div class="control-group">
              <label>Filter by Category:</label>
              <select id="category-filter">
                <option value="">All Categories</option>
                <option value="database">Database</option>
                <option value="network">Network</option>
                <option value="application">Application</option>
                <option value="infrastructure">Infrastructure</option>
              </select>
            </div>
            <div class="control-group">
              <label>Connection Strength:</label>
              <input type="range" id="connection-strength" min="0" max="1" step="0.1" value="0.5">
              <span id="strength-value">50%</span>
            </div>
          </div>

          <div class="network-canvas" id="document-network">
            <svg width="100%" height="600" viewBox="0 0 800 600">
              <!-- Document nodes -->
              ${networkData.nodes.map((node, index) => {
                const x = 100 + (index % 10) * 60;
                const y = 100 + Math.floor(index / 10) * 80;
                return `
                  <g class="document-node" data-id="${node.id}">
                    <circle cx="${x}" cy="${y}"
                            r="${5 + node.connections * 2}"
                            class="node-circle quality-${node.quality}"
                            title="${node.title}">
                    </circle>
                    <text x="${x}" y="${y + 25}" class="node-label" text-anchor="middle">
                      ${node.title.length > 15 ? node.title.substring(0, 15) + '...' : node.title}
                    </text>
                  </g>
                `;
              }).join('')}

              <!-- Connections -->
              ${networkData.connections.map(conn => `
                <line x1="${conn.x1}" y1="${conn.y1}"
                      x2="${conn.x2}" y2="${conn.y2}"
                      class="connection-line"
                      stroke-width="${conn.strength * 3}"
                      opacity="${conn.strength}">
                </line>
              `).join('')}
            </svg>
          </div>

          <div class="network-legend">
            <h4>Legend</h4>
            <div class="legend-items">
              <div class="legend-item">
                <span class="legend-circle quality-high"></span>
                <span>High Quality</span>
              </div>
              <div class="legend-item">
                <span class="legend-circle quality-medium"></span>
                <span>Medium Quality</span>
              </div>
              <div class="legend-item">
                <span class="legend-circle quality-low"></span>
                <span>Needs Review</span>
              </div>
            </div>
            <p class="legend-note">
              Node size represents number of connections. Line thickness shows relationship strength.
            </p>
          </div>
        </div>

        <script>
          // Interactive network controls
          document.getElementById('connection-strength').addEventListener('input', function(e) {
            const value = Math.round(e.target.value * 100);
            document.getElementById('strength-value').textContent = value + '%';

            // Filter connections by strength
            const threshold = e.target.value;
            document.querySelectorAll('.connection-line').forEach(line => {
              const opacity = parseFloat(line.getAttribute('opacity'));
              line.style.display = opacity >= threshold ? 'block' : 'none';
            });
          });

          // Node hover effects
          document.querySelectorAll('.document-node').forEach(node => {
            node.addEventListener('mouseenter', function() {
              this.classList.add('highlighted');
            });
            node.addEventListener('mouseleave', function() {
              this.classList.remove('highlighted');
            });
          });
        </script>
      `);

    } catch (error) {
      logger.error('[KnowledgeViz] Network visualization failed:', error);
      return html(`<div class="error-state">Failed to load document network</div>`);
    }
  })

  // Usage Patterns Analysis
  .get('/usage', async ({ html }) => {
    try {
      const usageData = await getUsagePatterns();

      return html(`
        <div class="usage-patterns">
          <h3>📈 Knowledge Base Usage Patterns</h3>

          <div class="usage-grid">
            <div class="pattern-chart">
              <h4>Search Volume by Hour</h4>
              <div class="hourly-chart">
                ${Array.from({ length: 24 }, (_, hour) => {
                  const volume = getHourlyVolume(hour);
                  return `
                    <div class="hour-bar">
                      <div class="bar" style="height: ${(volume / 100) * 80}px" title="${volume} searches at ${hour}:00"></div>
                      <span class="hour-label">${hour.toString().padStart(2, '0')}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="pattern-metrics">
              <h4>Usage Metrics (Last 7 Days)</h4>
              <div class="metrics-list">
                <div class="usage-metric">
                  <span class="metric-label">Total Searches:</span>
                  <span class="metric-value">${usageData.totalSearches}</span>
                </div>
                <div class="usage-metric">
                  <span class="metric-label">Unique Users:</span>
                  <span class="metric-value">${usageData.uniqueUsers}</span>
                </div>
                <div class="usage-metric">
                  <span class="metric-label">Success Rate:</span>
                  <span class="metric-value">${usageData.successRate}%</span>
                </div>
                <div class="usage-metric">
                  <span class="metric-label">Avg Session Length:</span>
                  <span class="metric-value">${usageData.avgSessionLength}</span>
                </div>
              </div>
            </div>

            <div class="top-content">
              <h4>Most Accessed Documents</h4>
              <div class="content-list">
                ${usageData.topDocuments.map((doc, index) => `
                  <div class="content-item">
                    <span class="rank">#${index + 1}</span>
                    <div class="content-info">
                      <span class="content-title">${doc.title}</span>
                      <span class="content-category">${doc.category}</span>
                    </div>
                    <span class="access-count">${doc.accessCount} views</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="user-patterns">
              <h4>User Type Distribution</h4>
              <div class="user-chart">
                ${usageData.userTypes.map(type => `
                  <div class="user-type">
                    <span class="type-name">${type.name}</span>
                    <div class="type-bar">
                      <div class="bar" style="width: ${type.percentage}%"></div>
                      <span class="percentage">${type.percentage}%</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="insights-panel">
            <h4>💡 Usage Insights</h4>
            <div class="insights-list">
              <div class="insight-item">
                <span class="insight-icon"></span>
                <div class="insight-content">
                  <strong>Peak Usage:</strong> Knowledge base is most active between 10 AM - 2 PM
                </div>
              </div>
              <div class="insight-item">
                <span class="insight-icon"></span>
                <div class="insight-content">
                  <strong>Search Patterns:</strong> Database-related searches account for 40% of all queries
                </div>
              </div>
              <div class="insight-item">
                <span class="insight-icon">👥</span>
                <div class="insight-content">
                  <strong>User Behavior:</strong> Support agents have 25% higher search success rate than general users
                </div>
              </div>
            </div>
          </div>
        </div>
      `);

    } catch (error) {
      logger.error('[KnowledgeViz] Usage patterns failed:', error);
      return html(`<div class="error-state">Failed to load usage patterns</div>`);
    }
  })

  // Content Gaps Analysis
  .get('/gaps', async ({ html }) => {
    try {
      const stats = await dashboardService.getKnowledgeBaseStats();
      const detailedGaps = await analyzeContentGaps();

      return html(`
        <div class="content-gaps-analysis">
          <h3> Content Gap Analysis</h3>

          <div class="gaps-summary">
            <div class="summary-cards">
              <div class="gap-card high-priority">
                <div class="card-header">
                  <span class="priority-icon">🔴</span>
                  <span class="priority-label">High Priority</span>
                </div>
                <div class="card-content">
                  <div class="gap-count">${stats.contentGaps.filter(g => g.severity === 'high').length}</div>
                  <div class="gap-label">Critical gaps requiring immediate attention</div>
                </div>
              </div>

              <div class="gap-card medium-priority">
                <div class="card-header">
                  <span class="priority-icon">🟡</span>
                  <span class="priority-label">Medium Priority</span>
                </div>
                <div class="card-content">
                  <div class="gap-count">${stats.contentGaps.filter(g => g.severity === 'medium').length}</div>
                  <div class="gap-label">Moderate gaps for content planning</div>
                </div>
              </div>

              <div class="gap-card low-priority">
                <div class="card-header">
                  <span class="priority-icon">🟢</span>
                  <span class="priority-label">Low Priority</span>
                </div>
                <div class="card-content">
                  <div class="gap-count">${stats.contentGaps.filter(g => g.severity === 'low').length}</div>
                  <div class="gap-label">Minor gaps for future consideration</div>
                </div>
              </div>
            </div>
          </div>

          <div class="gaps-details">
            <h4>📋 Detailed Gap Analysis</h4>
            <div class="gaps-table">
              <div class="table-header">
                <span>Topic</span>
                <span>Request Frequency</span>
                <span>Priority</span>
                <span>Impact</span>
                <span>Actions</span>
              </div>
              ${stats.contentGaps.map(gap => `
                <div class="table-row severity-${gap.severity}">
                  <span class="gap-topic">${gap.topic}</span>
                  <span class="gap-frequency">
                    <span class="frequency-value">${gap.frequency}</span>
                    <span class="frequency-label">requests</span>
                  </span>
                  <span class="gap-severity">
                    <span class="severity-badge severity-${gap.severity}">${gap.severity.toUpperCase()}</span>
                  </span>
                  <span class="gap-impact">
                    ${getImpactDescription(gap.severity, gap.frequency)}
                  </span>
                  <span class="gap-actions">
                    <button class="btn-small create-content"
                            hx-post="/knowledge/create-content-request"
                            hx-vals='{"topic": "${gap.topic}", "priority": "${gap.severity}"}'>
                       Create Request
                    </button>
                  </span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="recommendations">
            <h4>💡 Recommendations</h4>
            <div class="recommendations-list">
              ${detailedGaps.recommendations.map(rec => `
                <div class="recommendation-item">
                  <div class="rec-header">
                    <span class="rec-priority priority-${rec.priority}">${rec.priority.toUpperCase()}</span>
                    <span class="rec-title">${rec.title}</span>
                  </div>
                  <div class="rec-content">
                    <p>${rec.description}</p>
                    <div class="rec-metrics">
                      <span>Expected Impact: ${rec.expectedImpact}</span>
                      <span>Effort: ${rec.effort}</span>
                      <span>Timeline: ${rec.timeline}</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `);

    } catch (error) {
      logger.error('[KnowledgeViz] Content gaps analysis failed:', error);
      return html(`<div class="error-state">Failed to load content gaps analysis</div>`);
    }
  })

  // Refresh Data
  .get('/refresh-data', async ({ html }) => {
    try {
      // Force refresh of knowledge base analytics
      await Promise.all([
        dashboardService.getKnowledgeBaseStats(),
        getEnhancedCategoryMetrics(),
        getUsagePatterns()
      ]);

      return html(`
        <div class="refresh-notification">
          <span class="success-icon"></span>
          <span>Knowledge base data refreshed successfully</span>
          <span class="timestamp">${new Date().toLocaleTimeString()}</span>
        </div>
      `);

    } catch (error) {
      logger.error('[KnowledgeViz] Data refresh failed:', error);
      return html(`
        <div class="refresh-error">
          <span class="error-icon"></span>
          <span>Failed to refresh data</span>
        </div>
      `);
    }
  });

// Helper functions
async function getEnhancedCategoryMetrics(): Promise<CategoryMetrics[]> {
  // Mock enhanced category data
  return [
    {
      name: 'Database',
      documentCount: 245,
      searchFrequency: 580,
      averageQuality: 0.85,
      trending: 'up',
      gaps: ['Oracle 19c migration', 'Performance tuning']
    },
    {
      name: 'Network',
      documentCount: 189,
      searchFrequency: 420,
      averageQuality: 0.78,
      trending: 'stable',
      gaps: ['SD-WAN configuration', 'WiFi 6 deployment']
    },
    {
      name: 'Application',
      documentCount: 156,
      searchFrequency: 380,
      averageQuality: 0.72,
      trending: 'down',
      gaps: ['Container orchestration', 'Microservices debugging']
    },
    {
      name: 'Infrastructure',
      documentCount: 134,
      searchFrequency: 290,
      averageQuality: 0.88,
      trending: 'up',
      gaps: ['Cloud cost optimization']
    }
  ];
}

async function generateDocumentNetwork(): Promise<{nodes: DocumentNode[], connections: any[]}> {
  const nodes: DocumentNode[] = [
    { id: 'doc1', title: 'Database Backup Procedures', category: 'database', connections: 5, quality: 'high', lastAccessed: '2025-01-14', relevanceScore: 0.92 },
    { id: 'doc2', title: 'Network Troubleshooting Guide', category: 'network', connections: 3, quality: 'medium', lastAccessed: '2025-01-13', relevanceScore: 0.87 },
    { id: 'doc3', title: 'Application Deployment', category: 'application', connections: 4, quality: 'high', lastAccessed: '2025-01-14', relevanceScore: 0.89 },
    { id: 'doc4', title: 'Security Configuration', category: 'security', connections: 6, quality: 'high', lastAccessed: '2025-01-12', relevanceScore: 0.94 },
    { id: 'doc5', title: 'Monitoring Setup', category: 'infrastructure', connections: 2, quality: 'low', lastAccessed: '2025-01-10', relevanceScore: 0.65 }
  ];

  const connections = [
    { x1: 100, y1: 100, x2: 160, y2: 100, strength: 0.8 },
    { x1: 160, y1: 100, x2: 220, y2: 100, strength: 0.6 },
    { x1: 100, y1: 100, x2: 220, y2: 180, strength: 0.7 },
    { x1: 280, y1: 100, x2: 340, y2: 100, strength: 0.9 }
  ];

  return { nodes, connections };
}

async function getUsagePatterns(): Promise<any> {
  return {
    totalSearches: 1247,
    uniqueUsers: 89,
    successRate: 78,
    avgSessionLength: '4m 32s',
    topDocuments: [
      { title: 'Database Connection Issues', category: 'Database', accessCount: 156 },
      { title: 'Network Connectivity Guide', category: 'Network', accessCount: 142 },
      { title: 'Application Error Codes', category: 'Application', accessCount: 128 },
      { title: 'Server Maintenance Procedures', category: 'Infrastructure', accessCount: 115 }
    ],
    userTypes: [
      { name: 'Support Agents', percentage: 45 },
      { name: 'System Administrators', percentage: 30 },
      { name: 'End Users', percentage: 15 },
      { name: 'Managers', percentage: 10 }
    ]
  };
}

async function analyzeContentGaps(): Promise<any> {
  return {
    recommendations: [
      {
        priority: 'high',
        title: 'Create Oracle 19c Migration Guide',
        description: 'High demand for Oracle 19c migration procedures with 45 requests in the last month.',
        expectedImpact: 'Reduce escalations by 30%',
        effort: 'Medium (2-3 days)',
        timeline: '1 week'
      },
      {
        priority: 'medium',
        title: 'Expand Container Troubleshooting',
        description: 'Growing need for container orchestration and Kubernetes troubleshooting guides.',
        expectedImpact: 'Improve resolution time by 20%',
        effort: 'High (1 week)',
        timeline: '2 weeks'
      },
      {
        priority: 'low',
        title: 'Update Network Diagrams',
        description: 'Network topology diagrams are outdated and need visual refresh.',
        expectedImpact: 'Better user understanding',
        effort: 'Low (1 day)',
        timeline: '3 weeks'
      }
    ]
  };
}

function getTrendIcon(trend: string): string {
  switch (trend) {
    case 'up': return '📈';
    case 'down': return '📉';
    case 'stable': return '➡️';
    default: return '➡️';
  }
}

function getQualityLevel(quality: number): string {
  if (quality >= 0.8) return 'high';
  if (quality >= 0.6) return 'medium';
  return 'low';
}

function getHourlyVolume(hour: number): number {
  // Simulate realistic hourly search patterns
  const businessHours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const baseVolume = businessHours.includes(hour) ? 60 : 15;
  const variation = Math.random() * 20 - 10;
  return Math.max(0, Math.round(baseVolume + variation));
}

function getImpactDescription(severity: string, frequency: number): string {
  if (severity === 'high' && frequency > 40) return 'Major productivity loss';
  if (severity === 'high') return 'Moderate impact on operations';
  if (severity === 'medium' && frequency > 30) return 'Noticeable efficiency gap';
  if (severity === 'medium') return 'Minor workflow disruption';
  return 'Low impact on daily operations';
}