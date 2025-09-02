/**
 * Main Dashboard Route - ServiceNow Analytics Interface
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from 'elysia';
import { html } from '@elysiajs/html';

const app = new Elysia()
  .use(html())
  .get('/', () => {
    return `
<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="ServiceNow Analytics Dashboard - Real-time monitoring and data processing">
    <title>ServiceNow Analytics Dashboard</title>
    <link href="/public/styles.css" rel="stylesheet">
    <script src="https://unpkg.com/htmx.org@1.9.10" defer></script>
    <script src="https://unpkg.com/htmx.org/dist/ext/sse.js" defer></script>
    <script src="https://unpkg.com/alpinejs@3.13.3/dist/cdn.min.js" defer></script>
    <script src="https://unpkg.com/chart.js@4.4.0/dist/chart.min.js" defer></script>
</head>
<body class="h-full bg-gray-50 font-sans antialiased">
    <div id="app" x-data="dashboard()" class="min-h-screen flex flex-col">
        <!-- Navigation Header -->
        <nav class="bg-white shadow-sm border-b border-gray-200">
            <div class="container mx-auto px-6 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="flex items-center space-x-2">
                            <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                                </svg>
                            </div>
                            <h1 class="text-xl font-semibold text-gray-900">ServiceNow Analytics</h1>
                        </div>
                        
                        <!-- Navigation Links -->
                        <div class="hidden md:flex items-center space-x-8 ml-8">
                            <a href="/" class="nav-link-active">Dashboard</a>
                            <a href="/dashboard/incidents" class="nav-link-inactive">Incidents</a>
                            <a href="/dashboard/problems" class="nav-link-inactive">Problems</a>
                            <a href="/dashboard/changes" class="nav-link-inactive">Changes</a>
                            <a href="/real-time/monitoring" class="nav-link-inactive">Real-time</a>
                        </div>
                    </div>
                    
                    <!-- Status Indicators -->
                    <div class="flex items-center space-x-4">
                        <div class="flex items-center space-x-2">
                            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span class="text-sm text-gray-600">Connected</span>
                        </div>
                        
                        <!-- Notification Bell -->
                        <button class="relative p-2 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-md"
                                x-on:click="toggleNotifications">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5v-5zM10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"></path>
                            </svg>
                            <span class="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-white" x-show="hasNotifications"></span>
                        </button>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Main Content -->
        <main class="flex-1 overflow-hidden">
            <div class="container mx-auto px-6 py-8">
                <!-- Dashboard Header -->
                <div class="mb-8">
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">Real-time Analytics Dashboard</h2>
                    <p class="text-gray-600">Monitor ServiceNow data processing and system performance in real-time</p>
                </div>

                <!-- Real-time Status Cards -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
                     hx-ext="sse" 
                     sse-connect="/events/stream"
                     sse-swap="message"
                     hx-target="closest div">
                    
                    <!-- Active Incidents Card -->
                    <div class="dashboard-stat hover-lift">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="dashboard-stat-label">Active Incidents</p>
                                <p id="incident-count" class="dashboard-stat-value text-red-600">--</p>
                                <p class="text-sm text-gray-500 mt-1">Last updated: <span x-text="lastUpdate"></span></p>
                            </div>
                            <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                                <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 14.5c-.77.833.192 2.5 1.732 2.5z"></path>
                                </svg>
                            </div>
                        </div>
                        <div class="mt-4">
                            <div class="flex items-center text-sm">
                                <span class="text-green-600">↓ 12%</span>
                                <span class="text-gray-500 ml-1">vs yesterday</span>
                            </div>
                        </div>
                    </div>

                    <!-- Open Problems Card -->
                    <div class="dashboard-stat hover-lift">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="dashboard-stat-label">Open Problems</p>
                                <p id="problem-count" class="dashboard-stat-value text-orange-600">--</p>
                                <p class="text-sm text-gray-500 mt-1">Avg resolution: 2.4 days</p>
                            </div>
                            <div class="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                                <svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                        </div>
                        <div class="mt-4">
                            <div class="flex items-center text-sm">
                                <span class="text-red-600">↑ 5%</span>
                                <span class="text-gray-500 ml-1">vs yesterday</span>
                            </div>
                        </div>
                    </div>

                    <!-- Pending Changes Card -->
                    <div class="dashboard-stat hover-lift">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="dashboard-stat-label">Pending Changes</p>
                                <p id="change-count" class="dashboard-stat-value text-blue-600">--</p>
                                <p class="text-sm text-gray-500 mt-1">Next deployment: 2 hours</p>
                            </div>
                            <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                </svg>
                            </div>
                        </div>
                        <div class="mt-4">
                            <div class="flex items-center text-sm">
                                <span class="text-blue-600">→ 0%</span>
                                <span class="text-gray-500 ml-1">vs yesterday</span>
                            </div>
                        </div>
                    </div>

                    <!-- Processing Status Card -->
                    <div class="dashboard-stat hover-lift">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="dashboard-stat-label">Data Processing</p>
                                <p id="processing-status" class="dashboard-stat-value text-green-600">--</p>
                                <p class="text-sm text-gray-500 mt-1">Throughput: 12.5k/min</p>
                            </div>
                            <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                                <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                </svg>
                            </div>
                        </div>
                        <div class="mt-4">
                            <div class="flex items-center text-sm">
                                <span class="text-green-600">↑ 8%</span>
                                <span class="text-gray-500 ml-1">vs yesterday</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Interactive Controls & Analytics Section -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    <!-- Data Processing Controls -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="text-lg font-semibold text-gray-800">Data Processing Controls</h3>
                            <p class="text-sm text-gray-600 mt-1">Manage data pipelines and processing tasks</p>
                        </div>
                        <div class="card-body">
                            <div class="space-y-4">
                                <!-- Pipeline Controls -->
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button class="btn-primary"
                                            hx-post="/api/v1/process/parquet/incident"
                                            hx-target="#processing-log"
                                            hx-indicator="#processing-spinner">
                                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                        </svg>
                                        Export Incidents
                                    </button>
                                    
                                    <button class="btn-success"
                                            hx-post="/api/v1/pipeline/execute/realtime"
                                            hx-target="#processing-log"
                                            hx-indicator="#processing-spinner">
                                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                        </svg>
                                        Start Real-time
                                    </button>
                                </div>
                                
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button class="btn-warning"
                                            hx-post="/api/v1/process/parquet/problem"
                                            hx-target="#processing-log"
                                            hx-indicator="#processing-spinner">
                                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        Export Problems
                                    </button>
                                    
                                    <button class="btn-secondary"
                                            hx-get="/api/v1/analytics/dashboard"
                                            hx-target="#analytics-content"
                                            hx-trigger="click">
                                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                        </svg>
                                        Refresh Analytics
                                    </button>
                                </div>
                                
                                <!-- Processing Spinner -->
                                <div id="processing-spinner" class="htmx-indicator">
                                    <div class="flex items-center justify-center p-4">
                                        <div class="spinner w-6 h-6"></div>
                                        <span class="ml-3 text-gray-600">Processing request...</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Processing Log -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="text-lg font-semibold text-gray-800">Processing Log</h3>
                            <button class="text-sm text-blue-600 hover:text-blue-800" onclick="clearLog()">Clear Log</button>
                        </div>
                        <div class="card-body">
                            <div id="processing-log" class="bg-gray-900 text-green-400 p-4 rounded-lg h-64 overflow-y-auto text-sm font-mono">
                                <div class="text-gray-500">[${new Date().toISOString()}] System ready for data processing...</div>
                                <div class="text-blue-400">[${new Date().toISOString()}] WebSocket connection established</div>
                                <div class="text-yellow-400">[${new Date().toISOString()}] Monitoring ServiceNow real-time events...</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Analytics Overview -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="text-lg font-semibold text-gray-800">Analytics Overview</h3>
                        <div class="flex items-center space-x-2">
                            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span class="text-sm text-gray-600">Live data</span>
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="analytics-content" 
                             hx-get="/api/v1/analytics/dashboard" 
                             hx-trigger="load, every 30s">
                            <!-- Analytics content will be loaded here -->
                            <div class="flex items-center justify-center h-32">
                                <div class="spinner w-8 h-8"></div>
                                <span class="ml-3 text-gray-600">Loading analytics...</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="mt-8">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
                    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        <a href="/dashboard/incidents" class="group">
                            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all">
                                <div class="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200 transition-colors">
                                    <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 14.5c-.77.833.192 2.5 1.732 2.5z"></path>
                                    </svg>
                                </div>
                                <p class="text-sm font-medium text-gray-900 mt-2">Incidents</p>
                            </div>
                        </a>
                        
                        <a href="/dashboard/problems" class="group">
                            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-orange-300 transition-all">
                                <div class="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                                    <svg class="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </div>
                                <p class="text-sm font-medium text-gray-900 mt-2">Problems</p>
                            </div>
                        </a>
                        
                        <a href="/dashboard/changes" class="group">
                            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all">
                                <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                    <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                    </svg>
                                </div>
                                <p class="text-sm font-medium text-gray-900 mt-2">Changes</p>
                            </div>
                        </a>
                        
                        <a href="/real-time/monitoring" class="group">
                            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-green-300 transition-all">
                                <div class="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                                    <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                                    </svg>
                                </div>
                                <p class="text-sm font-medium text-gray-900 mt-2">Real-time</p>
                            </div>
                        </a>
                        
                        <a href="/admin/pipelines" class="group">
                            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-300 transition-all">
                                <div class="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                                    <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
                                    </svg>
                                </div>
                                <p class="text-sm font-medium text-gray-900 mt-2">Pipelines</p>
                            </div>
                        </a>
                        
                        <a href="/admin/settings" class="group">
                            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-400 transition-all">
                                <div class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                                    <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    </svg>
                                </div>
                                <p class="text-sm font-medium text-gray-900 mt-2">Settings</p>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        // Alpine.js Dashboard Data
        function dashboard() {
            return {
                lastUpdate: new Date().toLocaleTimeString(),
                hasNotifications: true,
                
                init() {
                    this.connectWebSocket();
                    this.updateTimestamps();
                },
                
                connectWebSocket() {
                    const ws = new WebSocket('ws://localhost:3008/ws/control');
                    
                    ws.onopen = () => {
                        console.log('WebSocket connected');
                        this.logMessage('WebSocket connection established', 'success');
                    };
                    
                    ws.onmessage = (event) => {
                        const data = JSON.parse(event.data);
                        console.log('WebSocket message:', data);
                        
                        if (data.type === 'log') {
                            this.logMessage(data.message, data.level || 'info');
                        }
                    };
                    
                    ws.onclose = () => {
                        console.log('WebSocket disconnected');
                        this.logMessage('WebSocket connection lost', 'error');
                    };
                    
                    ws.onerror = (error) => {
                        console.error('WebSocket error:', error);
                        this.logMessage('WebSocket error occurred', 'error');
                    };
                },
                
                logMessage(message, level = 'info') {
                    const logElement = document.getElementById('processing-log');
                    const timestamp = new Date().toISOString();
                    const colors = {
                        info: 'text-blue-400',
                        success: 'text-green-400',
                        warning: 'text-yellow-400',
                        error: 'text-red-400'
                    };
                    
                    const logEntry = document.createElement('div');
                    logEntry.className = colors[level] || colors.info;
                    logEntry.textContent = \`[\${timestamp}] \${message}\`;
                    
                    logElement.appendChild(logEntry);
                    logElement.scrollTop = logElement.scrollHeight;
                },
                
                updateTimestamps() {
                    setInterval(() => {
                        this.lastUpdate = new Date().toLocaleTimeString();
                    }, 1000);
                },
                
                toggleNotifications() {
                    this.hasNotifications = !this.hasNotifications;
                    // TODO: Implement notification panel
                }
            }
        }
        
        // Global helper functions
        function clearLog() {
            const logElement = document.getElementById('processing-log');
            logElement.innerHTML = '<div class="text-gray-500">[' + new Date().toISOString() + '] Log cleared by user</div>';
        }
        
        // HTMX event listeners
        document.body.addEventListener('htmx:beforeRequest', (event) => {
            console.log('HTMX request started:', event.detail);
        });
        
        document.body.addEventListener('htmx:afterRequest', (event) => {
            console.log('HTMX request completed:', event.detail);
        });
        
        document.body.addEventListener('htmx:responseError', (event) => {
            console.error('HTMX request error:', event.detail);
            const logElement = document.getElementById('processing-log');
            if (logElement) {
                const errorEntry = document.createElement('div');
                errorEntry.className = 'text-red-400';
                errorEntry.textContent = \`[\${new Date().toISOString()}] Request failed: \${event.detail.xhr.status}\`;
                logElement.appendChild(errorEntry);
                logElement.scrollTop = logElement.scrollHeight;
            }
        });
    </script>
</body>
</html>
    `;
  });

export default app;