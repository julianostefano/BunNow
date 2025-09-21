/**
 * HTMX Knowledge Visualization Routes - Interactive Knowledge Graph Interface
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { KnowledgeGraphService } from "../../services/ai/KnowledgeGraphService";
import { DocumentLifecycleService } from "../../services/ai/DocumentLifecycleService";

export const knowledgeVisualizationRoutes = new Elysia({ prefix: "/knowledge" })
  .use(html())

  .get("/graph", async ({ html }) => {
    const knowledgeGraph = new KnowledgeGraphService();
    const analytics = await knowledgeGraph.getGraphAnalytics();

    return html(`
      <div class="knowledge-graph-container">
        <div class="graph-header">
          <h2>Knowledge Graph Visualization</h2>
          <div class="graph-stats">
            <div class="stat-item">
              <span class="stat-value">${analytics.total_nodes}</span>
              <span class="stat-label">Nodes</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${analytics.total_edges}</span>
              <span class="stat-label">Connections</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${analytics.cluster_analysis.length}</span>
              <span class="stat-label">Clusters</span>
            </div>
          </div>
        </div>

        <div class="graph-controls">
          <div class="control-group">
            <label>Filter by Technology:</label>
            <select hx-get="/knowledge/graph/filter"
                    hx-target="#graph-visualization"
                    hx-include="[name='support_group']"
                    name="technology">
              <option value="">All Technologies</option>
              ${analytics.most_connected_technologies
                .map(
                  (tech) => `
                <option value="${tech.name}">${tech.name} (${tech.connections})</option>
              `,
                )
                .join("")}
            </select>
          </div>

          <div class="control-group">
            <label>Filter by Support Group:</label>
            <select hx-get="/knowledge/graph/filter"
                    hx-target="#graph-visualization"
                    hx-include="[name='technology']"
                    name="support_group">
              <option value="">All Groups</option>
              <option value="Database">Database</option>
              <option value="Infrastructure">Infrastructure</option>
              <option value="Cloud">Cloud</option>
              <option value="Security">Security</option>
              <option value="Application">Application</option>
              <option value="Network">Network</option>
            </select>
          </div>

          <div class="control-group">
            <button hx-get="/knowledge/analytics/gaps"
                    hx-target="#gap-analysis"
                    class="btn-secondary">
              Analyze Knowledge Gaps
            </button>
          </div>
        </div>

        <div id="graph-visualization" class="graph-viz-area">
          <div class="graph-placeholder">
            <p>Loading knowledge graph visualization...</p>
            <div class="loading-spinner"></div>
          </div>
        </div>

        <div class="graph-insights">
          <div class="insight-section">
            <h3>Technology Clusters</h3>
            <div class="cluster-grid">
              ${analytics.cluster_analysis
                .map(
                  (cluster) => `
                <div class="cluster-card"
                     hx-get="/knowledge/cluster/${cluster.cluster_id}"
                     hx-target="#cluster-details">
                  <h4>${cluster.cluster_id.replace("cluster_", "").replace(/_/g, " ")}</h4>
                  <p class="cluster-tech">${cluster.technologies.join(", ")}</p>
                  <span class="cluster-size">${cluster.size} documents</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>

          <div class="insight-section">
            <h3>Knowledge Gaps Analysis</h3>
            <div id="gap-analysis">
              <button hx-get="/knowledge/analytics/gaps"
                      hx-target="#gap-analysis"
                      class="btn-outline">
                Run Gap Analysis
              </button>
            </div>
          </div>
        </div>

        <div id="cluster-details" class="cluster-details-panel"></div>
      </div>

      <style>
        .knowledge-graph-container {
          padding: 1rem;
        }

        .graph-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .graph-stats {
          display: flex;
          gap: 2rem;
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          display: block;
          font-size: 2rem;
          font-weight: bold;
          color: #3b82f6;
        }

        .stat-label {
          font-size: 0.875rem;
          color: #64748b;
        }

        .graph-controls {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: #f8fafc;
          border-radius: 0.5rem;
          flex-wrap: wrap;
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .control-group label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .control-group select {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          background: white;
        }

        .graph-viz-area {
          min-height: 400px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          margin-bottom: 1.5rem;
          position: relative;
        }

        .graph-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 400px;
          color: #64748b;
        }

        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e2e8f0;
          border-top: 3px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-top: 1rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .graph-insights {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .insight-section h3 {
          margin-bottom: 1rem;
          color: #1f2937;
        }

        .cluster-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1rem;
        }

        .cluster-card {
          padding: 1rem;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cluster-card:hover {
          border-color: #3b82f6;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .cluster-card h4 {
          margin: 0 0 0.5rem 0;
          color: #1f2937;
          text-transform: capitalize;
        }

        .cluster-tech {
          font-size: 0.875rem;
          color: #64748b;
          margin: 0 0 0.5rem 0;
        }

        .cluster-size {
          font-size: 0.75rem;
          background: #eff6ff;
          color: #3b82f6;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
        }

        .cluster-details-panel {
          margin-top: 1.5rem;
          padding: 1rem;
          background: #f8fafc;
          border-radius: 0.5rem;
          min-height: 200px;
        }

        .btn-secondary, .btn-outline {
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary {
          background: #3b82f6;
          color: white;
          border: none;
        }

        .btn-secondary:hover {
          background: #2563eb;
        }

        .btn-outline {
          background: transparent;
          color: #3b82f6;
          border: 1px solid #3b82f6;
        }

        .btn-outline:hover {
          background: #3b82f6;
          color: white;
        }
      </style>
    `);
  })

  .get("/analytics/gaps", async ({ html }) => {
    const documentService = new DocumentLifecycleService();
    const gaps = await documentService.detectDocumentationGaps();

    return html(`
      <div class="gap-analysis-results">
        <div class="gap-header">
          <h3>Knowledge Gap Analysis</h3>
          <span class="analysis-date">Analysis Date: ${new Date(gaps.analysis_date).toLocaleDateString()}</span>
        </div>

        <div class="coverage-score">
          <div class="score-circle">
            <span class="score-value">${gaps.coverage_score}%</span>
            <span class="score-label">Coverage Score</span>
          </div>
        </div>

        <div class="gap-sections">
          <div class="gap-section">
            <h4>Missing Topics (${gaps.missing_topics.length})</h4>
            <div class="topic-list">
              ${gaps.missing_topics
                .map(
                  (topic: any) => `
                <div class="topic-item severity-${topic.gap_severity}">
                  <div class="topic-info">
                    <span class="topic-name">${topic.topic}</span>
                    <span class="search-frequency">${topic.search_frequency} searches</span>
                  </div>
                  <span class="severity-badge ${topic.gap_severity}">${topic.gap_severity}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>

          <div class="gap-section">
            <h4>Suggested Documents (${gaps.suggested_documents.length})</h4>
            <div class="suggestion-list">
              ${gaps.suggested_documents
                .map(
                  (doc: any) => `
                <div class="suggestion-item">
                  <div class="suggestion-info">
                    <span class="doc-title">${doc.title}</span>
                    <span class="effort-estimate">Effort: ${doc.estimated_effort}</span>
                  </div>
                  <span class="priority-badge ${doc.priority}">${doc.priority}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>

          <div class="gap-section">
            <h4>Documents Needing Updates (${gaps.update_candidates.length})</h4>
            <div class="update-list">
              ${gaps.update_candidates
                .map(
                  (update: any) => `
                <div class="update-item">
                  <span class="tech-name">${update.technology}</span>
                  <span class="update-reason">${update.reason}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        </div>

        <div class="recommendations">
          <h4>Recommendations</h4>
          <ul class="recommendation-list">
            ${gaps.recommendations
              .map(
                (rec: string) => `
              <li>${rec}</li>
            `,
              )
              .join("")}
          </ul>
        </div>
      </div>

      <style>
        .gap-analysis-results {
          padding: 1.5rem;
          background: white;
          border-radius: 0.5rem;
        }

        .gap-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .gap-header h3 {
          margin: 0;
          color: #1f2937;
        }

        .analysis-date {
          font-size: 0.875rem;
          color: #64748b;
        }

        .coverage-score {
          display: flex;
          justify-content: center;
          margin-bottom: 2rem;
        }

        .score-circle {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          color: white;
        }

        .score-value {
          font-size: 2rem;
          font-weight: bold;
        }

        .score-label {
          font-size: 0.75rem;
          opacity: 0.9;
        }

        .gap-sections {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .gap-section h4 {
          margin: 0 0 1rem 0;
          color: #374151;
        }

        .topic-item, .suggestion-item, .update-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: #f8fafc;
          border-radius: 0.375rem;
          margin-bottom: 0.5rem;
        }

        .topic-info, .suggestion-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .topic-name, .doc-title, .tech-name {
          font-weight: 500;
          color: #1f2937;
        }

        .search-frequency, .effort-estimate, .update-reason {
          font-size: 0.75rem;
          color: #64748b;
        }

        .severity-badge, .priority-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .severity-badge.high, .priority-badge.high {
          background: #fef2f2;
          color: #dc2626;
        }

        .severity-badge.medium, .priority-badge.medium {
          background: #fef3c7;
          color: #d97706;
        }

        .severity-badge.low, .priority-badge.low {
          background: #f0fdf4;
          color: #16a34a;
        }

        .recommendations {
          padding: 1.5rem;
          background: #fffbeb;
          border-radius: 0.5rem;
          border-left: 4px solid #f59e0b;
        }

        .recommendations h4 {
          margin: 0 0 1rem 0;
          color: #92400e;
        }

        .recommendation-list {
          margin: 0;
          padding-left: 1.5rem;
          color: #78350f;
        }

        .recommendation-list li {
          margin-bottom: 0.5rem;
        }
      </style>
    `);
  });
