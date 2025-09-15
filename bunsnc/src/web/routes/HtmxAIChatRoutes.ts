/**
 * HTMX AI Chat Interface Routes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from 'elysia';
import { html } from '@elysiajs/html';
import { logger } from '../../utils/Logger';

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:3001';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  confidence?: number;
  sources?: string[];
}

interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
  context: {
    agentId?: string;
    supportGroup?: string;
    currentTickets?: string[];
  };
  created: string;
}

// In-memory chat sessions (in production, use Redis or database)
const chatSessions = new Map<string, ChatSession>();

export const htmxAIChatRoutes = new Elysia({ prefix: '/ai/chat' })
  .use(html())

  // AI Chat Main Interface
  .get('/', async ({ html, query }) => {
    const sessionId = query.session || generateSessionId();
    const ticketId = query.ticket;
    const agentId = query.agent || 'agent_001';

    return html(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Assistant Chat - BunSNC</title>
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        <script src="https://unpkg.com/hyperscript.org@0.9.12"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .chat-header {
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            padding: 16px 24px;
            border-bottom: 1px solid rgba(255,255,255,0.2);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .chat-header h1 {
            font-size: 1.5rem;
            font-weight: 600;
            color: #1f2937;
          }
          .chat-status {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #10b981;
            font-weight: 500;
          }
          .chat-container {
            flex: 1;
            display: flex;
            max-width: 1200px;
            margin: 0 auto;
            width: 100%;
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
          }
          .chat-sidebar {
            width: 280px;
            background: #f8fafc;
            border-right: 1px solid #e2e8f0;
            padding: 20px;
            overflow-y: auto;
          }
          .chat-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            height: calc(100vh - 80px);
          }
          .chat-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: #ffffff;
          }
          .chat-input-area {
            padding: 20px;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
          }
          .message {
            margin-bottom: 16px;
            display: flex;
            gap: 12px;
          }
          .message.user {
            flex-direction: row-reverse;
          }
          .message-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
          }
          .message.user .message-avatar {
            background: #3b82f6;
            color: white;
          }
          .message.assistant .message-avatar {
            background: #10b981;
            color: white;
          }
          .message-content {
            max-width: 70%;
            background: #f1f5f9;
            padding: 12px 16px;
            border-radius: 18px;
            position: relative;
          }
          .message.user .message-content {
            background: #3b82f6;
            color: white;
            border-bottom-right-radius: 4px;
          }
          .message.assistant .message-content {
            background: #f1f5f9;
            color: #1f2937;
            border-bottom-left-radius: 4px;
          }
          .message-text {
            line-height: 1.5;
            word-wrap: break-word;
          }
          .message-meta {
            font-size: 11px;
            opacity: 0.7;
            margin-top: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .confidence-badge {
            background: #10b981;
            color: white;
            padding: 2px 6px;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 500;
          }
          .chat-input-container {
            display: flex;
            gap: 12px;
            align-items: flex-end;
          }
          .chat-input {
            flex: 1;
            min-height: 44px;
            max-height: 120px;
            padding: 12px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            resize: none;
            font-family: inherit;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s ease;
          }
          .chat-input:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          }
          .chat-send-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .chat-send-btn:hover:not(:disabled) {
            background: #2563eb;
            transform: translateY(-1px);
          }
          .chat-send-btn:disabled {
            background: #9ca3af;
            cursor: not-allowed;
            transform: none;
          }
          .sidebar-section {
            margin-bottom: 24px;
          }
          .sidebar-title {
            font-weight: 600;
            color: #374151;
            margin-bottom: 12px;
            font-size: 14px;
          }
          .quick-action {
            display: block;
            width: 100%;
            padding: 8px 12px;
            background: transparent;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            text-align: left;
            cursor: pointer;
            margin-bottom: 8px;
            font-size: 13px;
            color: #4b5563;
            transition: all 0.2s ease;
          }
          .quick-action:hover {
            background: #e5e7eb;
            border-color: #9ca3af;
          }
          .context-info {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 8px;
            padding: 12px;
            font-size: 12px;
            color: #1e40af;
          }
          .typing-indicator {
            display: none;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            color: #6b7280;
            font-style: italic;
            font-size: 13px;
          }
          .typing-dots {
            display: flex;
            gap: 2px;
          }
          .typing-dot {
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: #6b7280;
            animation: typing 1.4s infinite ease-in-out;
          }
          .typing-dot:nth-child(1) { animation-delay: -0.32s; }
          .typing-dot:nth-child(2) { animation-delay: -0.16s; }
          @keyframes typing {
            0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
          }
          .source-links {
            margin-top: 8px;
            font-size: 11px;
          }
          .source-link {
            color: #3b82f6;
            text-decoration: none;
            margin-right: 8px;
          }
          .source-link:hover {
            text-decoration: underline;
          }
          .loading {
            text-align: center;
            color: #6b7280;
            padding: 20px;
          }
        </style>
      </head>
      <body>
        <div class="chat-header">
          <h1>🤖 AI Assistant</h1>
          <div class="chat-status">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></div>
            <span>Assistente Online</span>
          </div>
        </div>

        <div class="chat-container">
          <div class="chat-sidebar">
            <div class="sidebar-section">
              <div class="sidebar-title">🎯 Ações Rápidas</div>
              <button class="quick-action"
                      hx-post="/ai/chat/quick-action"
                      hx-vals='{"action": "troubleshoot_oracle", "session": "${sessionId}"}'
                      hx-target="#chat-messages"
                      hx-swap="beforeend">
                 Troubleshooting Oracle
              </button>
              <button class="quick-action"
                      hx-post="/ai/chat/quick-action"
                      hx-vals='{"action": "network_issues", "session": "${sessionId}"}'
                      hx-target="#chat-messages"
                      hx-swap="beforeend">
                 Problemas de Rede
              </button>
              <button class="quick-action"
                      hx-post="/ai/chat/quick-action"
                      hx-vals='{"action": "backup_procedures", "session": "${sessionId}"}'
                      hx-target="#chat-messages"
                      hx-swap="beforeend">
                💾 Procedimentos Backup
              </button>
              <button class="quick-action"
                      hx-post="/ai/chat/quick-action"
                      hx-vals='{"action": "sla_compliance", "session": "${sessionId}"}'
                      hx-target="#chat-messages"
                      hx-swap="beforeend">
                 Compliance SLA
              </button>
            </div>

            ${ticketId ? `
            <div class="sidebar-section">
              <div class="sidebar-title">🎫 Contexto do Ticket</div>
              <div class="context-info">
                <strong>Ticket:</strong> ${ticketId}<br>
                <strong>Agente:</strong> ${agentId}<br>
                <strong>Modo:</strong> Assistência Contextual
              </div>
            </div>
            ` : ''}

            <div class="sidebar-section">
              <div class="sidebar-title">📚 Base de Conhecimento</div>
              <div style="font-size: 12px; color: #6b7280; line-height: 1.4;">
                <strong>2,615+</strong> documentos técnicos<br>
                <strong>5</strong> tecnologias principais<br>
                <strong>Neural Search</strong> ativo
              </div>
            </div>

            <div class="sidebar-section">
              <div class="sidebar-title"> Capacidades AI</div>
              <div style="font-size: 11px; color: #6b7280; line-height: 1.4;">
                 Busca semântica<br>
                 Análise de similaridade<br>
                 NER Português (CPF, CNPJ)<br>
                 Reranking neural<br>
                 Classificação automática
              </div>
            </div>
          </div>

          <div class="chat-main">
            <div class="chat-messages" id="chat-messages"
                 hx-get="/ai/chat/history/${sessionId}"
                 hx-trigger="load"
                 hx-swap="innerHTML">
              <div class="loading">Carregando histórico do chat...</div>
            </div>

            <div class="typing-indicator" id="typing-indicator">
              <span>AI está digitando</span>
              <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
              </div>
            </div>

            <div class="chat-input-area">
              <form hx-post="/ai/chat/message"
                    hx-target="#chat-messages"
                    hx-swap="beforeend"
                    hx-on::before-request="showTyping()"
                    hx-on::after-request="hideTyping(); this.reset();">
                <input type="hidden" name="session" value="${sessionId}">
                <input type="hidden" name="agent" value="${agentId}">
                ${ticketId ? `<input type="hidden" name="ticket" value="${ticketId}">` : ''}

                <div class="chat-input-container">
                  <textarea name="message"
                           class="chat-input"
                           placeholder="Digite sua pergunta ou descreva o problema..."
                           rows="1"
                           required
                           onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault(); this.form.requestSubmit();}"></textarea>
                  <button type="submit" class="chat-send-btn">
                    <span>Enviar</span>
                    <span>→</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <script>
          function showTyping() {
            document.getElementById('typing-indicator').style.display = 'flex';
            const messagesContainer = document.getElementById('chat-messages');
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }

          function hideTyping() {
            document.getElementById('typing-indicator').style.display = 'none';
            const messagesContainer = document.getElementById('chat-messages');
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }

          // Auto-resize textarea
          document.querySelector('.chat-input').addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
          });

          // Auto-scroll to bottom when new messages arrive
          htmx.onLoad(function() {
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
          });
        </script>
      </body>
      </html>
    `);
  })

  // Chat History
  .get('/history/:sessionId', async ({ params, html }) => {
    const session = chatSessions.get(params.sessionId);

    if (!session || session.messages.length === 0) {
      return html(`
        <div class="message assistant">
          <div class="message-avatar">AI</div>
          <div class="message-content">
            <div class="message-text">
              Olá! Sou seu assistente AI para suporte técnico. Como posso ajudá-lo hoje?

              Posso auxiliar com:
              •  Busca na base de conhecimento (2,615+ documentos)
              • 🎯 Análise e classificação de tickets
              •  Troubleshooting técnico (Oracle, PostgreSQL, redes)
              •  Informações sobre SLA e compliance
              • 💡 Sugestões de resolução baseadas em casos similares
            </div>
            <div class="message-meta">
              <span>${new Date().toLocaleTimeString('pt-BR')}</span>
              <span class="confidence-badge">AI Ready</span>
            </div>
          </div>
        </div>
      `);
    }

    const messagesHTML = session.messages.map(msg => `
      <div class="message ${msg.role}">
        <div class="message-avatar">${msg.role === 'user' ? 'AG' : 'AI'}</div>
        <div class="message-content">
          <div class="message-text">${msg.content}</div>
          <div class="message-meta">
            <span>${new Date(msg.timestamp).toLocaleTimeString('pt-BR')}</span>
            ${msg.confidence ? `<span class="confidence-badge">${Math.round(msg.confidence * 100)}%</span>` : ''}
          </div>
          ${msg.sources && msg.sources.length > 0 ? `
            <div class="source-links">
              <strong>Fontes:</strong>
              ${msg.sources.map(source => `<a href="#" class="source-link">${source}</a>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');

    return html(messagesHTML);
  })

  // Send Message
  .post('/message', async ({ body, html }) => {
    try {
      const { session: sessionId, message, agent: agentId, ticket: ticketId } = body as any;

      if (!sessionId || !message) {
        return html('<div style="color: red;">Erro: Sessão ou mensagem inválida</div>');
      }

      // Get or create session
      let session = chatSessions.get(sessionId);
      if (!session) {
        session = {
          sessionId,
          messages: [],
          context: { agentId, currentTickets: ticketId ? [ticketId] : [] },
          created: new Date().toISOString()
        };
        chatSessions.set(sessionId, session);
      }

      // Add user message
      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      };
      session.messages.push(userMessage);

      // Get AI response
      const aiResponse = await getAIResponse(message, session);
      session.messages.push(aiResponse);

      // Return both messages
      return html(`
        <div class="message user">
          <div class="message-avatar">AG</div>
          <div class="message-content">
            <div class="message-text">${userMessage.content}</div>
            <div class="message-meta">
              <span>${new Date(userMessage.timestamp).toLocaleTimeString('pt-BR')}</span>
            </div>
          </div>
        </div>
        <div class="message assistant">
          <div class="message-avatar">AI</div>
          <div class="message-content">
            <div class="message-text">${aiResponse.content}</div>
            <div class="message-meta">
              <span>${new Date(aiResponse.timestamp).toLocaleTimeString('pt-BR')}</span>
              ${aiResponse.confidence ? `<span class="confidence-badge">${Math.round(aiResponse.confidence * 100)}%</span>` : ''}
            </div>
            ${aiResponse.sources && aiResponse.sources.length > 0 ? `
              <div class="source-links">
                <strong>Fontes:</strong>
                ${aiResponse.sources.map(source => `<a href="#" class="source-link">${source}</a>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `);

    } catch (error) {
      logger.error('[HtmxAIChat] Message processing failed:', error);
      return html(`
        <div class="message assistant">
          <div class="message-avatar">AI</div>
          <div class="message-content">
            <div class="message-text" style="color: #ef4444;">
              Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.
            </div>
            <div class="message-meta">
              <span>${new Date().toLocaleTimeString('pt-BR')}</span>
              <span class="confidence-badge" style="background: #ef4444;">Error</span>
            </div>
          </div>
        </div>
      `);
    }
  }, {
    body: t.Object({
      session: t.String(),
      message: t.String(),
      agent: t.Optional(t.String()),
      ticket: t.Optional(t.String())
    })
  })

  // Quick Actions
  .post('/quick-action', async ({ body, html }) => {
    try {
      const { action, session: sessionId } = body as any;

      const quickActions: Record<string, { message: string; response: string }> = {
        troubleshoot_oracle: {
          message: "Preciso de ajuda com troubleshooting Oracle",
          response: ` **Troubleshooting Oracle - Guia Rápido**

**Passos Iniciais:**
1. **Verificar logs**: \`tail -f $ORACLE_HOME/diag/rdbms/*/alert_*.log\`
2. **Status da instância**: \`SELECT status FROM v$instance;\`
3. **Espaço em tablespaces**: \`SELECT tablespace_name, sum(bytes)/1024/1024 MB FROM dba_free_space GROUP BY tablespace_name;\`

**Problemas Comuns:**
• **ORA-00257**: Arquivo de log cheio → Aumentar espaço ou fazer backup
• **ORA-01578**: Bloco corrompido → \`RMAN> backup validate database;\`
• **Performance lenta**: Verificar AWR reports e estatísticas de wait

**Documentos Relacionados:**
• Oracle Performance Tuning Guide
• Database Troubleshooting Manual
• Emergency Recovery Procedures`
        },
        network_issues: {
          message: "Como resolver problemas de rede?",
          response: ` **Diagnóstico de Rede - Checklist**

**Testes Básicos:**
1. **Conectividade**: \`ping [destino]\` e \`telnet [host] [porta]\`
2. **DNS**: \`nslookup [hostname]\` e \`dig [hostname]\`
3. **Rotas**: \`traceroute [destino]\` ou \`mtr [destino]\`

**Verificações Avançadas:**
• **Portas**: \`netstat -tulpn | grep [porta]\`
• **Tráfego**: \`iftop\` ou \`nethogs\`
• **Firewall**: \`iptables -L\` (Linux) ou \`netsh advfirewall show allprofiles\` (Windows)

**Problemas Frequentes:**
• **Timeout**: Verificar firewall e MTU
• **DNS lento**: Configurar DNS secundário
• **Perda de pacotes**: Verificar cabos e switches

**Escalação**: Se persistir, contactar equipe de Network Infrastructure`
        },
        backup_procedures: {
          message: "Quais são os procedimentos de backup?",
          response: `💾 **Procedimentos de Backup - Padrão Corporativo**

**Backup Diário (Automático):**
• **Bancos**: RMAN full backup + archive logs
• **Arquivos**: Rsync para storage secundário
• **VMs**: Snapshot + backup para tape

**Backup Manual (Emergência):**
1. **Oracle**: \`RMAN> backup database plus archivelog;\`
2. **PostgreSQL**: \`pg_dump -U postgres [database] > backup.sql\`
3. **Arquivos**: \`tar -czf backup_$(date +%Y%m%d).tar.gz [diretório]\`

**Verificação:**
• **Integridade**: \`RMAN> validate backup;\`
• **Restore test**: Mensal em ambiente de teste
• **Logs**: Verificar /var/log/backup/ para erros

**SLA de Backup:**
• **RPO**: 4 horas (dados críticos)
• **RTO**: 2 horas (restauração)
• **Retenção**: 30 dias (diário), 12 meses (mensal)`
        },
        sla_compliance: {
          message: "Como está o compliance de SLA?",
          response: ` **Status de Compliance SLA**

**Métricas Atuais:**
• **Incidents P1**: 95% (Meta: 90%)
• **Incidents P2**: 88% (Meta: 85%)
• **Change Tasks**: 92% (Meta: 90%)
• **Service Catalog**: 96% (Meta: 95%)

**Penalidades:**
• **P1 (1.0%)**: R$ 2.450,00 (3 violações)
• **P2 (0.5%)**: R$ 1.225,00 (5 violações)
• **Total Mensal**: R$ 3.675,00

**Ações Recomendadas:**
1. **Priorizar tickets P1**: Resolução < 4h
2. **Melhorar routing**: Usar classificação AI
3. **Treinamento**: Procedimentos por prioridade

**Alertas Ativos:**
 2 tickets P1 próximos ao SLA breach
 5 tickets P2 requerem atenção`
        }
      };

      const actionData = quickActions[action];
      if (!actionData) {
        return html('<div style="color: red;">Ação não encontrada</div>');
      }

      // Get or create session
      let session = chatSessions.get(sessionId);
      if (!session) {
        session = {
          sessionId,
          messages: [],
          context: {},
          created: new Date().toISOString()
        };
        chatSessions.set(sessionId, session);
      }

      // Add messages to session
      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: actionData.message,
        timestamp: new Date().toISOString()
      };

      const aiMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: actionData.response,
        timestamp: new Date().toISOString(),
        confidence: 0.95,
        sources: ['Knowledge Base', 'SLA Database', 'Operational Procedures']
      };

      session.messages.push(userMessage, aiMessage);

      return html(`
        <div class="message user">
          <div class="message-avatar">AG</div>
          <div class="message-content">
            <div class="message-text">${userMessage.content}</div>
            <div class="message-meta">
              <span>${new Date(userMessage.timestamp).toLocaleTimeString('pt-BR')}</span>
            </div>
          </div>
        </div>
        <div class="message assistant">
          <div class="message-avatar">AI</div>
          <div class="message-content">
            <div class="message-text" style="white-space: pre-line;">${aiMessage.content}</div>
            <div class="message-meta">
              <span>${new Date(aiMessage.timestamp).toLocaleTimeString('pt-BR')}</span>
              <span class="confidence-badge">${Math.round(aiMessage.confidence! * 100)}%</span>
            </div>
            <div class="source-links">
              <strong>Fontes:</strong>
              ${aiMessage.sources!.map(source => `<a href="#" class="source-link">${source}</a>`).join('')}
            </div>
          </div>
        </div>
      `);

    } catch (error) {
      logger.error('[HtmxAIChat] Quick action failed:', error);
      return html('<div style="color: red;">Erro ao processar ação rápida</div>');
    }
  }, {
    body: t.Object({
      action: t.String(),
      session: t.String()
    })
  });

