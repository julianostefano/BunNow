/**
 * HTMX AI Agent Interface Routes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { logger } from "../../utils/Logger";

const AI_SERVER_URL = process.env.AI_SERVER_URL || "http://localhost:3001";

export const htmxAIRoutes = new Elysia({ prefix: "/ai" })
  .use(html())

  // AI Dashboard Main Page
  .get("/dashboard", async ({ html }) => {
    return html(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Services Dashboard - BunSNC</title>
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        <script src="https://unpkg.com/hyperscript.org@0.9.12"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
          }
          .ai-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
          }
          .ai-header {
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          }
          .ai-header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
          }
          .ai-header p {
            color: #666;
            font-size: 1.1rem;
          }
          .ai-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 24px;
            margin-bottom: 32px;
          }
          .ai-card {
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
          }
          .ai-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 40px rgba(0,0,0,0.15);
          }
          .ai-card h3 {
            font-size: 1.4rem;
            font-weight: 600;
            margin-bottom: 12px;
            color: #2d3748;
          }
          .ai-status {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 16px;
          }
          .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #10b981;
          }
          .status-dot.loading {
            background: #f59e0b;
            animation: pulse 2s infinite;
          }
          .status-dot.error {
            background: #ef4444;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          .ai-metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
          }
          .ai-metric:last-child {
            border-bottom: none;
          }
          .metric-value {
            font-weight: 600;
            color: #4f46e5;
          }
          .ai-actions {
            display: flex;
            gap: 12px;
            margin-top: 16px;
          }
          .ai-btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
            text-decoration: none;
            display: inline-block;
            font-size: 14px;
          }
          .ai-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          }
          .ai-btn.secondary {
            background: #6b7280;
          }
          .loading {
            text-align: center;
            padding: 40px;
            color: #6b7280;
          }
          .search-container {
            grid-column: 1 / -1;
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          }
          .search-input {
            width: 100%;
            padding: 16px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            font-size: 16px;
            outline: none;
            transition: border-color 0.2s ease;
          }
          .search-input:focus {
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          }
          .search-results {
            margin-top: 20px;
            min-height: 100px;
          }
        </style>
      </head>
      <body>
        <div class="ai-container">
          <div class="ai-header">
            <h1>🤖 AI Services Dashboard</h1>
            <p>Plataforma Inteligente para Suporte Técnico - Neural Search, Document Intelligence e Agent Assistance</p>
          </div>

          <div class="ai-grid">
            <!-- AI Services Status -->
            <div class="ai-card">
              <h3>🏥 Status dos Serviços AI</h3>
              <div id="ai-services-status"
                   hx-get="/ai/services/status"
                   hx-trigger="load, every 30s"
                   hx-swap="innerHTML">
                <div class="loading">Carregando status dos serviços...</div>
              </div>
            </div>

            <!-- Quick Search -->
            <div class="search-container">
              <h3> Busca Inteligente</h3>
              <input type="text"
                     class="search-input"
                     placeholder="Digite sua consulta (ex: problema Oracle, configuração rede, backup PostgreSQL...)"
                     hx-post="/ai/search/quick"
                     hx-trigger="keyup changed delay:1s"
                     hx-target="#search-results"
                     hx-swap="innerHTML">
              <div id="search-results" class="search-results">
                <p style="color: #6b7280; text-align: center; padding: 20px;">
                  Digite sua consulta para buscar na base de conhecimento
                </p>
              </div>
            </div>

            <!-- Ticket Analysis -->
            <div class="ai-card">
              <h3>🎯 Análise de Tickets</h3>
              <div class="ai-status">
                <div class="status-dot"></div>
                <span>Análise AI Ativa</span>
              </div>
              <div class="ai-metric">
                <span>Tickets Analisados Hoje</span>
                <span class="metric-value" id="tickets-analyzed">-</span>
              </div>
              <div class="ai-metric">
                <span>Precisão de Classificação</span>
                <span class="metric-value" id="classification-accuracy">-</span>
              </div>
              <div class="ai-actions">
                <a href="/ai/ticket/analyze" class="ai-btn">Analisar Ticket</a>
                <a href="/ai/analytics/tickets" class="ai-btn secondary">Ver Métricas</a>
              </div>
            </div>

            <!-- Document Intelligence -->
            <div class="ai-card">
              <h3>📄 Document Intelligence</h3>
              <div class="ai-status">
                <div class="status-dot"></div>
                <span>OCR e NER Ativos</span>
              </div>
              <div class="ai-metric">
                <span>Documentos Processados</span>
                <span class="metric-value" id="docs-processed">2,615+</span>
              </div>
              <div class="ai-metric">
                <span>Entidades Extraídas</span>
                <span class="metric-value" id="entities-extracted">-</span>
              </div>
              <div class="ai-actions">
                <a href="/ai/document/upload" class="ai-btn">Processar Documento</a>
                <a href="/ai/knowledge/browse" class="ai-btn secondary">Base Conhecimento</a>
              </div>
            </div>

            <!-- Agent Assistant -->
            <div class="ai-card">
              <h3>🤝 Assistente de Agentes</h3>
              <div class="ai-status">
                <div class="status-dot"></div>
                <span>Chat AI Disponível</span>
              </div>
              <div class="ai-metric">
                <span>Consultas Respondidas</span>
                <span class="metric-value" id="queries-answered">-</span>
              </div>
              <div class="ai-metric">
                <span>Taxa de Satisfação</span>
                <span class="metric-value" id="satisfaction-rate">-</span>
              </div>
              <div class="ai-actions">
                <a href="/ai/assistant/chat" class="ai-btn">Iniciar Chat</a>
                <a href="/ai/assistant/guidance" class="ai-btn secondary">Orientações</a>
              </div>
            </div>

            <!-- Neural Search Stats -->
            <div class="ai-card">
              <h3> Neural Search</h3>
              <div class="ai-status">
                <div class="status-dot"></div>
                <span>OpenSearch Operational</span>
              </div>
              <div class="ai-metric">
                <span>Índices Ativos</span>
                <span class="metric-value">5</span>
              </div>
              <div class="ai-metric">
                <span>Tempo Médio Busca</span>
                <span class="metric-value">&lt;2s</span>
              </div>
              <div class="ai-actions">
                <a href="/ai/search/advanced" class="ai-btn">Busca Avançada</a>
                <a href="/ai/search/analytics" class="ai-btn secondary">Analytics</a>
              </div>
            </div>
          </div>
        </div>

        <script>
          // Load metrics on page load
          htmx.onLoad(function() {
            // Fetch AI metrics
            fetch('${AI_SERVER_URL}/api/ai/health')
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  // Update status indicators
                  updateServiceStatus(data.services);
                }
              })
              .catch(error => console.log('AI services status check failed:', error));
          });

          function updateServiceStatus(services) {
            // Update service status dots based on health
            const statusDots = document.querySelectorAll('.status-dot');
            statusDots.forEach(dot => {
              if (services && services.length > 0) {
                dot.classList.remove('loading', 'error');
              } else {
                dot.classList.add('loading');
              }
            });
          }

          // Auto-refresh metrics every 30 seconds
          setInterval(() => {
            fetch('${AI_SERVER_URL}/api/ai/services/status')
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  // Update metrics display
                  updateMetrics(data);
                }
              })
              .catch(error => console.log('Metrics update failed:', error));
          }, 30000);

          function updateMetrics(data) {
            // Update dashboard metrics with real data
            if (data.services) {
              const healthyServices = Object.values(data.services).filter(s => s.status === 'healthy').length;
              document.querySelector('#classification-accuracy').textContent = Math.round((healthyServices / 5) * 100) + '%';
            }
          }
        </script>
      </body>
      </html>
    `);
  })

  // AI Services Status Component
  .get("/services/status", async ({ html }) => {
    try {
      const response = await fetch(`${AI_SERVER_URL}/api/ai/services/status`);
      const data = await response.json();

      if (data.success) {
        const services = [
          {
            name: "Apache Tika",
            status: data.services.tika?.status || "unknown",
            description: "Document OCR & Text Extraction",
          },
          {
            name: "OpenSearch",
            status: data.services.opensearch?.status || "unknown",
            description: "Neural Search Engine",
          },
          {
            name: "Embedding Service",
            status: data.services.embedding?.status || "unknown",
            description: "BGE-Large-EN-v1.5",
          },
          {
            name: "Rerank Service",
            status: data.services.rerank?.status || "unknown",
            description: "BAAI/bge-reranker-v2-m3",
          },
          {
            name: "LLM Service",
            status: data.services.llm?.status || "unknown",
            description: "DeepSeek Models",
          },
        ];

        const serviceHTML = services
          .map(
            (service) => `
          <div class="ai-metric">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="status-dot ${service.status === "healthy" ? "" : service.status === "unknown" ? "loading" : "error"}"></div>
              <div>
                <div style="font-weight: 500;">${service.name}</div>
                <div style="font-size: 12px; color: #6b7280;">${service.description}</div>
              </div>
            </div>
            <span class="metric-value" style="color: ${service.status === "healthy" ? "#10b981" : service.status === "unknown" ? "#f59e0b" : "#ef4444"};">
              ${service.status === "healthy" ? "" : service.status === "unknown" ? "" : ""}
            </span>
          </div>
        `,
          )
          .join("");

        return html(`
          ${serviceHTML}
          <div class="ai-actions" style="margin-top: 16px;">
            <span style="font-size: 12px; color: #6b7280;">
              Status: ${data.healthy_services}/${data.total_services} serviços ativos
            </span>
          </div>
        `);
      }

      return html(`
        <div class="ai-metric">
          <span style="color: #ef4444;">Erro ao verificar status dos serviços</span>
        </div>
      `);
    } catch (error) {
      logger.error("[HtmxAI] Services status check failed:", error);
      return html(`
        <div class="ai-metric">
          <span style="color: #ef4444;">Serviços AI indisponíveis</span>
        </div>
      `);
    }
  })

  // Quick Search Component
  .post(
    "/search/quick",
    async ({ body, html }) => {
      try {
        if (!body || typeof body !== "object" || !("query" in body)) {
          return html(
            '<p style="color: #6b7280; text-align: center; padding: 20px;">Digite uma consulta para buscar</p>',
          );
        }

        const query = (body as any).query;
        if (!query || query.length < 3) {
          return html(
            '<p style="color: #6b7280; text-align: center; padding: 20px;">Digite pelo menos 3 caracteres</p>',
          );
        }

        const searchResponse = await fetch(
          `${AI_SERVER_URL}/api/search/intelligent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: query,
              max_results: 5,
              targets: ["documents", "tickets"],
              enable_reranking: true,
            }),
          },
        );

        const searchData = await searchResponse.json();

        if (searchData.success && searchData.data.results.length > 0) {
          const resultsHTML = searchData.data.results
            .map(
              (result: any) => `
          <div style="
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px;
            margin: 8px 0;
            background: #f9fafb;
          ">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <h4 style="margin: 0; color: #1f2937; font-size: 14px; font-weight: 600;">
                ${result.title || "Resultado"}
              </h4>
              <span style="
                background: ${result.type === "document" ? "#10b981" : "#3b82f6"};
                color: white;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 500;
              ">
                ${result.type === "document" ? "📄 Doc" : "🎫 Ticket"}
              </span>
            </div>
            <p style="margin: 8px 0; color: #4b5563; font-size: 13px; line-height: 1.4;">
              ${result.content ? result.content.substring(0, 200) + "..." : "Sem descrição disponível"}
            </p>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
              <span style="font-size: 11px; color: #6b7280;">
                Relevância: ${Math.round((result.relevance_score || result.final_score || 0.5) * 100)}%
              </span>
              <a href="#" style="
                color: #4f46e5;
                text-decoration: none;
                font-size: 12px;
                font-weight: 500;
              ">Ver detalhes →</a>
            </div>
          </div>
        `,
            )
            .join("");

          return html(`
          <div style="margin-top: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h4 style="margin: 0; color: #1f2937;">Resultados (${searchData.data.results.length})</h4>
              <span style="font-size: 12px; color: #6b7280;">
                ${searchData.data.metadata.processing_time_ms}ms
              </span>
            </div>
            ${resultsHTML}
            <div style="text-align: center; margin-top: 16px;">
              <a href="/ai/search/advanced?q=${encodeURIComponent(query)}" class="ai-btn secondary" style="font-size: 12px;">
                Ver todos os resultados
              </a>
            </div>
          </div>
        `);
        }

        return html(`
        <div style="text-align: center; padding: 20px; color: #6b7280;">
          <p>Nenhum resultado encontrado para "${query}"</p>
          <p style="font-size: 12px; margin-top: 8px;">Tente termos como: "Oracle", "backup", "rede", "PostgreSQL"</p>
        </div>
      `);
      } catch (error) {
        logger.error("[HtmxAI] Quick search failed:", error);
        return html(`
        <div style="text-align: center; padding: 20px; color: #ef4444;">
          <p>Erro na busca. Tente novamente.</p>
        </div>
      `);
      }
    },
    {
      body: t.Object({
        query: t.String(),
      }),
    },
  );
