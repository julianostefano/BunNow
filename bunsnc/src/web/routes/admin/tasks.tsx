/**
 * Task Management Admin Interface
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";

const app = new Elysia().use(html()).get("/admin/tasks", () => {
  return `
<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Manager - ServiceNow Analytics</title>
    <script src="/ui/styles/tailwind.css"></script>
    <script src="/ui/js/htmx.min.js"></script>
    <!-- AlpineJS removed - using HTMX only -->
    <script src="/ui/js/chart.umd.js" defer></script>
</head>
<body class="h-full bg-gray-50 font-sans antialiased">
    <div id="app" x-data="taskManager()" class="min-h-screen flex flex-col">
        <!-- Navigation Header -->
        <nav class="bg-white shadow-sm border-b border-gray-200">
            <div class="container mx-auto px-6 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <a href="/" class="flex items-center space-x-2">
                            <div class="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
                                </svg>
                            </div>
                            <h1 class="text-xl font-semibold text-gray-900">Task Manager</h1>
                        </a>
                        
                        <!-- Navigation Links -->
                        <div class="hidden md:flex items-center space-x-8 ml-8">
                            <a href="/" class="nav-link-inactive">Dashboard</a>
                            <a href="/dashboard/incidents" class="nav-link-inactive">Incidents</a>
                            <a href="/admin/tasks" class="nav-link-active">Tasks</a>
                            <a href="/admin/settings" class="nav-link-inactive">Settings</a>
                        </div>
                    </div>
                    
                    <!-- Task Controls -->
                    <div class="flex items-center space-x-4">
                        <button class="btn-success btn-sm" 
                                @click="showCreateTaskModal = true">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                            </svg>
                            New Task
                        </button>
                        
                        <div class="flex items-center space-x-2">
                            <div class="w-2 h-2 rounded-full animate-pulse" 
                                 :class="systemHealth.healthy ? 'bg-green-500' : 'bg-red-500'"></div>
                            <span class="text-sm text-gray-600" x-text="systemHealth.healthy ? 'System Healthy' : 'System Issues'">Loading...</span>
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
                            <h2 class="text-2xl font-bold text-gray-900 mb-2">Background Task Management</h2>
                            <p class="text-gray-600">Monitor and manage background processing tasks and scheduled jobs</p>
                        </div>
                        
                        <!-- System Status -->
                        <div class="text-right">
                            <div class="text-2xl font-bold text-green-600" x-text="stats.system?.successRate + '%' || '--'">--</div>
                            <div class="text-sm text-gray-500">Success Rate</div>
                        </div>
                    </div>
                </div>

                <!-- Statistics Cards -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <!-- Queue Stats -->
                    <div class="dashboard-stat hover-lift">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="dashboard-stat-label">Active Tasks</p>
                                <p class="dashboard-stat-value text-blue-600" x-text="stats.queue?.running || 0">0</p>
                                <p class="text-sm text-gray-500 mt-1">Currently processing</p>
                            </div>
                            <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                </svg>
                            </div>
                        </div>
                    </div>

                    <!-- Pending Tasks -->
                    <div class="dashboard-stat hover-lift">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="dashboard-stat-label">Queued Tasks</p>
                                <p class="dashboard-stat-value text-yellow-600" x-text="stats.queue?.pending || 0">0</p>
                                <p class="text-sm text-gray-500 mt-1">Waiting to process</p>
                            </div>
                            <div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                                <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                        </div>
                    </div>

                    <!-- Completed Tasks -->
                    <div class="dashboard-stat hover-lift">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="dashboard-stat-label">Completed</p>
                                <p class="dashboard-stat-value text-green-600" x-text="stats.queue?.completed || 0">0</p>
                                <p class="text-sm text-gray-500 mt-1">Successfully finished</p>
                            </div>
                            <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                                <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                        </div>
                    </div>

                    <!-- Failed Tasks -->
                    <div class="dashboard-stat hover-lift">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="dashboard-stat-label">Failed Tasks</p>
                                <p class="dashboard-stat-value text-red-600" x-text="stats.queue?.failed || 0">0</p>
                                <p class="text-sm text-gray-500 mt-1">Need attention</p>
                            </div>
                            <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                                <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 14.5c-.77.833.192 2.5 1.732 2.5z"></path>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tabs -->
                <div class="bg-white rounded-lg shadow-md border border-gray-200 mb-8">
                    <div class="border-b border-gray-200">
                        <nav class="flex space-x-8 px-6">
                            <button class="py-4 px-1 border-b-2 font-medium text-sm"
                                    :class="activeTab === 'queue' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
                                    @click="activeTab = 'queue'; loadTasks()">
                                Task Queue
                            </button>
                            <button class="py-4 px-1 border-b-2 font-medium text-sm"
                                    :class="activeTab === 'scheduled' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
                                    @click="activeTab = 'scheduled'; loadScheduledTasks()">
                                Scheduled Tasks
                            </button>
                            <button class="py-4 px-1 border-b-2 font-medium text-sm"
                                    :class="activeTab === 'history' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
                                    @click="activeTab = 'history'; loadHistory()">
                                History
                            </button>
                        </nav>
                    </div>
                    
                    <div class="p-6">
                        <!-- Task Queue Tab -->
                        <div x-show="activeTab === 'queue'" class="space-y-6">
                            <!-- Filters -->
                            <div class="flex items-center space-x-4">
                                <select class="form-select" x-model="filters.status" @change="loadTasks()">
                                    <option value="">All Statuses</option>
                                    <option value="pending">Pending</option>
                                    <option value="running">Running</option>
                                    <option value="completed">Completed</option>
                                    <option value="failed">Failed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                                
                                <button class="btn-outline btn-sm" @click="loadTasks()">
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                    </svg>
                                    Refresh
                                </button>
                            </div>
                            
                            <!-- Tasks Table -->
                            <div class="overflow-x-auto">
                                <table class="table">
                                    <thead class="table-header">
                                        <tr>
                                            <th class="table-header-cell">Task ID</th>
                                            <th class="table-header-cell">Type</th>
                                            <th class="table-header-cell">Status</th>
                                            <th class="table-header-cell">Progress</th>
                                            <th class="table-header-cell">Priority</th>
                                            <th class="table-header-cell">Created</th>
                                            <th class="table-header-cell">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody class="table-body">
                                        <template x-for="task in tasks" :key="task.id">
                                            <tr class="table-row">
                                                <td class="table-cell">
                                                    <code class="text-xs bg-gray-100 px-2 py-1 rounded" x-text="task.id.substring(0, 12) + '...'"></code>
                                                </td>
                                                <td class="table-cell">
                                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800" 
                                                          x-text="task.type"></span>
                                                </td>
                                                <td class="table-cell">
                                                    <span class="status-indicator" 
                                                          :class="{
                                                            'bg-yellow-100 text-yellow-800': task.status === 'pending',
                                                            'bg-blue-100 text-blue-800': task.status === 'running',
                                                            'bg-green-100 text-green-800': task.status === 'completed',
                                                            'bg-red-100 text-red-800': task.status === 'failed',
                                                            'bg-gray-100 text-gray-800': task.status === 'cancelled'
                                                          }"
                                                          x-text="task.status"></span>
                                                </td>
                                                <td class="table-cell">
                                                    <div class="w-full bg-gray-200 rounded-full h-2">
                                                        <div class="bg-blue-600 h-2 rounded-full" 
                                                             :style="\`width: \${task.progress || 0}%\`"></div>
                                                    </div>
                                                    <span class="text-xs text-gray-500" x-text="\`\${task.progress || 0}%\`"></span>
                                                </td>
                                                <td class="table-cell">
                                                    <span class="text-sm" x-text="task.priority"></span>
                                                </td>
                                                <td class="table-cell">
                                                    <span class="text-sm text-gray-600" x-text="formatDate(task.createdAt)"></span>
                                                </td>
                                                <td class="table-cell">
                                                    <div class="flex items-center space-x-2">
                                                        <button class="text-blue-600 hover:text-blue-800 text-sm" 
                                                                @click="viewTask(task)">
                                                            View
                                                        </button>
                                                        <button class="text-red-600 hover:text-red-800 text-sm"
                                                                @click="cancelTask(task.id)"
                                                                x-show="task.status === 'pending' || task.status === 'running'">
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        </template>
                                        
                                        <tr x-show="tasks.length === 0">
                                            <td colspan="7" class="table-cell text-center py-8 text-gray-500">
                                                No tasks found
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <!-- Scheduled Tasks Tab -->
                        <div x-show="activeTab === 'scheduled'" class="space-y-6">
                            <div class="flex items-center justify-between">
                                <h3 class="text-lg font-semibold text-gray-900">Scheduled Tasks</h3>
                                <button class="btn-primary btn-sm" @click="showScheduleTaskModal = true">
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                                    </svg>
                                    Schedule Task
                                </button>
                            </div>
                            
                            <!-- Scheduled Tasks List -->
                            <div class="space-y-4">
                                <template x-for="scheduledTask in scheduledTasks" :key="scheduledTask.id">
                                    <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                        <div class="flex items-center justify-between">
                                            <div class="flex-1">
                                                <div class="flex items-center space-x-3">
                                                    <h4 class="font-semibold text-gray-900" x-text="scheduledTask.name"></h4>
                                                    <span class="status-indicator" 
                                                          :class="scheduledTask.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
                                                          x-text="scheduledTask.enabled ? 'Enabled' : 'Disabled'"></span>
                                                </div>
                                                <p class="text-sm text-gray-600 mt-1" x-text="scheduledTask.description"></p>
                                                <div class="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                                                    <span>Cron: <code x-text="scheduledTask.cronExpression"></code></span>
                                                    <span>Runs: <span x-text="scheduledTask.runCount"></span></span>
                                                    <span>Next: <span x-text="formatDate(scheduledTask.nextRun)"></span></span>
                                                </div>
                                            </div>
                                            <div class="flex items-center space-x-2 ml-4">
                                                <button class="btn-outline btn-sm" 
                                                        @click="triggerScheduledTask(scheduledTask.id)">
                                                    Trigger Now
                                                </button>
                                                <button class="btn-outline btn-sm" 
                                                        @click="toggleScheduledTask(scheduledTask.id, !scheduledTask.enabled)">
                                                    <span x-text="scheduledTask.enabled ? 'Disable' : 'Enable'"></span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </template>
                                
                                <div x-show="scheduledTasks.length === 0" class="text-center py-8 text-gray-500">
                                    No scheduled tasks configured
                                </div>
                            </div>
                        </div>
                        
                        <!-- History Tab -->
                        <div x-show="activeTab === 'history'" class="space-y-6">
                            <h3 class="text-lg font-semibold text-gray-900">Task Execution History</h3>
                            
                            <!-- History List -->
                            <div class="space-y-3">
                                <template x-for="historyItem in history" :key="historyItem.id">
                                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                        <div class="flex items-center space-x-4">
                                            <div class="w-2 h-2 rounded-full" 
                                                 :class="historyItem.status === 'completed' ? 'bg-green-500' : 'bg-red-500'"></div>
                                            <div>
                                                <div class="font-medium text-sm" x-text="historyItem.type"></div>
                                                <div class="text-xs text-gray-500" x-text="formatDate(historyItem.completedAt)"></div>
                                            </div>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-sm font-medium" 
                                                 :class="historyItem.status === 'completed' ? 'text-green-600' : 'text-red-600'"
                                                 x-text="historyItem.status"></div>
                                            <div class="text-xs text-gray-500" 
                                                 x-text="historyItem.duration ? historyItem.duration + 'ms' : 'N/A'"></div>
                                        </div>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="bg-white rounded-lg shadow-md border border-gray-200 p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button class="btn-primary"
                                hx-post="/api/v1/tasks/export/parquet"
                                hx-vals='{"table": "incident", "priority": "high"}'
                                hx-target="#task-result"
                                hx-indicator="#task-spinner">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            Export Incidents
                        </button>
                        
                        <button class="btn-success"
                                hx-post="/api/v1/tasks/sync/data"
                                hx-vals='{"tables": ["incident", "problem"], "incremental": true}'
                                hx-target="#task-result"
                                hx-indicator="#task-spinner">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                            </svg>
                            Sync Data
                        </button>
                        
                        <button class="btn-secondary"
                                hx-post="/api/v1/tasks/cache/refresh"
                                hx-vals='{}'
                                hx-target="#task-result"
                                hx-indicator="#task-spinner">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                            </svg>
                            Refresh Cache
                        </button>
                    </div>
                    
                    <div class="mt-4">
                        <div id="task-spinner" class="htmx-indicator flex items-center justify-center p-4">
                            <div class="spinner w-6 h-6"></div>
                            <span class="ml-3 text-gray-600">Processing request...</span>
                        </div>
                        <div id="task-result" class="mt-4"></div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        // Alpine.js Task Manager Component
        function taskManager() {
            return {
                // Data
                activeTab: 'queue',
                tasks: [],
                scheduledTasks: [],
                history: [],
                stats: {},
                systemHealth: { healthy: false },
                filters: {
                    status: ''
                },
                
                // Modals
                showCreateTaskModal: false,
                showScheduleTaskModal: false,
                selectedTask: null,
                
                // Initialization
                init() {
                    this.loadStats();
                    this.loadTasks();
                    this.checkHealth();
                    this.startAutoRefresh();
                },
                
                // Data Loading
                async loadStats() {
                    try {
                        const response = await fetch('/api/v1/tasks/stats/system');
                        const data = await response.json();
                        if (data.success) {
                            this.stats = data.data;
                        }
                    } catch (error) {
                        console.error('Error loading stats:', error);
                    }
                },
                
                async loadTasks() {
                    try {
                        let url = '/api/v1/tasks';
                        if (this.filters.status) {
                            url += \`?status=\${this.filters.status}\`;
                        }
                        
                        const response = await fetch(url);
                        const data = await response.json();
                        if (data.success) {
                            this.tasks = data.data.tasks || [];
                        }
                    } catch (error) {
                        console.error('Error loading tasks:', error);
                    }
                },
                
                async loadScheduledTasks() {
                    try {
                        const response = await fetch('/api/v1/tasks/scheduled');
                        const data = await response.json();
                        if (data.success) {
                            this.scheduledTasks = data.data.scheduledTasks || [];
                        }
                    } catch (error) {
                        console.error('Error loading scheduled tasks:', error);
                    }
                },
                
                async loadHistory() {
                    try {
                        const response = await fetch('/api/v1/tasks/history?limit=20');
                        const data = await response.json();
                        if (data.success) {
                            this.history = data.data.history || [];
                        }
                    } catch (error) {
                        console.error('Error loading history:', error);
                    }
                },
                
                async checkHealth() {
                    try {
                        const response = await fetch('/api/v1/tasks/health');
                        const data = await response.json();
                        if (data.success) {
                            this.systemHealth = data.data;
                        }
                    } catch (error) {
                        console.error('Error checking health:', error);
                    }
                },
                
                // Task Actions
                async cancelTask(taskId) {
                    if (!confirm('Are you sure you want to cancel this task?')) return;
                    
                    try {
                        const response = await fetch(\`/api/v1/tasks/\${taskId}/cancel\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reason: 'Cancelled by user' })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            await this.loadTasks();
                            this.showNotification('Task cancelled successfully', 'success');
                        } else {
                            this.showNotification('Failed to cancel task: ' + data.error, 'error');
                        }
                    } catch (error) {
                        console.error('Error cancelling task:', error);
                        this.showNotification('Error cancelling task', 'error');
                    }
                },
                
                async triggerScheduledTask(taskId) {
                    try {
                        const response = await fetch(\`/api/v1/tasks/scheduled/\${taskId}/trigger\`, {
                            method: 'POST'
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            this.showNotification('Scheduled task triggered successfully', 'success');
                            await this.loadTasks();
                        } else {
                            this.showNotification('Failed to trigger task: ' + data.error, 'error');
                        }
                    } catch (error) {
                        console.error('Error triggering scheduled task:', error);
                        this.showNotification('Error triggering task', 'error');
                    }
                },
                
                async toggleScheduledTask(taskId, enabled) {
                    try {
                        const response = await fetch(\`/api/v1/tasks/scheduled/\${taskId}/enable\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ enabled })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            await this.loadScheduledTasks();
                            this.showNotification(\`Task \${enabled ? 'enabled' : 'disabled'} successfully\`, 'success');
                        } else {
                            this.showNotification('Failed to update task: ' + data.error, 'error');
                        }
                    } catch (error) {
                        console.error('Error toggling scheduled task:', error);
                        this.showNotification('Error updating task', 'error');
                    }
                },
                
                viewTask(task) {
                    this.selectedTask = task;
                    // TODO: Show task details modal
                    console.log('View task:', task);
                },
                
                // Auto-refresh
                startAutoRefresh() {
                    setInterval(async () => {
                        await this.loadStats();
                        if (this.activeTab === 'queue') {
                            await this.loadTasks();
                        } else if (this.activeTab === 'scheduled') {
                            await this.loadScheduledTasks();
                        }
                        await this.checkHealth();
                    }, 10000); // Refresh every 10 seconds
                },
                
                // Utility Methods
                formatDate(dateString) {
                    if (!dateString) return 'N/A';
                    const date = new Date(dateString);
                    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                },
                
                showNotification(message, type) {
                    // TODO: Implement notification system
                    console.log(\`[\${type.toUpperCase()}] \${message}\`);
                }
            }
        }
        
        // HTMX Event Handlers
        document.body.addEventListener('htmx:afterRequest', function(evt) {
            if (evt.detail.successful) {
                const response = JSON.parse(evt.detail.xhr.responseText);
                if (response.success) {
                    console.log('Task operation successful:', response);
                    // Refresh task list
                    if (window.Alpine && window.Alpine.store) {
                        // Trigger refresh if Alpine store exists
                    }
                }
            }
        });
        
        document.body.addEventListener('htmx:responseError', function(evt) {
            console.error('HTMX error:', evt.detail);
        });
    </script>
</body>
</html>
    `;
});

export default app;
