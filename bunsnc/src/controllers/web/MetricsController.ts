/**
 * MetricsController - System Metrics and Status Management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Handles system metrics display, rate limiting status, and ServiceNow connectivity indicators.
 * Provides real-time monitoring data for the dashboard interface.
 */

import { Context } from "elysia";
import { serviceNowAuthClient } from "../../services";

/**
 * Interface for system metrics
 */
interface SystemMetrics {
  totalRequests: number;
  currentRate: number;
  concurrentRequests: number;
  serviceNowStatus: "connected" | "disconnected";
  lastTestTime: number;
  rateLimitStatus: {
    isHealthy: boolean;
    percentage: number;
    level: "normal" | "medium" | "high";
  };
}

/**
 * Get comprehensive system metrics for dashboard display
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  try {
    // Get rate limiter statistics
    const rateLimiterStats = {}; // Rate limiting now handled internally: getStats();
    const currentRate = 0; // rateLimiterStats.current || 0;
    const maxRate = 25; // ServiceNow API limit

    // Determine rate limit status
    const percentage = (currentRate / maxRate) * 100;
    let level: "normal" | "medium" | "high" = "normal";
    let isHealthy = true;

    if (percentage > 80) {
      level = "high";
      isHealthy = false;
    } else if (percentage > 60) {
      level = "medium";
    }

    // Test ServiceNow connectivity
    let serviceNowStatus: "connected" | "disconnected" = "connected";
    try {
      await serviceNowAuthClient.testConnection();
    } catch (error: unknown) {
      serviceNowStatus = "disconnected";
      console.warn("ServiceNow connectivity test failed:", error);
    }

    return {
      totalRequests: rateLimiterStats.total || 0,
      currentRate,
      concurrentRequests: rateLimiterStats.concurrent || 0,
      serviceNowStatus,
      lastTestTime: Date.now(),
      rateLimitStatus: {
        isHealthy,
        percentage,
        level,
      },
    };
  } catch (error: unknown) {
    console.error("Error getting system metrics:", error);

    // Return fallback metrics on error
    return {
      totalRequests: 0,
      currentRate: 0,
      concurrentRequests: 0,
      serviceNowStatus: "disconnected",
      lastTestTime: Date.now(),
      rateLimitStatus: {
        isHealthy: false,
        percentage: 0,
        level: "normal",
      },
    };
  }
}

/**
 * Generate metrics HTML template
 */