// Helper functions
function generateSessionId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

async function getAIResponse(message: string, session: ChatSession): Promise<ChatMessage> {
  try {
    // Try to get response from AI API
    const response = await fetch(`${AI_SERVER_URL}/api/search/intelligent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: message,
        max_results: 3,
        targets: ['documents', 'tickets'],
        enable_reranking: true
      })
    });

    if (response.ok) {
      const searchData = await response.json();

      if (searchData.success && searchData.data.results.length > 0) {
        const results = searchData.data.results.slice(0, 2);
        const sources = results.map((r: any) => r.title || `${r.type} resultado`);

        let aiContent = `Com base na base de conhecimento, encontrei as seguintes informações:\n\n`;

        results.forEach((result: any, index: number) => {
          aiContent += `**${index + 1}. ${result.title || 'Documento'}**\n`;
          aiContent += `${result.content?.substring(0, 300) || 'Conteúdo não disponível'}...\n\n`;
        });

        aiContent += `Esta resposta foi gerada com base em ${results.length} documento(s) da base de conhecimento.`;

        return {
          id: generateMessageId(),
          role: 'assistant',
          content: aiContent,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          sources
        };
      }
    }

    // Fallback response
    return {
      id: generateMessageId(),
      role: 'assistant',
      content: `Entendi sua pergunta sobre "${message}".

Infelizmente, não encontrei informações específicas na base de conhecimento no momento. Posso sugerir:

1. **Verificar documentação técnica** relacionada ao tópico
2. **Consultar tickets similares** no histórico
3. **Contatar especialista** da área correspondente

Posso ajudá-lo de outra forma? Tente ser mais específico sobre o problema ou tecnologia.`,
      timestamp: new Date().toISOString(),
      confidence: 0.6
    };

  } catch (error) {
    logger.error('[HtmxAIChat] AI response generation failed:', error);

    return {
      id: generateMessageId(),
      role: 'assistant',
      content: 'Desculpe, estou enfrentando dificuldades técnicas no momento. Tente novamente em alguns instantes ou contate o suporte se o problema persistir.',
      timestamp: new Date().toISOString(),
      confidence: 0.1
    };
  }
}