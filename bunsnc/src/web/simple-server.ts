/**
 * Simple Web Server for Testing
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";
import { cors } from "@elysiajs/cors";

const app = new Elysia()
  .use(cors())
  .use(html())
  .use(
    staticPlugin({
      assets: "./src/web/public",
      prefix: "/public",
    }),
  )

  // Health check
  .get("/health", () => ({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    services: {
      web: "running",
      elysia: "ok",
    },
  }))

  // Main dashboard
  .get(
    "/",
    () => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ServiceNow Analytics Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    <script src="https://unpkg.com/alpinejs@3.13.3/dist/cdn.min.js" defer></script>
</head>
<body class="bg-gray-100 min-h-screen font-sans">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h1 class="text-3xl font-bold text-gray-800 mb-2">ServiceNow Analytics Dashboard</h1>
            <p class="text-gray-600">Phase 5 - Modern Web Interface</p>
            <div class="flex items-center mt-4">
                <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span class="ml-2 text-sm text-gray-600">System Online</span>
            </div>
        </div>

        <!-- Status Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Active Incidents</h3>
                <div class="text-3xl font-bold text-red-600">42</div>
                <p class="text-sm text-gray-500 mt-1">↓ 12% from yesterday</p>
            </div>
            
            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Open Problems</h3>
                <div class="text-3xl font-bold text-orange-600">8</div>
                <p class="text-sm text-gray-500 mt-1">↑ 5% from yesterday</p>
            </div>
            
            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Pending Changes</h3>
                <div class="text-3xl font-bold text-blue-600">15</div>
                <p class="text-sm text-gray-500 mt-1">→ 0% from yesterday</p>
            </div>
            
            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Data Processing</h3>
                <div class="text-3xl font-bold text-green-600">Active</div>
                <p class="text-sm text-gray-500 mt-1">12.5k records/min</p>
            </div>
        </div>

        <!-- Interactive Section -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-8">
            <h3 class="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                        hx-get="/api/test"
                        hx-target="#result">
                    Test API Connection
                </button>
                
                <button class="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                        hx-get="/api/mock-data"
                        hx-target="#result">
                    Load Mock Data
                </button>
                
                <button class="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                        hx-get="/health"
                        hx-target="#result">
                    Health Check
                </button>
            </div>
            
            <div id="result" class="mt-6 p-4 bg-gray-50 rounded-lg min-h-[100px]">
                <p class="text-gray-500">Click a button above to see results...</p>
            </div>
        </div>

        <!-- Feature List -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h3 class="text-xl font-semibold text-gray-800 mb-4">Phase 5 Features</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                    <h4 class="font-semibold text-green-600"> Implemented</h4>
                    <ul class="space-y-1 text-sm text-gray-600">
                        <li>• Modern Elysia.js server</li>
                        <li>• TailwindCSS styling</li>
                        <li>• HTMX interactivity</li>
                        <li>• Alpine.js reactivity</li>
                        <li>• File-based routing</li>
                        <li>• Responsive design</li>
                    </ul>
                </div>
                
                <div class="space-y-2">
                    <h4 class="font-semibold text-blue-600"> In Progress</h4>
                    <ul class="space-y-1 text-sm text-gray-600">
                        <li>• WebSocket integration</li>
                        <li>• Server-Sent Events</li>
                        <li>• Real-time notifications</li>
                        <li>• Background tasks</li>
                        <li>• Authentication system</li>
                        <li>• Advanced charts</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
  `,
  )

  // Test API endpoints
  .get("/api/test", () => ({
    success: true,
    message: "API connection successful!",
    timestamp: new Date().toISOString(),
    server: "Elysia.js",
    version: "1.0.0",
  }))

  .get("/api/mock-data", () => ({
    success: true,
    data: {
      incidents: [
        {
          number: "INC0000001",
          priority: "High",
          state: "New",
          created: new Date().toISOString(),
        },
        {
          number: "INC0000002",
          priority: "Medium",
          state: "In Progress",
          created: new Date().toISOString(),
        },
        {
          number: "INC0000003",
          priority: "Low",
          state: "Resolved",
          created: new Date().toISOString(),
        },
      ],
      stats: {
        total: 42,
        active: 28,
        resolved: 14,
      },
    },
    timestamp: new Date().toISOString(),
  }))

  .onError(({ error, code }) => {
    console.error(`Error ${code}:`, error);
    return {
      error: "Server Error",
      message: (error as Error).message || "Unknown error",
      code,
      timestamp: new Date().toISOString(),
    };
  });

// Start the server
const PORT = 3008;

try {
  app.listen(PORT);

  console.log(" ServiceNow Web Interface - Simple Server");
  console.log("");
  console.log(` Server running on port ${PORT}`);
  console.log(` Dashboard: http://localhost:${PORT}`);
  console.log(` Health Check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test API: http://localhost:${PORT}/api/test`);
  console.log("");
  console.log("Phase 5 - Modern Web Interface");
  console.log("Built with Elysia.js + HTMX + TailwindCSS + Alpine.js");
  console.log("");
} catch (error) {
  console.error(" Failed to start server:", error);
  process.exit(1);
}