export function generateMetricsHTML(metrics: SystemMetrics): string {
  const {
    totalRequests,
    currentRate,
    concurrentRequests,
    serviceNowStatus,
    lastTestTime,
    rateLimitStatus,
  } = metrics;

  return `
    <!-- Metrics Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div class="card-gradient rounded-xl border border-gray-600 p-6 text-center hover:border-blue-500 transition-all duration-300">
        <div class="text-3xl font-bold text-blue-400 mb-2">${totalRequests.toLocaleString()}</div>
        <div class="text-sm text-gray-300">Total Requests</div>
        <div class="text-xs text-gray-400 mt-1">API Calls</div>
      </div>
      
      <div class="card-gradient rounded-xl border border-gray-600 p-6 text-center hover:border-yellow-500 transition-all duration-300">
        <div class="text-3xl font-bold text-yellow-400 mb-2">${currentRate}/s</div>
        <div class="text-sm text-gray-300">Current Rate</div>
        <div class="text-xs text-gray-400 mt-1">Requests per second</div>
      </div>
      
      <div class="card-gradient rounded-xl border border-gray-600 p-6 text-center hover:border-purple-500 transition-all duration-300">
        <div class="text-3xl font-bold text-purple-400 mb-2">${concurrentRequests}</div>
        <div class="text-sm text-gray-300">Concurrent</div>
        <div class="text-xs text-gray-400 mt-1">Active requests</div>
      </div>
    </div>
    
    <!-- System Status with Real-time Indicators -->
    <div class="glass-effect rounded-xl border border-gray-600 p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-white">System Status</h3>
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 ${serviceNowStatus === "connected" ? "bg-green-400 animate-pulse" : "bg-red-400 animate-bounce"} rounded-full"></div>
          <span class="text-sm ${serviceNowStatus === "connected" ? "text-green-400" : "text-red-400"}">${serviceNowStatus === "connected" ? "Online" : "Offline"}</span>
        </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div class="text-gray-400 mb-1">ServiceNow</div>
          <div class="${serviceNowStatus === "connected" ? "text-green-400" : "text-red-400"} font-medium flex items-center">
            <i data-lucide="${serviceNowStatus === "connected" ? "check-circle" : "x-circle"}" class="w-4 h-4 mr-1"></i> 
            ${serviceNowStatus === "connected" ? "Connected" : "Disconnected"}
          </div>
          <div class="text-xs text-gray-500 mt-1">${new Date(lastTestTime).toLocaleTimeString("pt-BR")}</div>
        </div>
        <div>
          <div class="text-gray-400 mb-1">Redis Cache</div>
          <div class="text-green-400 font-medium flex items-center"><i data-lucide="check-circle" class="w-4 h-4 mr-1"></i> Active</div>
          <div class="text-xs text-gray-500 mt-1">Caching enabled</div>
        </div>
        <div>
          <div class="text-gray-400 mb-1">Rate Limiting</div>
          <div class="${rateLimitStatus.isHealthy ? "text-green-400" : "text-red-400"} font-medium flex items-center">
            <i data-lucide="check-circle" class="w-4 h-4 mr-1"></i> ${rateLimitStatus.isHealthy ? "Healthy" : "Stressed"}
          </div>
          <div class="text-xs text-gray-500 mt-1">${currentRate}/25 req/s</div>
        </div>
        <div>
          <div class="text-gray-400 mb-1">Current Load</div>
          <div class="text-${concurrentRequests > 15 ? "orange" : concurrentRequests > 10 ? "yellow" : "green"}-400 font-medium flex items-center">
            <i data-lucide="zap" class="w-4 h-4 mr-1"></i> ${concurrentRequests} active
          </div>
          <div class="text-xs text-gray-500 mt-1">Max: 25 concurrent</div>
        </div>
      </div>
    </div>
    
    <!-- Rate Limiting Visual Indicator -->
    <div class="glass-effect rounded-xl border border-gray-600 p-4 mb-6">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-medium text-white">Rate Limiting Status</h4>
        <span class="text-xs text-gray-400">Real-time monitoring</span>
      </div>
      <div class="flex items-center space-x-4">
        <div class="flex-1">
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>Current Rate</span>
            <span>${currentRate}/25 req/s</span>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-2">
            <div class="h-2 rounded-full transition-all duration-300 ${rateLimitStatus.level === "high" ? "bg-red-500" : rateLimitStatus.level === "medium" ? "bg-orange-500" : "bg-green-500"}" 
                 style="width: ${Math.min(rateLimitStatus.percentage, 100)}%"></div>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 ${rateLimitStatus.level === "high" ? "bg-red-400 animate-pulse" : rateLimitStatus.level === "medium" ? "bg-orange-400" : "bg-green-400"} rounded-full"></div>
          <span class="text-xs ${rateLimitStatus.level === "high" ? "text-red-400" : rateLimitStatus.level === "medium" ? "text-orange-400" : "text-green-400"}">
            ${rateLimitStatus.level === "high" ? "High Load" : rateLimitStatus.level === "medium" ? "Medium Load" : "Normal"}
          </span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate error metrics HTML when metrics loading fails
 */
export function generateMetricsErrorHTML(error?: string): string {
  return `
    <div class="glass-effect rounded-xl border border-red-600 p-6 text-center">
      <i data-lucide="alert-triangle" class="w-16 h-16 mx-auto mb-4 text-red-400"></i>
      <h3 class="text-lg font-medium text-red-400 mb-2">Erro ao carregar métricas</h3>
      <p class="text-red-300 text-sm mb-4">Não foi possível obter as métricas do sistema</p>
      ${error ? `<p class="text-xs text-gray-400">${error}</p>` : ""}
      <button onclick="htmx.ajax('GET', '/clean/metrics', {target: '#metrics-section'})" 
              class="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
        <i data-lucide="refresh-cw" class="w-4 h-4 inline mr-2"></i>
        Tentar Novamente
      </button>
    </div>
  `;
}

/**
 * Metrics endpoint handler
 */
export async function handleMetricsRequest(context: Context): Promise<string> {
  try {
    const metrics = await getSystemMetrics();
    return generateMetricsHTML(metrics);
  } catch (error: unknown) {
    console.error("Error in metrics handler:", error);
    return generateMetricsErrorHTML(error.message);
  }
}
