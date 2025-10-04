/**
 * Incidents Dashboard Route
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";

const app = new Elysia().use(html()).get("/dashboard/incidents", () => {
  return `
<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Incidents Dashboard - ServiceNow Analytics</title>
    <link href="/public/styles.css" rel="stylesheet">
    <script src="/ui/js/htmx.min.js" defer></script>
    <!-- AlpineJS removed - using HTMX only -->
    <script src="/ui/js/chart.umd.js" defer></script>
</head>
<body class="h-full bg-gray-50 font-sans antialiased">
    <div id="app" x-data="incidentsDashboard()" class="min-h-screen flex flex-col">
        <!-- Navigation Header -->
        <nav class="bg-white shadow-sm border-b border-gray-200">
            <div class="container mx-auto px-6 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <a href="/" class="flex items-center space-x-2">
                            <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                                </svg>
                            </div>
                            <h1 class="text-xl font-semibold text-gray-900">ServiceNow Analytics</h1>
                        </a>
                        
                        <!-- Navigation Links -->
                        <div class="hidden md:flex items-center space-x-8 ml-8">
                            <a href="/" class="nav-link-inactive">Dashboard</a>
                            <a href="/dashboard/incidents" class="nav-link-active">Incidents</a>
                            <a href="/dashboard/problems" class="nav-link-inactive">Problems</a>
                            <a href="/dashboard/changes" class="nav-link-inactive">Changes</a>
                            <a href="/real-time/monitoring" class="nav-link-inactive">Real-time</a>
                        </div>
                    </div>
                    
                    <!-- Export Actions -->
                    <div class="flex items-center space-x-4">
                        <button class="btn-secondary btn-sm"
                                hx-post="/api/incidents/export/parquet"
                                hx-target="#export-status"
                                hx-indicator="#export-spinner">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            Export Data
                        </button>
                        
                        <div class="flex items-center space-x-2">
                            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span class="text-sm text-gray-600">Live Data</span>
                        </div>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Main Content -->
        <main class="flex-1 overflow-hidden">
            <div class="container mx-auto px-6 py-8">
                <!-- Page Header -->
                <div class="mb-8">
                    <div class="flex items-center justify-between">
                        <div>
                            <h2 class="text-2xl font-bold text-gray-900 mb-2">Incidents Dashboard</h2>
                            <p class="text-gray-600">Monitor and analyze ServiceNow incident data in real-time</p>
                        </div>
                        
                        <!-- Quick Stats -->
                        <div class="flex items-center space-x-6">
                            <div class="text-center">
                                <div class="text-2xl font-bold text-red-600" x-text="stats.total">--</div>
                                <div class="text-sm text-gray-500">Total Active</div>
                            </div>
                            <div class="text-center">
                                <div class="text-2xl font-bold text-orange-600" x-text="stats.highPriority">--</div>
                                <div class="text-sm text-gray-500">High Priority</div>
                            </div>
                            <div class="text-center">
                                <div class="text-2xl font-bold text-blue-600" x-text="stats.avgResolution">--</div>
                                <div class="text-sm text-gray-500">Avg Resolution</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Filters and Search -->
                <div class="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-8">
                    <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <!-- Search -->
                        <div class="md:col-span-2">
                            <label class="form-label">Search Incidents</label>
                            <div class="relative">
                                <input type="text" 
                                       class="form-input pl-10" 
                                       placeholder="Search by description, number..."
                                       x-model="filters.search"
                                       @input.debounce.500ms="applyFilters()">
                                <div class="absolute inset-y-0 left-0 pl-3 flex items-center">
                                    <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        
                        <!-- State Filter -->
                        <div>
                            <label class="form-label">State</label>
                            <select class="form-select" 
                                    x-model="filters.state" 
                                    @change="applyFilters()">
                                <option value="all">All States</option>
                                <option value="1">New</option>
                                <option value="2">In Progress</option>
                                <option value="3">On Hold</option>
                                <option value="6">Resolved</option>
                                <option value="7">Closed</option>
                            </select>
                        </div>
                        
                        <!-- Priority Filter -->
                        <div>
                            <label class="form-label">Priority</label>
                            <select class="form-select" 
                                    x-model="filters.priority" 
                                    @change="applyFilters()">
                                <option value="all">All Priorities</option>
                                <option value="1">1 - Critical</option>
                                <option value="2">2 - High</option>
                                <option value="3">3 - Medium</option>
                                <option value="4">4 - Low</option>
                                <option value="5">5 - Planning</option>
                            </select>
                        </div>
                        
                        <!-- Assignment Group -->
                        <div>
                            <label class="form-label">Assignment Group</label>
                            <input type="text" 
                                   class="form-input" 
                                   placeholder="Filter by group..."
                                   x-model="filters.assignmentGroup"
                                   @input.debounce.500ms="applyFilters()">
                        </div>
                    </div>
                    
                    <!-- Active Filters Display -->
                    <div class="mt-4 flex items-center space-x-2" x-show="hasActiveFilters()">
                        <span class="text-sm font-medium text-gray-700">Active filters:</span>
                        <template x-for="filter in getActiveFilters()" :key="filter.key">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                <span x-text="filter.label"></span>
                                <button type="button" 
                                        class="flex-shrink-0 ml-1 h-4 w-4 rounded-full inline-flex items-center justify-center text-blue-400 hover:bg-blue-200 hover:text-blue-500"
                                        @click="clearFilter(filter.key)">
                                    <svg class="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                                        <path stroke-linecap="round" d="m1 1 6 6m0-6-6 6"></path>
                                    </svg>
                                </button>
                            </span>
                        </template>
                        <button type="button" 
                                class="text-sm text-gray-500 hover:text-gray-700"
                                @click="clearAllFilters()">
                            Clear all
                        </button>
                    </div>
                </div>

                <!-- Analytics Charts -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <!-- Incident Trends -->
                    <div class="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                        <div class="flex items-center justify-between mb-4">
                            <h4 class="text-lg font-semibold text-gray-900">Incident Volume Trends</h4>
                            <div class="flex items-center space-x-2">
                                <select class="text-sm border-gray-300 rounded-md" x-model="chartPeriod" @change="updateCharts()">
                                    <option value="7">Last 7 days</option>
                                    <option value="30">Last 30 days</option>
                                    <option value="90">Last 90 days</option>
                                </select>
                            </div>
                        </div>
                        <div class="h-64">
                            <canvas id="incident-trends-chart"></canvas>
                        </div>
                    </div>

                    <!-- Priority Distribution -->
                    <div class="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                        <div class="flex items-center justify-between mb-4">
                            <h4 class="text-lg font-semibold text-gray-900">Priority Distribution</h4>
                            <div class="text-sm text-gray-500">Last updated: <span x-text="lastUpdate"></span></div>
                        </div>
                        <div class="h-64">
                            <canvas id="priority-distribution-chart"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Incidents Table -->
                <div class="bg-white rounded-lg shadow-md border border-gray-200">
                    <div class="p-6 border-b border-gray-200">
                        <div class="flex items-center justify-between">
                            <h4 class="text-lg font-semibold text-gray-900">Incidents List</h4>
                            
                            <!-- Table Controls -->
                            <div class="flex items-center space-x-4">
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-500">Show:</span>
                                    <select class="text-sm border-gray-300 rounded-md" 
                                            x-model="pageSize" 
                                            @change="applyFilters()">
                                        <option value="25">25</option>
                                        <option value="50">50</option>
                                        <option value="100">100</option>
                                    </select>
                                </div>
                                
                                <div id="export-spinner" class="htmx-indicator">
                                    <div class="spinner w-4 h-4"></div>
                                </div>
                                
                                <div id="export-status"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Table -->
                    <div class="overflow-x-auto">
                        <table class="table">
                            <thead class="table-header">
                                <tr>
                                    <th class="table-header-cell cursor-pointer" @click="sortBy('number')">
                                        <div class="flex items-center space-x-1">
                                            <span>Number</span>
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
                                            </svg>
                                        </div>
                                    </th>
                                    <th class="table-header-cell">Priority</th>
                                    <th class="table-header-cell">State</th>
                                    <th class="table-header-cell">Short Description</th>
                                    <th class="table-header-cell">Assignment Group</th>
                                    <th class="table-header-cell">Assigned To</th>
                                    <th class="table-header-cell cursor-pointer" @click="sortBy('sys_created_on')">
                                        <div class="flex items-center space-x-1">
                                            <span>Created</span>
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
                                            </svg>
                                        </div>
                                    </th>
                                    <th class="table-header-cell">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="table-body" 
                                   id="incidents-table-body"
                                   hx-get="/api/incidents"
                                   hx-trigger="load, refresh-table from:body"
                                   hx-target="this"
                                   hx-vals='{"limit": "50"}'>
                                <!-- Loading state -->
                                <tr>
                                    <td colspan="8" class="table-cell text-center py-8">
                                        <div class="flex items-center justify-center">
                                            <div class="spinner w-6 h-6"></div>
                                            <span class="ml-3 text-gray-600">Loading incidents...</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Pagination -->
                    <div class="p-6 border-t border-gray-200">
                        <div class="flex items-center justify-between">
                            <div class="text-sm text-gray-700">
                                Showing <span class="font-medium" x-text="pagination.from">1</span> to 
                                <span class="font-medium" x-text="pagination.to">25</span> of 
                                <span class="font-medium" x-text="pagination.total">100</span> results
                            </div>
                            
                            <div class="flex items-center space-x-2">
                                <button class="btn-outline btn-sm" 
                                        :disabled="pagination.currentPage === 1"
                                        @click="previousPage()">
                                    Previous
                                </button>
                                
                                <template x-for="page in getVisiblePages()" :key="page">
                                    <button class="btn-outline btn-sm"
                                            :class="{ 'bg-blue-600 text-white border-blue-600': page === pagination.currentPage }"
                                            @click="goToPage(page)"
                                            x-text="page">
                                    </button>
                                </template>
                                
                                <button class="btn-outline btn-sm"
                                        :disabled="pagination.currentPage === pagination.totalPages"
                                        @click="nextPage()">
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        // Alpine.js Incidents Dashboard Component
        function incidentsDashboard() {
            return {
                // Data
                stats: {
                    total: '--',
                    highPriority: '--',
                    avgResolution: '--'
                },
                
                filters: {
                    search: '',
                    state: 'all',
                    priority: 'all',
                    assignmentGroup: ''
                },
                
                pagination: {
                    currentPage: 1,
                    totalPages: 1,
                    pageSize: 25,
                    total: 0,
                    from: 0,
                    to: 0
                },
                
                sortField: 'sys_created_on',
                sortDirection: 'desc',
                
                chartPeriod: '7',
                lastUpdate: new Date().toLocaleTimeString(),
                
                // Initialization
                init() {
                    this.loadStats();
                    this.initializeCharts();
                    this.startAutoRefresh();
                },
                
                // Filter Methods
                hasActiveFilters() {
                    return this.filters.search !== '' || 
                           this.filters.state !== 'all' || 
                           this.filters.priority !== 'all' || 
                           this.filters.assignmentGroup !== '';
                },
                
                getActiveFilters() {
                    const active = [];
                    if (this.filters.search) active.push({ key: 'search', label: \`Search: \${this.filters.search}\` });
                    if (this.filters.state !== 'all') active.push({ key: 'state', label: \`State: \${this.getStateLabel(this.filters.state)}\` });
                    if (this.filters.priority !== 'all') active.push({ key: 'priority', label: \`Priority: \${this.filters.priority}\` });
                    if (this.filters.assignmentGroup) active.push({ key: 'assignmentGroup', label: \`Group: \${this.filters.assignmentGroup}\` });
                    return active;
                },
                
                clearFilter(key) {
                    if (key === 'search') this.filters.search = '';
                    else if (key === 'state') this.filters.state = 'all';
                    else if (key === 'priority') this.filters.priority = 'all';
                    else if (key === 'assignmentGroup') this.filters.assignmentGroup = '';
                    this.applyFilters();
                },
                
                clearAllFilters() {
                    this.filters = {
                        search: '',
                        state: 'all',
                        priority: 'all',
                        assignmentGroup: ''
                    };
                    this.applyFilters();
                },
                
                applyFilters() {
                    // Trigger HTMX request with current filters
                    htmx.trigger('#incidents-table-body', 'refresh-table');
                    this.pagination.currentPage = 1;
                },
                
                // Sorting
                sortBy(field) {
                    if (this.sortField === field) {
                        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.sortField = field;
                        this.sortDirection = 'asc';
                    }
                    this.applyFilters();
                },
                
                // Pagination
                getVisiblePages() {
                    const current = this.pagination.currentPage;
                    const total = this.pagination.totalPages;
                    const visible = [];
                    
                    const start = Math.max(1, current - 2);
                    const end = Math.min(total, current + 2);
                    
                    for (let i = start; i <= end; i++) {
                        visible.push(i);
                    }
                    
                    return visible;
                },
                
                goToPage(page) {
                    this.pagination.currentPage = page;
                    this.applyFilters();
                },
                
                previousPage() {
                    if (this.pagination.currentPage > 1) {
                        this.pagination.currentPage--;
                        this.applyFilters();
                    }
                },
                
                nextPage() {
                    if (this.pagination.currentPage < this.pagination.totalPages) {
                        this.pagination.currentPage++;
                        this.applyFilters();
                    }
                },
                
                // Data Loading
                async loadStats() {
                    try {
                        const response = await fetch('/api/incidents/stats/summary');
                        const data = await response.json();
                        
                        if (data.success) {
                            this.stats.total = data.data.active;
                            this.stats.highPriority = data.data.high_priority;
                            this.stats.avgResolution = data.data.avg_resolution_time;
                        }
                    } catch (error) {
                        console.error('Error loading stats:', error);
                    }
                },
                
                // Chart Initialization
                initializeCharts() {
                    this.initTrendsChart();
                    this.initPriorityChart();
                },
                
                initTrendsChart() {
                    const ctx = document.getElementById('incident-trends-chart');
                    if (!ctx) return;
                    
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                            datasets: [{
                                label: 'New Incidents',
                                data: [12, 15, 8, 22, 14, 16, 9],
                                borderColor: 'rgb(239, 68, 68)',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                tension: 0.4,
                                fill: true
                            }, {
                                label: 'Resolved Incidents',
                                data: [8, 12, 10, 18, 12, 14, 11],
                                borderColor: 'rgb(34, 197, 94)',
                                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                tension: 0.4,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            interaction: {
                                intersect: false,
                                mode: 'index'
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    grid: {
                                        color: 'rgba(0, 0, 0, 0.1)'
                                    }
                                }
                            },
                            plugins: {
                                legend: {
                                    position: 'bottom'
                                }
                            }
                        }
                    });
                },
                
                initPriorityChart() {
                    const ctx = document.getElementById('priority-distribution-chart');
                    if (!ctx) return;
                    
                    new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: ['Critical (P1)', 'High (P2)', 'Medium (P3)', 'Low (P4)', 'Planning (P5)'],
                            datasets: [{
                                data: [5, 12, 28, 15, 3],
                                backgroundColor: [
                                    '#DC2626', // Critical
                                    '#EA580C', // High  
                                    '#D97706', // Medium
                                    '#059669', // Low
                                    '#6B7280'  // Planning
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
                },
                
                updateCharts() {
                    // TODO: Update charts based on selected period
                    console.log('Updating charts for period:', this.chartPeriod);
                },
                
                // Auto-refresh
                startAutoRefresh() {
                    setInterval(() => {
                        this.lastUpdate = new Date().toLocaleTimeString();
                        this.loadStats();
                    }, 30000); // Refresh every 30 seconds
                },
                
                // Utility Methods
                getStateLabel(state) {
                    const labels = {
                        '1': 'New',
                        '2': 'In Progress',
                        '3': 'On Hold',
                        '6': 'Resolved',
                        '7': 'Closed'
                    };
                    return labels[state] || state;
                }
            }
        }
        
        // HTMX Event Handlers
        document.body.addEventListener('htmx:afterRequest', function(evt) {
            if (evt.target.id === 'incidents-table-body') {
                console.log('Incidents table updated');
                // Could update pagination info here
            }
        });
        
        document.body.addEventListener('htmx:responseError', function(evt) {
            console.error('HTMX error:', evt.detail);
            // Show error message to user
        });
    </script>
</body>
</html>
    `;
});

export default app;
