/**
 * Floating Panel Component - "Living" Panel with Dynamic Content
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Features:
 * - Glassmorphism design with floating animation
 * - Support for videos, graphics (Chart.js), LLM prompts
 * - Minimize/Expand functionality
 * - Real-time data updates via SSE
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";

/**
 * Panel Content Types
 */
type PanelContentType = 'metrics' | 'video' | 'chart' | 'llm' | 'alert';

interface PanelContent {
  type: PanelContentType;
  data: any;
}

/**
 * Render Metrics Card
 */
function renderMetricsCard(data: { label: string; value: string | number; change?: string; trend?: 'up' | 'down' | 'neutral' }) {
  const trendIcon = data.trend === 'up' ? 'trending-up' : data.trend === 'down' ? 'trending-down' : 'minus';
  const trendColor = data.trend === 'up' ? 'text-accent-success' : data.trend === 'down' ? 'text-accent-danger' : 'text-text-muted';

  return `
    <div class="flex items-center justify-between p-4 glass-card rounded-lg">
      <div>
        <p class="text-sm text-text-secondary">${data.label}</p>
        <p class="text-2xl font-bold text-text-primary mt-1">${data.value}</p>
        ${data.change ? `
          <div class="flex items-center gap-1 mt-1 ${trendColor}">
            <i data-lucide="${trendIcon}" class="w-4 h-4"></i>
            <span class="text-xs">${data.change}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Render Video Player
 */
function renderVideo(videoUrl: string, poster?: string) {
  return `
    <div class="relative aspect-video rounded-lg overflow-hidden">
      <video
        class="w-full h-full object-cover"
        autoplay
        muted
        loop
        playsinline
        ${poster ? `poster="${poster}"` : ''}
      >
        <source src="${videoUrl}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
    </div>
  `;
}

/**
 * Render Chart Placeholder
 */
function renderChart(chartId: string, chartType: 'line' | 'bar' | 'doughnut', data: any) {
  return `
    <div class="p-4 glass-card rounded-lg">
      <canvas id="${chartId}" width="400" height="200"></canvas>
    </div>
    <script>
      (function() {
        const ctx = document.getElementById('${chartId}');
        if (ctx && typeof Chart !== 'undefined') {
          new Chart(ctx, {
            type: '${chartType}',
            data: ${JSON.stringify(data)},
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false }
              },
              scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                x: { grid: { color: 'rgba(255,255,255,0.1)' } }
              }
            }
          });
        }
      })();
    </script>
  `;
}

/**
 * Render LLM Prompt Stream
 */
function renderLLMPrompt(promptId: string) {
  return `
    <div class="p-4 glass-card rounded-lg">
      <div class="flex items-center gap-2 mb-3">
        <i data-lucide="bot" class="w-5 h-5 text-accent-primary"></i>
        <span class="text-sm font-medium text-text-primary">AI Assistant</span>
      </div>
      <div
        id="${promptId}"
        class="text-sm text-text-secondary whitespace-pre-wrap"
        hx-ext="sse"
        sse-connect="/api/ai/stream"
        sse-swap="message"
      >
        Connecting to AI...
      </div>
    </div>
  `;
}

/**
 * Render Alert/Notification
 */
function renderAlert(data: { type: 'info' | 'warning' | 'error' | 'success'; message: string }) {
  const iconMap = {
    info: 'info',
    warning: 'alert-triangle',
    error: 'x-circle',
    success: 'check-circle-2'
  };

  const colorMap = {
    info: 'badge-new',
    warning: 'badge-waiting',
    error: 'badge-critical',
    success: 'badge-resolved'
  };

  return `
    <div class="p-4 ${colorMap[data.type]} rounded-lg flex items-center gap-3">
      <i data-lucide="${iconMap[data.type]}" class="w-5 h-5"></i>
      <p class="text-sm">${data.message}</p>
    </div>
  `;
}

/**
 * Floating Panel HTML
 */
export function floatingPanelHTML(minimized: boolean = false): string {
  return `
    <div
      id="floating-panel"
      class="fixed top-20 left-1/2 transform -translate-x-1/2 z-panel transition-all duration-300 ${minimized ? 'w-96' : 'w-[90%] max-w-6xl'}"
    >
      <div class="glass-panel rounded-xl p-6 floating">
        <!-- Panel Header -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-3 h-3 rounded-full bg-accent-success animate-pulse"></div>
            <h3 class="text-lg font-semibold text-text-primary">Live Dashboard</h3>
          </div>
          <div class="flex items-center gap-2">
            <!-- Refresh Button -->
            <button
              class="btn-primary p-2"
              hx-get="/ui/panel"
              hx-target="#floating-panel"
              hx-swap="outerHTML"
              aria-label="Refresh panel"
            >
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
            </button>

            <!-- Minimize/Expand Button -->
            <button
              id="panel-toggle"
              class="btn-primary p-2"
              onclick="document.getElementById('floating-panel').classList.toggle('panel-minimized')"
              aria-label="Toggle panel size"
            >
              <i data-lucide="${minimized ? 'maximize-2' : 'minimize-2'}" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Panel Content -->
        <div id="panel-content" class="${minimized ? 'hidden' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'}">
          <!-- Real-time Metrics -->
          ${renderMetricsCard({ label: 'Active Incidents', value: 42, change: '+5.2%', trend: 'up' })}
          ${renderMetricsCard({ label: 'Avg Response Time', value: '2.4h', change: '-12%', trend: 'down' })}
          ${renderMetricsCard({ label: 'SLA Compliance', value: '94.3%', change: '+1.5%', trend: 'up' })}
          ${renderMetricsCard({ label: 'Open Tasks', value: 18, change: '0', trend: 'neutral' })}

          <!-- Optional: Video/Chart/LLM (uncomment to enable) -->
          <!--
          <div class="col-span-2">
            ${renderChart('panel-chart-1', 'line', {
              labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
              datasets: [{
                label: 'Incidents',
                data: [12, 19, 15, 25, 22],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4
              }]
            })}
          </div>
          -->
        </div>

        <!-- SSE Connection for Real-time Updates -->
        <div
          hx-ext="sse"
          sse-connect="/api/streaming/metrics"
          sse-swap="metrics"
          hx-target="#panel-content"
          hx-swap="innerHTML"
          class="hidden"
        ></div>
      </div>
    </div>

    <style>
      .panel-minimized #panel-content {
        display: none !important;
      }

      .panel-minimized {
        width: 24rem !important;
      }

      .floating {
        animation: float 6s ease-in-out infinite;
      }
    </style>
  `;
}

/**
 * Panel Routes
 */
export const floatingPanelRoutes = new Elysia()
  .use(html())

  .get("/panel", ({ query }) => {
    const minimized = query.minimized === 'true';
    return floatingPanelHTML(minimized);
  })

  .get("/panel/metrics", async () => {
    // Fetch real-time metrics from API
    try {
      const response = await fetch('http://localhost:3008/api/incidents/stats/summary');
      const data = await response.json();

      if (data.success) {
        return {
          active: data.data.active,
          high_priority: data.data.high_priority,
          avg_resolution_time: data.data.avg_resolution_time,
          sla_compliance: data.data.sla_compliance,
        };
      }
    } catch (error) {
      console.error('Failed to fetch panel metrics:', error);
    }

    // Fallback data
    return {
      active: 0,
      high_priority: 0,
      avg_resolution_time: 'N/A',
      sla_compliance: 0,
    };
  });
