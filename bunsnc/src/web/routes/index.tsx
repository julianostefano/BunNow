/**
 * Modern Dashboard with Glass Navigation and Real-time Analytics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { MainLayout, createPageMeta } from "../layouts/MainLayout";

const app = new Elysia().use(html()).get("/", ({ request }) => {
  const url = new URL(request.url);
  const currentPath = url.pathname;

  const pageContent = `
      <!-- Header Section -->
      <div class="text-center mb-12 lazy-load-item">
        <h1 class="text-4xl font-bold gradient-text mb-4">Real-time Analytics Dashboard</h1>
        <p class="text-white/80 text-lg">Monitor ServiceNow data processing and system performance in real-time</p>
      </div>

      <!-- Stats Grid with Real-time Updates -->
      <div class="stats-grid mb-12">
        <div class="stat-card floating-element lazy-load-item"
             hx-ext="sse"
             sse-connect="/events/stream"
             sse-swap="incident-count">
          <div class="stat-value" id="incident-count">1,247</div>
          <div class="stat-label">Total Incidents</div>
          <div class="stat-trend positive">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
            +12% from last week
          </div>
        </div>

        <div class="stat-card floating-element lazy-load-item" style="animation-delay: 0.2s;"
             hx-ext="sse"
             sse-connect="/events/stream"
             sse-swap="problem-count">
          <div class="stat-value" id="problem-count">89</div>
          <div class="stat-label">Active Problems</div>
          <div class="stat-trend negative">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            -5% from last week
          </div>
        </div>

        <div class="stat-card floating-element lazy-load-item" style="animation-delay: 0.4s;"
             hx-ext="sse"
             sse-connect="/events/stream"
             sse-swap="change-count">
          <div class="stat-value" id="change-count">156</div>
          <div class="stat-label">Pending Changes</div>
          <div class="stat-trend positive">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
            +8% from last week
          </div>
        </div>

        <div class="stat-card floating-element lazy-load-item" style="animation-delay: 0.6s;">
          <div class="stat-value">98.7%</div>
          <div class="stat-label">System Availability</div>
          <div class="stat-trend positive">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
            +0.3% from last week
          </div>
        </div>
      </div>

      <!-- Interactive Controls -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <!-- Data Processing Controls -->
        <div class="glass-card p-8 lazy-load-item">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-semibold text-white">Data Processing Controls</h2>
            <div class="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button class="glass-btn-primary p-3 rounded-lg"
                      hx-post="/api/v1/process/parquet/incident"
                      hx-target="#processing-log"
                      hx-indicator="#processing-spinner">
                <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                Export Incidents
              </button>

              <button class="glass-btn p-3 rounded-lg"
                      hx-post="/api/v1/pipeline/execute/realtime"
                      hx-target="#processing-log"
                      hx-indicator="#processing-spinner">
                <svg class="w-5 h-5 mr-2 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 3V9H21L11 23V17H3L13 3Z" />
                </svg>
                Start Real-time
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button class="glass-btn p-3 rounded-lg"
                      hx-post="/api/v1/process/parquet/problem"
                      hx-target="#processing-log"
                      hx-indicator="#processing-spinner">
                <svg class="w-5 h-5 mr-2 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                </svg>
                Export Problems
              </button>

              <button class="glass-btn p-3 rounded-lg"
                      hx-get="/htmx/statistics"
                      hx-target="#analytics-content"
                      hx-trigger="click">
                <svg class="w-5 h-5 mr-2 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z" />
                </svg>
                Refresh Analytics
              </button>
            </div>

            <!-- Processing Spinner -->
            <div id="processing-spinner" class="htmx-indicator">
              <div class="loading-indicator visible">
                <div class="loading-spinner"></div>
                <span class="ml-3 text-white/80">Processing request...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Processing Log -->
        <div class="glass-card p-8 lazy-load-item">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-semibold text-white">Processing Log</h2>
            <button class="glass-btn p-2 rounded-lg" onclick="clearLog()">
              <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          <div id="processing-log" class="bg-black/20 backdrop-blur-sm border border-white/10 rounded-lg p-4 h-64 overflow-y-auto text-sm font-mono">
            <div class="text-green-400">[${new Date().toISOString()}] System ready for data processing...</div>
            <div class="text-blue-400">[${new Date().toISOString()}] WebSocket connection established</div>
            <div class="text-yellow-400">[${new Date().toISOString()}] Monitoring ServiceNow real-time events...</div>
          </div>
        </div>
      </div>

      <!-- Analytics Overview -->
      <div class="glass-card p-8 mb-8 lazy-load-item">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-semibold text-white">Analytics Overview</h2>
          <div class="flex items-center space-x-2">
            <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span class="text-white/60 text-sm">Live data</span>
          </div>
        </div>

        <div id="analytics-content"
             hx-get="/htmx/metrics"
             hx-trigger="load, every 30s"
             hx-indicator="#analytics-loading">
          <div id="analytics-loading" class="htmx-indicator">
            <div class="loading-indicator visible">
              <div class="loading-spinner"></div>
              <span class="ml-3 text-white/80">Loading analytics...</span>
            </div>
          </div>

          <!-- Default content will be replaced by HTMX -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="text-center p-4 bg-white/5 rounded-lg">
              <div class="text-2xl font-bold text-blue-400">2,850</div>
              <div class="text-sm text-white/60">Total Tickets</div>
            </div>
            <div class="text-center p-4 bg-white/5 rounded-lg">
              <div class="text-2xl font-bold text-green-400">1,950</div>
              <div class="text-sm text-white/60">Resolved</div>
            </div>
            <div class="text-center p-4 bg-white/5 rounded-lg">
              <div class="text-2xl font-bold text-yellow-400">900</div>
              <div class="text-sm text-white/60">Active</div>
            </div>
            <div class="text-center p-4 bg-white/5 rounded-lg">
              <div class="text-2xl font-bold text-purple-400">24.5h</div>
              <div class="text-sm text-white/60">Avg Response</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="lazy-load-item">
        <h2 class="text-2xl font-semibold text-white mb-6">Quick Actions</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <a href="/incidents" class="glass-card p-6 text-center hover-lift transition-all duration-300">
            <div class="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
            </div>
            <h3 class="font-medium text-white text-sm">Incidents</h3>
          </a>

          <a href="/problems" class="glass-card p-6 text-center hover-lift transition-all duration-300">
            <div class="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
            <h3 class="font-medium text-white text-sm">Problems</h3>
          </a>

          <a href="/changes" class="glass-card p-6 text-center hover-lift transition-all duration-300">
            <div class="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.11 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z" />
              </svg>
            </div>
            <h3 class="font-medium text-white text-sm">Changes</h3>
          </a>

          <a href="/analytics" class="glass-card p-6 text-center hover-lift transition-all duration-300">
            <div class="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z" />
              </svg>
            </div>
            <h3 class="font-medium text-white text-sm">Analytics</h3>
          </a>

          <a href="/reports" class="glass-card p-6 text-center hover-lift transition-all duration-300">
            <div class="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
              </svg>
            </div>
            <h3 class="font-medium text-white text-sm">Reports</h3>
          </a>

          <a href="/settings" class="glass-card p-6 text-center hover-lift transition-all duration-300">
            <div class="w-12 h-12 bg-gray-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
              </svg>
            </div>
            <h3 class="font-medium text-white text-sm">Settings</h3>
          </a>
        </div>
      </div>

      <!-- Additional Scripts for Dashboard -->
      <script>
        // Clear log function
        function clearLog() {
          const logElement = document.getElementById('processing-log');
          logElement.innerHTML = '<div class="text-green-400">[' + new Date().toISOString() + '] Log cleared by user</div>';
        }

        // HTMX event handlers
        document.body.addEventListener('htmx:beforeRequest', (event) => {
          console.log('HTMX request started:', event.detail);
        });

        document.body.addEventListener('htmx:afterRequest', (event) => {
          console.log('HTMX request completed:', event.detail);
          if (!event.detail.successful) {
            window.showNotification('Request failed. Please try again.', 'error');
          }
        });

        // Handle SSE events
        document.body.addEventListener('htmx:sseMessage', (event) => {
          console.log('SSE message received:', event.detail);

          // Update timestamp on real-time updates
          const elements = document.querySelectorAll('.stat-card');
          elements.forEach(card => {
            const label = card.querySelector('.stat-label');
            if (label && !label.textContent.includes('Updated:')) {
              const timestamp = new Date().toLocaleTimeString();
              label.innerHTML += \` <span class="text-xs text-white/40">(Updated: \${timestamp})</span>\`;
            }
          });
        });
      </script>
    `;

  return MainLayout({
    title: "Dashboard",
    currentPath,
    children: pageContent,
    user: {
      name: "Admin User",
      role: "System Administrator",
    },
    additionalHead: createPageMeta({
      title: "Dashboard",
      description:
        "Real-time ServiceNow analytics and monitoring dashboard with modern glass design",
      canonical: "/",
    }),
  });
});

export default app;
