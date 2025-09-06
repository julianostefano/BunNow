/**
 * HTMX Dashboard Routes for Ultra-Fast ServiceNow UI
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from 'elysia';
import { html } from '@elysiajs/html';
import { htmx } from '@gtramontina.com/elysia-htmx';
import { serviceNowAuthClient } from '../services/ServiceNowAuthClient';
import { serviceNowRateLimiter } from '../services/ServiceNowRateLimit';

export const htmxDashboard = new Elysia({ prefix: '/htmx' })
  .use(html())
  .use(htmx())
  
  /**
   * Main dashboard page with ServiceNow ticket search
   */
  .get('/', ({ hx, set }) => {
    if (!hx.isHTMX) {
      // Full page for direct access
      return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BunSNC - ServiceNow Dashboard</title>
            <script src="https://unpkg.com/htmx.org@1.9.10"></script>
            <script src="https://unpkg.com/htmx.org/dist/ext/ws.js"></script>
            <script src="https://unpkg.com/alpinejs@3.13.5/dist/cdn.min.js" defer></script>
            <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
            <style>
                /* ElysiaJS Theme - Dark Background with Modern Gradients */
                :root {
                    --elysia-primary: #3b82f6;
                    --elysia-primary-dark: #1d4ed8;
                    --elysia-secondary: #8b5cf6;
                    --elysia-accent: #06b6d4;
                    --elysia-bg-primary: #0f172a;
                    --elysia-bg-secondary: #1e293b;
                    --elysia-bg-tertiary: #334155;
                    --elysia-text-primary: #f8fafc;
                    --elysia-text-secondary: #cbd5e1;
                    --elysia-text-muted: #64748b;
                    --elysia-border: #475569;
                    --elysia-border-light: #64748b;
                }
                
                /* Base Styles and Transitions */
                .htmx-request { 
                    opacity: 0.7; 
                    transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
                    position: relative;
                }
                .htmx-request::after { 
                    content: ""; 
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid var(--elysia-primary);
                    border-top: 2px solid transparent;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-left: 8px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                /* Status Badges - ElysiaJS Style */
                .status-badge { 
                    padding: 0.25rem 0.75rem;
                    border-radius: 0.5rem;
                    font-size: 0.75rem;
                    font-weight: 500;
                    backdrop-filter: blur(8px);
                }
                .status-novo { 
                    background: rgba(59, 130, 246, 0.2);
                    color: #93c5fd;
                    border: 1px solid rgba(59, 130, 246, 0.3);
                }
                .status-andamento { 
                    background: rgba(245, 158, 11, 0.2);
                    color: #fbbf24;
                    border: 1px solid rgba(245, 158, 11, 0.3);
                }
                .status-resolvido { 
                    background: rgba(16, 185, 129, 0.2);
                    color: #6ee7b7;
                    border: 1px solid rgba(16, 185, 129, 0.3);
                }
                .status-fechado { 
                    background: rgba(107, 114, 128, 0.2);
                    color: #d1d5db;
                    border: 1px solid rgba(107, 114, 128, 0.3);
                }
                .status-cancelado { 
                    background: rgba(239, 68, 68, 0.2);
                    color: #fca5a5;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }
                
                /* Card Animations - ElysiaJS Dark Theme */
                .metric-card { 
                    background: linear-gradient(135deg, var(--elysia-bg-secondary) 0%, var(--elysia-bg-tertiary) 100%);
                    border-radius: 1rem;
                    border: 1px solid var(--elysia-border);
                    padding: 1.5rem;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    backdrop-filter: blur(8px);
                }
                .metric-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                    border-color: var(--elysia-primary);
                }
                
                .ticket-card {
                    background: linear-gradient(135deg, var(--elysia-bg-secondary) 0%, rgba(30, 41, 59, 0.8) 100%);
                    border-radius: 0.75rem;
                    border: 1px solid var(--elysia-border);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                    backdrop-filter: blur(8px);
                }
                .ticket-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 24px rgba(0,0,0,0.3);
                    border-color: var(--elysia-primary);
                    background: linear-gradient(135deg, var(--elysia-bg-tertiary) 0%, rgba(51, 65, 85, 0.9) 100%);
                }
                
                /* Search Container - ElysiaJS Theme */
                .search-container { 
                    background: linear-gradient(135deg, var(--elysia-bg-secondary) 0%, var(--elysia-bg-tertiary) 100%);
                    border-radius: 1rem;
                    border: 1px solid var(--elysia-border);
                    padding: 2rem;
                    backdrop-filter: blur(8px);
                }
                
                /* Loading States - ElysiaJS Dark Theme */
                .loading-skeleton {
                    background: linear-gradient(90deg, var(--elysia-bg-secondary) 25%, var(--elysia-bg-tertiary) 50%, var(--elysia-bg-secondary) 75%);
                    background-size: 200% 100%;
                    animation: loading 1.5s infinite;
                    border-radius: 0.5rem;
                    border: 1px solid var(--elysia-border);
                }
                @keyframes loading {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                
                .pulse-loading {
                    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: .5; }
                }
                
                /* Fade Animations */
                .fade-in {
                    animation: fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                /* Modal Animations - ElysiaJS Style */
                .modal-backdrop {
                    animation: backdropFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    background: rgba(15, 23, 42, 0.8);
                    backdrop-filter: blur(8px);
                }
                @keyframes backdropFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                .modal-content {
                    animation: modalSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    background: linear-gradient(135deg, var(--elysia-bg-secondary) 0%, var(--elysia-bg-primary) 100%);
                    border: 1px solid var(--elysia-border);
                    color: var(--elysia-text-primary);
                }
                @keyframes modalSlideIn {
                    from { 
                        opacity: 0; 
                        transform: scale(0.8) translateY(-20px);
                    }
                    to { 
                        opacity: 1; 
                        transform: scale(1) translateY(0);
                    }
                }
                
                /* Search Input Focus - ElysiaJS Style */
                .search-input {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    background: rgba(30, 41, 59, 0.5);
                    border-color: var(--elysia-border);
                    color: var(--elysia-text-primary);
                    backdrop-filter: blur(8px);
                }
                .search-input:focus {
                    transform: scale(1.01);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
                    border-color: var(--elysia-primary);
                    background: rgba(30, 41, 59, 0.8);
                }
                .search-input::placeholder {
                    color: var(--elysia-text-muted);
                }
                
                /* Button Animations - ElysiaJS Style */
                .btn-animated {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    background: linear-gradient(135deg, var(--elysia-primary) 0%, var(--elysia-primary-dark) 100%);
                }
                .btn-animated:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
                }
                .btn-animated:active {
                    transform: translateY(0);
                }
                
                /* Notification Animations */
                .notification {
                    animation: notificationSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                @keyframes notificationSlideIn {
                    from { 
                        opacity: 0; 
                        transform: translateX(100%) translateY(-50%);
                    }
                    to { 
                        opacity: 1; 
                        transform: translateX(0) translateY(0);
                    }
                }
                
                /* Priority and Status Colors - ElysiaJS Dark Theme */
                .status-1 { 
                    background: rgba(59, 130, 246, 0.2); 
                    color: #93c5fd; 
                    border: 1px solid rgba(59, 130, 246, 0.3);
                }
                .status-2 { 
                    background: rgba(245, 158, 11, 0.2); 
                    color: #fbbf24; 
                    border: 1px solid rgba(245, 158, 11, 0.3);
                }
                .status-3 { 
                    background: rgba(251, 146, 60, 0.2); 
                    color: #fb923c; 
                    border: 1px solid rgba(251, 146, 60, 0.3);
                }
                .status-6 { 
                    background: rgba(16, 185, 129, 0.2); 
                    color: #6ee7b7; 
                    border: 1px solid rgba(16, 185, 129, 0.3);
                }
                .status-7 { 
                    background: rgba(107, 114, 128, 0.2); 
                    color: #d1d5db; 
                    border: 1px solid rgba(107, 114, 128, 0.3);
                }
                .status-8 { 
                    background: rgba(239, 68, 68, 0.2); 
                    color: #fca5a5; 
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }
                .priority-1 { 
                    background: rgba(239, 68, 68, 0.2); 
                    color: #fca5a5; 
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }
                .priority-2 { 
                    background: rgba(251, 146, 60, 0.2); 
                    color: #fb923c; 
                    border: 1px solid rgba(251, 146, 60, 0.3);
                }
                .priority-3 { 
                    background: rgba(245, 158, 11, 0.2); 
                    color: #fbbf24; 
                    border: 1px solid rgba(245, 158, 11, 0.3);
                }
                .priority-4 { 
                    background: rgba(16, 185, 129, 0.2); 
                    color: #6ee7b7; 
                    border: 1px solid rgba(16, 185, 129, 0.3);
                }
                .priority-5 { 
                    background: rgba(59, 130, 246, 0.2); 
                    color: #93c5fd; 
                    border: 1px solid rgba(59, 130, 246, 0.3);
                }
                
                /* Code/System Information Styling - ElysiaJS Theme */
                .code-style {
                    background: var(--elysia-bg-primary);
                    border: 1px solid var(--elysia-border);
                    border-radius: 0.5rem;
                    padding: 1rem;
                    font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
                    color: var(--elysia-text-secondary);
                }
                
                /* ElysiaJS Blue Gradient Accent */
                .elysia-gradient {
                    background: linear-gradient(135deg, var(--elysia-primary) 0%, var(--elysia-secondary) 100%);
                }
                
                /* Typography Improvements */
                .elysia-text-primary { color: var(--elysia-text-primary); }
                .elysia-text-secondary { color: var(--elysia-text-secondary); }
                .elysia-text-muted { color: var(--elysia-text-muted); }
            </style>
        </head>
        <body class="bg-slate-900 min-h-screen text-gray-100">
            <div class="container mx-auto px-4 py-6">
                
                <!-- Header - ElysiaJS Theme -->
                <header class="mb-8">
                    <div class="flex items-center justify-between">
                        <div>
                            <h1 class="text-4xl font-bold elysia-text-primary mb-2 flex items-center">
                                <div class="w-10 h-10 elysia-gradient rounded-lg mr-4 flex items-center justify-center">
                                    <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2L2 7v10c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V7l-10-5z"/>
                                    </svg>
                                </div>
                                BunSNC Dashboard
                            </h1>
                            <p class="elysia-text-secondary">ServiceNow Real-time Management System powered by Elysia</p>
                        </div>
                        <div class="text-right">
                            <div class="text-sm elysia-text-muted">Real-time Integration</div>
                            <div class="text-xs elysia-text-muted font-mono">Bun + HTMX + ServiceNow</div>
                        </div>
                    </div>
                    
                    <!-- Health Status -->
                    <div id="health-status" 
                         hx-get="/htmx/health" 
                         hx-trigger="load, every 30s"
                         class="mt-4 p-2 rounded-lg">
                    </div>
                </header>

                <!-- Metrics Cards -->
                <section id="metrics-section" 
                         hx-get="/htmx/metrics" 
                         hx-trigger="load, every 60s"
                         class="mb-6">
                    <div class="text-center py-8">⏳ Carregando métricas...</div>
                </section>

                <!-- Search and Filters -->
                <section class="search-container mb-6">
                    <div hx-get="/htmx/search-form" 
                         hx-trigger="load"
                         hx-target="#search-container">
                        <div class="text-center py-4">⏳ Carregando filtros...</div>
                    </div>
                    <div id="search-container"></div>
                </section>

                <!-- Results Section -->
                <section>
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-semibold text-gray-900">Chamados</h2>
                        <div class="flex space-x-2">
                            <button class="btn-active px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
                                    hx-get="/htmx/tickets?type=active"
                                    hx-target="#tickets-list">
                                Ativos
                            </button>
                            <button class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                                    hx-get="/htmx/tickets?type=resolved"
                                    hx-target="#tickets-list">
                                Finalizados
                            </button>
                        </div>
                    </div>
                    
                    <div id="tickets-list" 
                         hx-get="/htmx/tickets?type=active" 
                         hx-trigger="load"
                         class="space-y-2">
                        <div class="text-center py-8">⏳ Carregando chamados...</div>
                    </div>

                    <!-- Load More Button -->
                    <div id="load-more-container" class="mt-4 text-center">
                        <!-- Will be populated by ticket list response -->
                    </div>
                </section>

                <!-- Real-time Updates via WebSocket -->
                <div hx-ext="ws" 
                     ws-connect="/ws/dashboard" 
                     hx-trigger="wsMessage"
                     id="ws-updates">
                </div>

            </div>

            <!-- Global notification area -->
            <div id="notifications" class="fixed top-4 right-4 space-y-2" style="z-index: 1000;"></div>

            <script>
                // Custom HTMX configurations
                htmx.config.requestClass = 'htmx-request';
                htmx.config.defaultSwapStyle = 'innerHTML';
                
                // Global utilities for smooth UX
                window.BunSNC = {
                    // Show notification
                    showNotification: function(message, type = 'success') {
                        const notification = document.createElement('div');
                        notification.className = \`notification fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm \${
                            type === 'success' ? 'bg-green-500 text-white' : 
                            type === 'error' ? 'bg-red-500 text-white' : 
                            'bg-blue-500 text-white'
                        }\`;
                        notification.innerHTML = \`
                            <div class="flex items-center">
                                <div class="mr-3">
                                    \${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}
                                </div>
                                <div class="flex-1">\${message}</div>
                                <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-white opacity-70 hover:opacity-100">✕</button>
                            </div>
                        \`;
                        document.body.appendChild(notification);
                        
                        // Auto-remove after 5 seconds
                        setTimeout(() => {
                            if (notification.parentElement) {
                                notification.style.animation = 'fadeOut 0.3s ease-out';
                                setTimeout(() => notification.remove(), 300);
                            }
                        }, 5000);
                    },
                    
                    // Close modal with animation
                    closeModal: function(modalId) {
                        const modal = document.getElementById(modalId);
                        if (modal) {
                            modal.style.animation = 'fadeOut 0.3s ease-out';
                            setTimeout(() => modal.remove(), 300);
                        }
                    },
                    
                    // Loading skeleton for search results
                    showLoadingSkeleton: function() {
                        return \`
                            <div class="space-y-4">
                                \${Array(3).fill().map(() => \`
                                    <div class="ticket-card p-6">
                                        <div class="flex justify-between items-start mb-3">
                                            <div class="flex items-center space-x-3">
                                                <div class="loading-skeleton h-6 w-20"></div>
                                                <div class="loading-skeleton h-5 w-16"></div>
                                                <div class="loading-skeleton h-5 w-8"></div>
                                            </div>
                                            <div class="loading-skeleton h-4 w-20"></div>
                                        </div>
                                        <div class="loading-skeleton h-5 w-full mb-2"></div>
                                        <div class="loading-skeleton h-4 w-3/4"></div>
                                    </div>
                                \`).join('')}
                            </div>
                        \`;
                    }
                };
                
                // Handle WebSocket messages for real-time updates
                document.body.addEventListener('wsMessage', function(event) {
                    const data = JSON.parse(event.detail.message);
                    if (data.type === 'metrics_updated') {
                        htmx.trigger('#metrics-section', 'refresh');
                        BunSNC.showNotification('Métricas atualizadas', 'info');
                    } else if (data.type === 'ticket_updated') {
                        htmx.trigger('#tickets-list', 'refresh');
                        BunSNC.showNotification('Lista de tickets atualizada', 'info');
                    }
                });

                // Auto-refresh on visibility change (user returns to tab)
                document.addEventListener('visibilitychange', function() {
                    if (!document.hidden) {
                        htmx.trigger('#metrics-section', 'refresh');
                        htmx.trigger('#tickets-list', 'refresh');
                    }
                });
                
                // Handle search loading states
                document.body.addEventListener('htmx:beforeRequest', function(event) {
                    if (event.target.name === 'query' || event.detail.pathInfo.requestPath.includes('/search')) {
                        const resultsContainer = document.getElementById('search-results');
                        if (resultsContainer) {
                            resultsContainer.innerHTML = BunSNC.showLoadingSkeleton();
                        }
                    }
                });
                
                // Handle successful requests
                document.body.addEventListener('htmx:afterRequest', function(event) {
                    if (event.detail.successful && event.detail.pathInfo.requestPath.includes('/search')) {
                        // Add fade-in animation to results
                        const results = document.querySelectorAll('#search-results .ticket-card');
                        results.forEach((card, index) => {
                            card.style.animationDelay = \`\${index * 0.1}s\`;
                            card.classList.add('fade-in');
                        });
                    }
                });
                
                // Handle errors gracefully
                document.body.addEventListener('htmx:responseError', function(event) {
                    BunSNC.showNotification(
                        'Erro ao comunicar com o ServiceNow. Verifique sua conexão.', 
                        'error'
                    );
                });
                
                // Keyboard shortcuts
                document.addEventListener('keydown', function(event) {
                    // ESC to close modal
                    if (event.key === 'Escape') {
                        const modal = document.getElementById('ticket-modal');
                        if (modal) {
                            BunSNC.closeModal('ticket-modal');
                        }
                    }
                    
                    // Ctrl+K or Cmd+K to focus search
                    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                        event.preventDefault();
                        const searchInput = document.querySelector('input[name="query"]');
                        if (searchInput) {
                            searchInput.focus();
                        }
                    }
                });
            </script>
        </body>
        </html>
      `;
    }
    
    // HTMX partial response
    return '<div>Dashboard updated via HTMX</div>';
  })

  /**
   * Search tickets by number or keywords
   */
  .get('/search', async ({ query }) => {
    const { query: searchQuery, table, state, priority } = query as any;
    
    if (!searchQuery || searchQuery.trim().length < 2) {
      return `
        <div class="text-center py-12 text-gray-500">
          <div class="text-6xl mb-4">🎫</div>
          <h3 class="text-xl font-medium mb-2">Pronto para buscar</h3>
          <p>Digite um número de ticket ou palavras-chave para começar</p>
        </div>
      `;
    }

    try {
      // Determine if searching by ticket number or keywords
      const isTicketNumber = /^(INC|SCTASK|CTASK)\d+$/i.test(searchQuery.trim());
      
      let results = [];
      
      if (isTicketNumber) {
        // Search by specific ticket number
        const ticketNumber = searchQuery.trim().toLowerCase();
        let tableName = 'incident';
        
        if (ticketNumber.startsWith('sctask')) {
          tableName = 'sc_task';
        } else if (ticketNumber.startsWith('ctask')) {
          tableName = 'change_task';
        }
        
        // Use ServiceNowAuthClient to search for specific ticket
        const ticketData = await serviceNowAuthClient.makeRequest(
          tableName,
          'GET',
          { sysparm_query: `number=${searchQuery.trim()}` }
        );
        
        if (ticketData && ticketData.result && ticketData.result.length > 0) {
          results = ticketData.result.map((ticket: any) => ({
            ...ticket,
            table_name: tableName
          }));
        }
      } else {
        // Search by keywords across multiple tables
        const tablesToSearch = table ? [table] : ['incident', 'sc_task', 'change_task'];
        
        for (const tableName of tablesToSearch) {
          try {
            let query = `short_descriptionLIKE${searchQuery}`;
            if (state) query += `^state=${state}`;
            if (priority) query += `^priority=${priority}`;
            
            const response = await serviceNowAuthClient.makeRequest(
              tableName,
              'GET',
              { 
                sysparm_query: query,
                sysparm_limit: '10',
                sysparm_fields: 'sys_id,number,short_description,description,state,priority,assignment_group,assigned_to,sys_created_on,sys_updated_on'
              }
            );
            
            if (response && response.result) {
              const tableResults = response.result.map((ticket: any) => ({
                ...ticket,
                table_name: tableName
              }));
              results.push(...tableResults);
            }
          } catch (error) {
            console.error(`Error searching ${tableName}:`, error);
          }
        }
      }
      
      if (results.length === 0) {
        return `
          <div class="text-center py-12">
            <div class="text-6xl mb-4 text-gray-400">😔</div>
            <h3 class="text-xl font-medium text-gray-700 mb-2">Nenhum resultado encontrado</h3>
            <p class="text-gray-500">Tente outros termos de busca ou verifique o número do ticket</p>
          </div>
        `;
      }
      
      // Render results
      return `
        <div class="space-y-4">
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-lg font-semibold text-gray-800">
              🎯 ${results.length} resultado${results.length > 1 ? 's' : ''} encontrado${results.length > 1 ? 's' : ''}
            </h3>
            <div class="text-sm text-gray-500">
              Busca por: "<span class="font-medium">${searchQuery}</span>"
            </div>
          </div>
          
          <div class="grid gap-4">
            ${results.map(ticket => `
              <div class="ticket-card p-6" 
                   hx-get="/htmx/ticket/${ticket.sys_id}/${ticket.table_name}" 
                   hx-target="#ticket-details" 
                   hx-swap="innerHTML">
                <div class="flex justify-between items-start mb-3">
                  <div class="flex items-center space-x-3">
                    <span class="text-lg font-bold text-blue-600">${ticket.number}</span>
                    <span class="px-2 py-1 rounded text-xs font-medium status-${ticket.state}">
                      ${getStateLabel(ticket.state)}
                    </span>
                    <span class="px-2 py-1 rounded text-xs font-medium priority-${ticket.priority}">
                      P${ticket.priority}
                    </span>
                    <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                      ${getTableLabel(ticket.table_name)}
                    </span>
                  </div>
                  <div class="text-sm text-gray-500">
                    ${new Date(ticket.sys_created_on).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                
                <h4 class="font-medium text-gray-900 mb-2">${ticket.short_description}</h4>
                
                <div class="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <div>
                    <span class="font-medium">Grupo:</span> ${ticket.assignment_group || 'Não atribuído'}
                  </div>
                  <div>
                    <span class="font-medium">Responsável:</span> ${ticket.assigned_to || 'Não atribuído'}
                  </div>
                </div>
                
                <div class="mt-4 text-right">
                  <button 
                    class="text-blue-600 hover:text-blue-800 text-sm font-medium" 
                    hx-get="/ticket-details/${ticket.sys_id}/incident" 
                    hx-target="#ticket-details"
                    hx-swap="innerHTML"
                    hx-indicator="#loading-indicator"
                  >
                    Ver detalhes completos →
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Ticket Details Modal Placeholder -->
        <div id="ticket-details" class="mt-8"></div>
        
        <!-- Loading Indicator -->
        <div id="loading-indicator" class="htmx-indicator fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div class="bg-gray-800 rounded-lg p-6 flex items-center space-x-3">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-elysia-blue"></div>
            <span class="text-white">Carregando detalhes...</span>
          </div>
        </div>
        
        <script>
          function getStateLabel(state) {
            const states = {
              '1': 'Novo', '2': 'Em Andamento', '3': 'Em Espera',
              '6': 'Resolvido', '7': 'Fechado', '8': 'Cancelado'
            };
            return states[state] || 'Desconhecido';
          }
          
          function getTableLabel(table) {
            const labels = {
              'incident': 'Incident',
              'sc_task': 'SC Task', 
              'change_task': 'Change Task'
            };
            return labels[table] || table;
          }
        </script>
      `;
      
    } catch (error) {
      console.error('Search error:', error);
      return `
        <div class="text-center py-12">
          <div class="text-6xl mb-4 text-red-400">⚠️</div>
          <h3 class="text-xl font-medium text-red-700 mb-2">Erro na busca</h3>
          <p class="text-red-600">${error instanceof Error ? error.message : 'Erro desconhecido'}</p>
          <button class="mt-4 text-blue-600 hover:text-blue-800" onclick="location.reload()">
            Tentar novamente
          </button>
        </div>
      `;
    }
  })

  /**
   * Health status component
   */
  .get('/health', async () => {
    // const dbHealth = await serviceNowRepository.getHealthStats();
    const dbHealth = { connected: true, queries: 0, performance: 'good' };
    // const streamHealth = await serviceNowStreams.healthCheck();
    const streamHealth = { status: 'connected', streams: ['incident', 'problem', 'change'] };
    const rateLimitHealth = serviceNowRateLimiter.getHealthStatus();

    const overallStatus = 
      streamHealth.status === 'healthy' && 
      rateLimitHealth.status === 'healthy' ? 'healthy' : 'degraded';

    const statusColor = overallStatus === 'healthy' ? 'green' : 'yellow';

    return `
      <div class="flex items-center space-x-4 p-3 bg-${statusColor}-50 border border-${statusColor}-200 rounded-lg">
        <div class="flex-shrink-0">
          <div class="h-2 w-2 bg-${statusColor}-500 rounded-full"></div>
        </div>
        <div class="flex-1">
          <div class="text-sm font-medium text-${statusColor}-800">
            Sistema: ${overallStatus === 'healthy' ? 'Operacional' : 'Degradado'}
          </div>
          <div class="text-xs text-${statusColor}-600">
            DB: ${Object.values(dbHealth.table_counts).reduce((a: number, b: number) => a + b, 0)} tickets | 
            Streams: ${streamHealth.status} | 
            Rate Limit: ${rateLimitHealth.details.metrics.currentConcurrentRequests}/${rateLimitHealth.details.config.maxConcurrentRequests} conexões
          </div>
        </div>
        <div class="text-xs text-${statusColor}-600">
          ${new Date().toLocaleTimeString('pt-BR')}
        </div>
      </div>
    `;
  })

  /**
   * Metrics cards component
   */
  .get('/metrics', async () => {
    // const metrics = await serviceNowRepository.getServiceNowMetrics();
    const metrics = {
      incidents: { active: 25, resolved: 150, total: 175 },
      problems: { active: 5, resolved: 45, total: 50 },
      changes: { pending: 8, approved: 32, total: 40 },
      performance: { avgResponseTime: 850, successRate: 0.98 }
    };
    const rateLimitMetrics = serviceNowRateLimiter.getMetrics();

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="metric-card">
          <div class="text-2xl font-bold text-blue-600">${metrics.total_tickets.toLocaleString()}</div>
          <div class="text-sm text-gray-600">Total de Chamados</div>
        </div>
        
        <div class="metric-card">
          <div class="text-2xl font-bold text-green-600">${metrics.resolved_tickets.toLocaleString()}</div>
          <div class="text-sm text-gray-600">Finalizados</div>
          <div class="text-xs text-gray-500">
            ${Math.round((metrics.resolved_tickets / metrics.total_tickets) * 100)}% do total
          </div>
        </div>
        
        <div class="metric-card">
          <div class="text-2xl font-bold text-yellow-600">${metrics.active_tickets.toLocaleString()}</div>
          <div class="text-sm text-gray-600">Ativos</div>
          <div class="text-xs text-gray-500">
            Tempo médio: ${metrics.response_time_avg}h
          </div>
        </div>
        
        <div class="metric-card">
          <div class="text-2xl font-bold text-purple-600">${rateLimitMetrics.totalRequests.toLocaleString()}</div>
          <div class="text-sm text-gray-600">Requests Processados</div>
          <div class="text-xs text-gray-500">
            ${Math.round((rateLimitMetrics.successfulRequests / rateLimitMetrics.totalRequests) * 100)}% sucesso
          </div>
        </div>
      </div>

      <!-- Breakdown by type -->
      <div class="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 class="font-semibold text-gray-900 mb-3">Por Tipo de Chamado</h3>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <div class="text-lg font-bold text-red-600">${metrics.by_type.incidents.toLocaleString()}</div>
            <div class="text-xs text-gray-600">Incidents</div>
          </div>
          <div>
            <div class="text-lg font-bold text-blue-600">${metrics.by_type.change_tasks.toLocaleString()}</div>
            <div class="text-xs text-gray-600">Change Tasks</div>
          </div>
          <div>
            <div class="text-lg font-bold text-green-600">${metrics.by_type.service_catalog_tasks.toLocaleString()}</div>
            <div class="text-xs text-gray-600">Service Catalog</div>
          </div>
        </div>
      </div>
    `;
  })

  /**
   * Search form component
   */
  .get('/search-form', () => {
    return `
      <div class="space-y-6 fade-in">
        
        <!-- Primary Search Bar -->
        <div class="text-center">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Buscar Tickets ServiceNow</h3>
          <form hx-get="/htmx/search" 
                hx-target="#search-results" 
                hx-trigger="submit, keyup delay:800ms changed"
                hx-indicator="#search-loading"
                class="max-w-2xl mx-auto">
            
            <div class="relative">
              <input type="text" 
                     name="query" 
                     placeholder="Digite o número do ticket (INC0012345, SCTASK0067890, CTASK0034567) ou palavras-chave..."
                     class="search-input w-full px-6 py-4 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                     autocomplete="off">
              
              <!-- Search Icon -->
              <div class="absolute right-4 top-1/2 transform -translate-y-1/2">
                <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
              </div>
              
              <!-- Loading Indicator -->
              <div id="search-loading" class="htmx-indicator absolute right-12 top-1/2 transform -translate-y-1/2">
                <div class="spinner"></div>
              </div>
            </div>
            
            <!-- Search Examples -->
            <div class="mt-3 text-sm text-gray-500">
              <p>Exemplos: <span class="font-mono">INC0012345</span>, <span class="font-mono">SCTASK0067890</span>, <span class="font-mono">falha de rede</span></p>
            </div>
          </form>
        </div>
        
        <!-- Search Results Container -->
        <div id="search-results" class="min-h-[100px]">
          <div class="text-center py-12 text-gray-500">
            <div class="text-4xl mb-4">🔍</div>
            <p>Digite acima para buscar tickets</p>
          </div>
        </div>
        
        <!-- Advanced Filters (Collapsible) -->
        <div class="border-t pt-6">
          <button type="button" 
                  onclick="document.getElementById('advanced-filters').classList.toggle('hidden')"
                  class="btn-animated text-sm text-gray-600 hover:text-gray-800 flex items-center">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path>
            </svg>
            Filtros Avançados
          </button>
          
          <div id="advanced-filters" class="hidden mt-4 fade-in">
            <form hx-get="/htmx/tickets" 
                  hx-target="#tickets-list" 
                  hx-trigger="submit, change delay:500ms"
                  class="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select name="ticketType" 
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all duration-200">
                  <option value="">Todos</option>
                  <option value="incident">Incidents</option>
                  <option value="change_task">Change Tasks</option>
                  <option value="sc_task">Service Catalog</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select name="status" 
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all duration-200">
                  <option value="">Todos</option>
                  <option value="1">Novo/Pending</option>
                  <option value="2">Em Andamento/Open</option>
                  <option value="3">Em Espera/WIP</option>
                  <option value="6">Resolvido</option>
                  <option value="7">Fechado</option>
                  <option value="8">Cancelado</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                <select name="priority" 
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all duration-200">
                  <option value="">Todas</option>
                  <option value="1">1 - Crítica</option>
                  <option value="2">2 - Alta</option>
                  <option value="3">3 - Moderada</option>
                  <option value="4">4 - Baixa</option>
                  <option value="5">5 - Planning</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Grupo</label>
                <input type="text" 
                       name="assignmentGroup" 
                       placeholder="Grupo de atribuição"
                       class="search-input w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              </div>
              
              <div class="md:col-span-4 flex justify-end space-x-2 mt-4">
                <button type="button" 
                        onclick="this.form.reset(); htmx.trigger(this.form, 'submit')"
                        class="btn-animated px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg">
                  Limpar
                </button>
                <button type="submit" 
                        class="btn-animated px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  Aplicar Filtros
                </button>
              </div>
            </form>
          </div>
        </div>
        
        <div class="flex justify-between items-center">
          <div class="flex space-x-2">
            <button type="button" 
                    class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    onclick="this.form.reset(); htmx.trigger(this.form, 'submit')">
              Limpar Filtros
            </button>
          </div>
          
          <button type="submit" 
                  class="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500">
            Buscar
          </button>
        </div>
      </form>
    `;
  })

  /**
   * Tickets list component with pagination
   */
  .get('/tickets', async ({ query: params, hx }) => {
    const {
      type = 'active',
      search = '',
      ticketType = '',
      status = '',
      assignmentGroup = '',
      page = '1'
    } = params as any;

    const limit = 20;
    const offset = (parseInt(page) - 1) * limit;

    let tickets;
    
    if (search || ticketType || status || assignmentGroup) {
      // Use search with filters
      // tickets = await serviceNowRepository.searchTickets(
      //   search, 
      //   ticketType, 
      //   status, 
      //   assignmentGroup, 
      //   undefined, 
      //   undefined, 
      //   limit, 
      //   offset
      // );
      tickets = [
        { sys_id: '1', number: 'INC0012345', short_description: `Busca: ${search}`, state: status || '1', priority: '3', sys_created_on: new Date().toISOString() },
        { sys_id: '2', number: 'PRB0067890', short_description: 'Problema exemplo', state: '1', priority: '2', sys_created_on: new Date().toISOString() }
      ];
    } else if (type === 'resolved') {
      // tickets = await serviceNowRepository.getResolvedTickets(limit, offset);
      tickets = [
        { sys_id: '3', number: 'INC0056789', short_description: 'Chamado resolvido exemplo', state: '6', priority: '4', sys_created_on: new Date(Date.now() - 24*60*60*1000).toISOString() }
      ];
    } else {
      // tickets = await serviceNowRepository.getActiveTickets(limit, offset);
      tickets = [
        { sys_id: '4', number: 'INC0078901', short_description: 'Chamado ativo exemplo', state: '2', priority: '2', sys_created_on: new Date().toISOString() },
        { sys_id: '5', number: 'CHG0012345', short_description: 'Change request exemplo', state: '1', priority: '3', sys_created_on: new Date().toISOString() }
      ];
    }

    const hasMore = tickets.length === limit;
    const nextPage = parseInt(page) + 1;

    function getStatusBadgeClass(status: string, statusText: string): string {
      if (statusText.includes('Resolvido') || statusText.includes('Fechado Completo')) return 'status-resolvido';
      if (statusText.includes('Fechado') || statusText.includes('Cancelado')) return 'status-fechado';
      if (statusText.includes('Andamento') || statusText.includes('Open') || statusText.includes('WIP')) return 'status-andamento';
      if (statusText.includes('Novo') || statusText.includes('Pending')) return 'status-novo';
      return 'bg-gray-100 text-gray-800';
    }

    const ticketsList = tickets.map(ticket => `
      <div class="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1">
            <div class="flex items-center space-x-2 mb-1">
              <span class="font-semibold text-gray-900">${ticket.numero}</span>
              <span class="status-badge ${getStatusBadgeClass(ticket.estado_numero, ticket.status_portugues)}">
                ${ticket.status_portugues}
              </span>
              <span class="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
                ${ticket.tipo_chamado.replace('_', ' ')}
              </span>
            </div>
            <p class="text-sm text-gray-700 mb-2">${ticket.descricao || 'Sem descrição'}</p>
            <div class="text-xs text-gray-500">
              Grupo: ${ticket.grupo_atribuicao || 'Não atribuído'}
              ${ticket.data_fechamento ? ` | Fechado: ${new Date(ticket.data_fechamento).toLocaleDateString('pt-BR')}` : ''}
            </div>
          </div>
          <div class="flex-shrink-0 ml-4">
            <button class="text-blue-600 hover:text-blue-800 text-sm"
                    hx-get="/htmx/ticket/${ticket.sys_id}/${ticket.tipo_chamado}"
                    hx-target="#ticket-modal"
                    hx-trigger="click">
              Ver Detalhes
            </button>
          </div>
        </div>
      </div>
    `).join('');

    const loadMoreButton = hasMore ? `
      <button class="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
              hx-get="/htmx/tickets?${new URLSearchParams({...params, page: nextPage.toString()}).toString()}"
              hx-target="#tickets-list"
              hx-swap="beforeend"
              hx-select=".bg-white.border">
        Carregar Mais (página ${nextPage})
      </button>
    ` : '';

    // Only return tickets if it's a pagination request (page > 1)
    if (parseInt(page) > 1 && hx.request) {
      return ticketsList;
    }

    // Full response with load more button
    return `
      ${ticketsList}
      <div id="load-more-container" class="mt-4">
        ${loadMoreButton}
      </div>
    `;
  })

  /**
   * Complete ticket details with SLA information
   */
  .get('/ticket/:sysId/:table', async ({ params: { sysId, table } }) => {
    try {
      // Get ticket details from ServiceNow
      const ticketResponse = await serviceNowAuthClient.makeRequest(
        table,
        'GET',
        { 
          sysparm_query: `sys_id=${sysId}`,
          sysparm_fields: 'sys_id,number,short_description,description,state,priority,urgency,impact,category,subcategory,assignment_group,assigned_to,caller_id,sys_created_on,sys_updated_on,work_notes,close_notes,resolution_code,resolved_at,closed_at'
        }
      );

      if (!ticketResponse?.result || ticketResponse.result.length === 0) {
        return `
          <div class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div class="text-red-400 text-4xl mb-4">❌</div>
            <h3 class="text-lg font-medium text-red-800 mb-2">Ticket não encontrado</h3>
            <p class="text-red-600">O ticket solicitado não foi encontrado no sistema.</p>
          </div>
        `;
      }

      const ticket = ticketResponse.result[0];

      // Get SLA information for this ticket
      let slaInfo = null;
      try {
        const slaResponse = await serviceNowAuthClient.makeRequest(
          'task_sla',
          'GET',
          {
            sysparm_query: `task=${sysId}`,
            sysparm_fields: 'sys_id,sla,stage,percentage,business_percentage,has_breached,breach_time,business_time_left,time_left,start_time,end_time,business_duration,duration'
          }
        );
        
        if (slaResponse?.result && slaResponse.result.length > 0) {
          slaInfo = slaResponse.result;
        }
      } catch (slaError) {
        console.warn('SLA information not available:', slaError);
      }

      // Helper functions for displaying data
      function getStateLabel(state) {
        const states = {
          '1': { label: 'Novo', color: 'bg-blue-100 text-blue-800' },
          '2': { label: 'Em Andamento', color: 'bg-yellow-100 text-yellow-800' },
          '3': { label: 'Em Espera', color: 'bg-orange-100 text-orange-800' },
          '6': { label: 'Resolvido', color: 'bg-green-100 text-green-800' },
          '7': { label: 'Fechado', color: 'bg-gray-100 text-gray-800' },
          '8': { label: 'Cancelado', color: 'bg-red-100 text-red-800' }
        };
        return states[state] || { label: 'Desconhecido', color: 'bg-gray-100 text-gray-800' };
      }

      function getPriorityLabel(priority) {
        const priorities = {
          '1': { label: 'Crítica', color: 'bg-red-100 text-red-800' },
          '2': { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
          '3': { label: 'Moderada', color: 'bg-yellow-100 text-yellow-800' },
          '4': { label: 'Baixa', color: 'bg-green-100 text-green-800' },
          '5': { label: 'Planning', color: 'bg-blue-100 text-blue-800' }
        };
        return priorities[priority] || { label: 'N/A', color: 'bg-gray-100 text-gray-800' };
      }

      function formatSlaTime(timeString) {
        if (!timeString) return 'N/A';
        try {
          const date = new Date(timeString);
          return date.toLocaleString('pt-BR');
        } catch {
          return timeString;
        }
      }

      function calculateTimeRemaining(timeLeft) {
        if (!timeLeft) return 'N/A';
        
        // Convert to milliseconds if it's a duration string
        let ms = parseInt(timeLeft);
        if (isNaN(ms)) return timeLeft;
        
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      }

      const stateInfo = getStateLabel(ticket.state);
      const priorityInfo = getPriorityLabel(ticket.priority);
      
      return `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 modal-backdrop" id="ticket-modal">
          <div class="bg-white rounded-xl shadow-2xl p-6 max-w-4xl w-full m-4 max-h-[90vh] overflow-y-auto modal-content">
            
            <!-- Header -->
            <div class="flex justify-between items-start mb-6 pb-4 border-b border-gray-200">
              <div class="flex items-center space-x-4">
                <h2 class="text-2xl font-bold text-gray-900">${ticket.number}</h2>
                <span class="px-3 py-1 rounded-full text-sm font-medium ${stateInfo.color}">
                  ${stateInfo.label}
                </span>
                <span class="px-3 py-1 rounded-full text-sm font-medium ${priorityInfo.color}">
                  Prioridade ${priorityInfo.label}
                </span>
              </div>
              <button class="text-gray-400 hover:text-gray-600 text-2xl transition-colors"
                      onclick="BunSNC.closeModal('ticket-modal')">
                ✕
              </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Main Content -->
              <div class="lg:col-span-2 space-y-6">
                
                <!-- Basic Information -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <h3 class="font-semibold text-gray-900 mb-4">Informações Básicas</h3>
                  <div class="space-y-3">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Descrição Breve</label>
                      <p class="text-gray-900 font-medium">${ticket.short_description || 'N/A'}</p>
                    </div>
                    ${ticket.description ? `
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Descrição Completa</label>
                        <div class="bg-white border rounded-lg p-3 max-h-40 overflow-y-auto">
                          <p class="text-gray-800 text-sm whitespace-pre-wrap">${ticket.description}</p>
                        </div>
                      </div>
                    ` : ''}
                  </div>
                </div>

                <!-- Assignment Information -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <h3 class="font-semibold text-gray-900 mb-4">Atribuições</h3>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Grupo de Atribuição</label>
                      <p class="text-gray-900">${ticket.assignment_group?.display_value || ticket.assignment_group || 'Não atribuído'}</p>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Atribuído a</label>
                      <p class="text-gray-900">${ticket.assigned_to?.display_value || ticket.assigned_to || 'Não atribuído'}</p>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Solicitante</label>
                      <p class="text-gray-900">${ticket.caller_id?.display_value || ticket.caller_id || 'N/A'}</p>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                      <p class="text-gray-900">${ticket.category || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <!-- Timeline -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <h3 class="font-semibold text-gray-900 mb-4">Timeline</h3>
                  <div class="space-y-3">
                    <div class="flex justify-between items-center py-2 border-l-4 border-blue-400 pl-4">
                      <div>
                        <div class="font-medium text-gray-900">Criado</div>
                        <div class="text-sm text-gray-600">${formatSlaTime(ticket.sys_created_on)}</div>
                      </div>
                    </div>
                    ${ticket.sys_updated_on !== ticket.sys_created_on ? `
                      <div class="flex justify-between items-center py-2 border-l-4 border-yellow-400 pl-4">
                        <div>
                          <div class="font-medium text-gray-900">Última Atualização</div>
                          <div class="text-sm text-gray-600">${formatSlaTime(ticket.sys_updated_on)}</div>
                        </div>
                      </div>
                    ` : ''}
                    ${ticket.resolved_at ? `
                      <div class="flex justify-between items-center py-2 border-l-4 border-green-400 pl-4">
                        <div>
                          <div class="font-medium text-gray-900">Resolvido</div>
                          <div class="text-sm text-gray-600">${formatSlaTime(ticket.resolved_at)}</div>
                        </div>
                      </div>
                    ` : ''}
                    ${ticket.closed_at ? `
                      <div class="flex justify-between items-center py-2 border-l-4 border-gray-400 pl-4">
                        <div>
                          <div class="font-medium text-gray-900">Fechado</div>
                          <div class="text-sm text-gray-600">${formatSlaTime(ticket.closed_at)}</div>
                        </div>
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>

              <!-- SLA Sidebar -->
              <div class="space-y-6">
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                  <h3 class="font-semibold text-gray-900 mb-4 flex items-center">
                    <span class="text-blue-600 mr-2">⏱️</span>
                    SLA Information
                  </h3>
                  
                  ${slaInfo && slaInfo.length > 0 ? `
                    <div class="space-y-4">
                      ${slaInfo.map(sla => {
                        const percentage = parseInt(sla.business_percentage || sla.percentage || 0);
                        const isBreached = sla.has_breached === 'true' || sla.has_breached === true;
                        const timeLeft = calculateTimeRemaining(sla.business_time_left || sla.time_left);
                        
                        return `
                          <div class="bg-white rounded-lg p-3 border ${isBreached ? 'border-red-300' : 'border-gray-200'}">
                            <div class="flex items-center justify-between mb-2">
                              <div class="font-medium text-gray-900">${sla.sla?.display_value || 'SLA'}</div>
                              <span class="text-sm font-medium ${isBreached ? 'text-red-600' : percentage > 80 ? 'text-orange-600' : 'text-green-600'}">
                                ${percentage}%
                              </span>
                            </div>
                            
                            <!-- Progress Bar -->
                            <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                              <div class="h-2 rounded-full transition-all duration-300 ${isBreached ? 'bg-red-500' : percentage > 80 ? 'bg-orange-500' : 'bg-green-500'}" 
                                   style="width: ${Math.min(percentage, 100)}%"></div>
                            </div>
                            
                            <div class="grid grid-cols-1 gap-2 text-xs text-gray-600">
                              ${isBreached ? `
                                <div class="flex items-center text-red-600">
                                  <span class="mr-1">⚠️</span>
                                  <span class="font-medium">SLA Violado</span>
                                </div>
                                ${sla.breach_time ? `
                                  <div>Violado em: ${formatSlaTime(sla.breach_time)}</div>
                                ` : ''}
                              ` : `
                                <div class="flex items-center text-green-600">
                                  <span class="mr-1">✅</span>
                                  <span>Dentro do SLA</span>
                                </div>
                                <div>Tempo restante: ${timeLeft}</div>
                              `}
                              
                              ${sla.start_time ? `
                                <div>Iniciado: ${formatSlaTime(sla.start_time)}</div>
                              ` : ''}
                              ${sla.end_time ? `
                                <div>Prazo: ${formatSlaTime(sla.end_time)}</div>
                              ` : ''}
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  ` : `
                    <div class="text-center py-6 text-gray-500">
                      <div class="text-3xl mb-2">📊</div>
                      <p class="text-sm">Nenhuma informação de SLA disponível</p>
                    </div>
                  `}
                </div>

                <!-- Technical Details -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <h3 class="font-semibold text-gray-900 mb-4">Detalhes Técnicos</h3>
                  <div class="space-y-3 text-sm">
                    <div>
                      <label class="block font-medium text-gray-700 mb-1">Sys ID</label>
                      <p class="text-gray-600 font-mono text-xs break-all">${ticket.sys_id}</p>
                    </div>
                    <div>
                      <label class="block font-medium text-gray-700 mb-1">Tabela</label>
                      <p class="text-gray-600">${table}</p>
                    </div>
                    ${ticket.urgency ? `
                      <div>
                        <label class="block font-medium text-gray-700 mb-1">Urgência</label>
                        <p class="text-gray-600">${ticket.urgency}</p>
                      </div>
                    ` : ''}
                    ${ticket.impact ? `
                      <div>
                        <label class="block font-medium text-gray-700 mb-1">Impacto</label>
                        <p class="text-gray-600">${ticket.impact}</p>
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Footer -->
            <div class="flex justify-end space-x-3 mt-8 pt-4 border-t border-gray-200">
              <button class="btn-animated px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                      onclick="BunSNC.closeModal('ticket-modal')">
                Fechar
              </button>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Error loading ticket details:', error);
      return `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 modal-backdrop" id="ticket-modal">
          <div class="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full m-4 modal-content">
            <div class="text-center">
              <div class="text-red-400 text-4xl mb-4">❌</div>
              <h3 class="text-lg font-medium text-red-800 mb-2">Erro ao carregar ticket</h3>
              <p class="text-red-600 mb-4">Não foi possível carregar os detalhes do ticket.</p>
              <button class="btn-animated px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                      onclick="BunSNC.closeModal('ticket-modal')">
                Fechar
              </button>
            </div>
          </div>
        </div>
      `;
    }
  })

  /**
   * Statistics page component
   */
  .get('/statistics', async () => {
    // const stats = await serviceNowRepository.getStatusStatistics();
    const stats = {
      incident: { new: 10, in_progress: 15, resolved: 45 },
      problem: { new: 2, in_progress: 3, resolved: 12 },
      change: { new: 5, scheduled: 8, implement: 2, review: 3 }
    };
    const rateLimitStats = serviceNowRateLimiter.getHealthStatus();
    
    const groupedStats = stats.reduce((acc, stat) => {
      if (!acc[stat.tipo_chamado]) acc[stat.tipo_chamado] = [];
      acc[stat.tipo_chamado].push(stat);
      return acc;
    }, {} as Record<string, any[]>);

    const statsTable = Object.entries(groupedStats).map(([type, typeStats]) => `
      <div class="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 capitalize">${type.replace('_', ' ')}</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">%</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              ${typeStats.map(stat => `
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${stat.estado_numero}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${stat.status_portugues}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${stat.total_chamados.toLocaleString()}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${stat.percentual}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');

    return `
      <div class="space-y-6">
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 class="text-xl font-semibold text-blue-900 mb-2">Estatísticas por Status</h2>
          <p class="text-blue-700 text-sm">Distribuição de chamados por tipo e estado</p>
        </div>
        
        ${statsTable}
        
        <div class="bg-white rounded-lg shadow-sm border p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Rate Limiter Status</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="text-center">
              <div class="text-2xl font-bold text-green-600">${rateLimitStats.details.metrics.successfulRequests}</div>
              <div class="text-sm text-gray-600">Sucessos</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-red-600">${rateLimitStats.details.metrics.failedRequests}</div>
              <div class="text-sm text-gray-600">Falhas</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-yellow-600">${rateLimitStats.details.metrics.rateLimitedRequests}</div>
              <div class="text-sm text-gray-600">Rate Limited</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-blue-600">${rateLimitStats.details.metrics.averageResponseTime}ms</div>
              <div class="text-sm text-gray-600">Tempo Médio</div>
            </div>
          </div>
        </div>
      </div>
    `;
  });

export default htmxDashboard;