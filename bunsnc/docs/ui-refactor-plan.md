# BunSNC Dashboard UI Refactor - Planejamento v2.0
**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**

## 1. Visão Geral

Refatoração completa da UI seguindo ElysiaJS best practices, com design moderno inspirado em painéis de trading/bolsa de valores, focado em performance e experiência do usuário.

## 2. Arquitetura Modular (Elysia Best Practices)

### 2.1 Estrutura de Arquivos
```
src/web/dashboard-v2/
├── index.ts                    # Entry point - exports main Elysia instance
├── routes/
│   ├── layout.routes.ts       # Layout principal e componentes base
│   ├── metrics.routes.ts      # Endpoints de métricas em tempo real
│   ├── tickets.routes.ts      # Gerenciamento de tickets
│   ├── search.routes.ts       # Sistema de busca avançado
│   └── actions.routes.ts      # Ações de workflow
├── components/
│   ├── sidebar.component.ts   # Menu lateral hamburger
│   ├── search.component.ts    # Barra de busca accordion translúcida
│   ├── ticker.component.ts    # Painel central estilo ticker de bolsa
│   ├── cards.component.ts     # Cards de métricas
│   └── modals.component.ts    # Modais e overlays
├── services/
│   ├── realtime.service.ts    # WebSocket/SSE para dados em tempo real
│   └── cache.service.ts       # Cache client-side
└── styles/
    └── tailwind.config.ts     # Tema customizado
```

### 2.2 Padrões Elysia
- **"1 instance = 1 controller"**: Cada rota retorna instância Elysia separada
- **Dependency Injection**: `.derive()` para serviços compartilhados
- **Plugin Composition**: Modularização por funcionalidade
- **Type Safety**: Validação com `t.Object()` em todos os endpoints

## 3. Design da Interface

### 3.1 Layout Principal

```
┌─────────────────────────────────────────────────────────┐
│  [☰] BunSNC Dashboard           [🔍 Search]  [👤 User] │ ← Header (fixo)
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ 📊 PAINEL CENTRAL - TICKER DE MÉTRICAS        │    │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │    │
│  │ Incidents: 42 ↑ 5.2%  │  CTasks: 18 ↓ 2.1%   │    │
│  │ SCTasks: 31 ↑ 12%     │  SLA: 94.3% ↑ 1.5%   │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐│
│  │ CARDS DE │  │ MÉTRICAS │  │  TEMPO   │  │  AÇÕES  ││
│  │  STATUS  │  │   SLA    │  │   REAL   │  │ RÁPIDAS ││
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘│
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  TABELA DE TICKETS (lazy load + virtual scroll)  │  │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  │
│  │  INC001  │  High  │  IT Ops  │  2h ago  │ [...]  │  │
│  │  INC002  │  Med   │  Network │  4h ago  │ [...]  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌────────┐
│ SIDEBAR│ ← Menu lateral (toggle com ☰)
│  Home  │
│ Tickets│
│ Reports│
│ Config │
└────────┘

┌────────────────────────┐
│  SEARCH ACCORDION      │ ← Dropdown translúcido (toggle com 🔍)
│  ━━━━━━━━━━━━━━━━━━━ │
│  [Search input...]     │
│  Filters: [...]        │
└────────────────────────┘
```

### 3.2 Cores e Tema (Bolsa de Valores)

```css
/* Inspiração: Bloomberg Terminal / Trading Dashboards */
--bg-primary: #0a0e1a        /* Azul escuro profundo */
--bg-secondary: #141b2d      /* Azul médio */
--bg-tertiary: #1e2740       /* Azul claro */

--accent-green: #00ff88      /* Alta/Positivo */
--accent-red: #ff3366        /* Baixa/Negativo */
--accent-blue: #00d4ff       /* Neutro/Info */
--accent-yellow: #ffd600     /* Atenção/Warning */

--text-primary: #e0e6ed      /* Texto principal */
--text-secondary: #8b92a0    /* Texto secundário */
--text-muted: #5a6270        /* Texto desabilitado */

--border-color: #2d3548      /* Bordas sutis */
--glow-effect: 0 0 20px rgba(0,212,255,0.3) /* Efeito neon */
```

### 3.3 Componentes Principais

#### A) Menu Hamburger (Sidebar)
- **Trigger**: Ícone ☰ no canto superior esquerdo
- **Animação**: Slide-in da esquerda (300ms ease-out)
- **Overlay**: Backdrop translúcido com blur
- **Conteúdo**:
  - Logo + Nome do sistema
  - Menu de navegação principal
  - Indicadores de status
  - Quick actions

#### B) Search Accordion
- **Trigger**: Ícone 🔍 no header
- **Animação**: Expand/collapse vertical (200ms ease-in-out)
- **Estilo**: Fundo translúcido (rgba(0,0,0,0.85)) com backdrop-filter: blur(10px)
- **Funcionalidades**:
  - Busca global multi-tabela
  - Filtros avançados (accordion interno)
  - Resultados em tempo real (debounced)
  - Atalhos de teclado (Ctrl+K)

#### C) Painel Central Ticker
- **Layout**: Horizontal scrolling com auto-play
- **Atualização**: WebSocket em tempo real (1s interval)
- **Indicadores**:
  - Números grandes e legíveis
  - Setas de tendência (↑ ↓)
  - Variação percentual colorida
  - Sparklines (mini gráficos)
- **Animação**: Fade-in ao atualizar + pulse em mudanças significativas

#### D) Cards de Métricas
- **Layout**: Grid responsivo (4 cols desktop, 2 tablet, 1 mobile)
- **Conteúdo por card**:
  - Título + ícone
  - Valor principal (grande)
  - Variação (pequena, colorida)
  - Mini gráfico de tendência
- **Interação**: Hover revela detalhes + click abre modal

#### E) Tabela de Tickets
- **Performance**: Virtual scroll (apenas renderiza visíveis)
- **Lazy loading**: Carrega 50 itens por vez
- **Filtros**: Integrados no header da tabela
- **Ações**: Row actions + bulk actions
- **Expansão**: Click expande detalhes inline

## 4. Funcionalidades Existentes a Manter

### 4.1 Endpoints Core (do dashboard atual)
- ✅ `GET /` - Dashboard principal
- ✅ `GET /metrics` - Métricas em tempo real
- ✅ `GET /search` - Busca global
- ✅ `GET /tickets` - Lista de tickets
- ✅ `GET /ticket/:sysId/:table` - Detalhes do ticket
- ✅ `GET /ticket-counts` - Contadores de tickets
- ✅ `POST /ticket/:sysId/:table/assign` - Atribuir ticket
- ✅ `POST /ticket/:sysId/:table/notes` - Adicionar nota
- ✅ `POST /ticket/:sysId/:table/status` - Atualizar status
- ✅ `POST /ticket/:sysId/:table/close` - Fechar ticket

### 4.2 Integrações ServiceNow
- ✅ ServiceNowAuthClient via dependency injection
- ✅ Rate limiting e retry logic
- ✅ Cache com Redis
- ✅ Bridge service para evitar chamadas self-referencing

### 4.3 Real-time Features
- ✅ WebSocket para notificações
- ✅ SSE para streaming de métricas
- ✅ Auto-refresh configurável

## 5. Melhorias de Performance

### 5.1 Client-side
- **Code splitting**: Lazy load de rotas e componentes
- **Service Worker**: Cache de assets estáticos
- **Virtual scrolling**: Listas grandes
- **Debouncing**: Inputs de busca
- **Memoization**: Componentes HTMX

### 5.2 Server-side
- **Response caching**: Cache-Control headers
- **Compression**: Gzip/Brotli
- **Connection pooling**: Reutilizar conexões DB/Redis
- **Batch requests**: Agregar múltiplas queries

### 5.3 Network
- **HTTP/2**: Server push de assets críticos
- **Prefetching**: Recursos da próxima página
- **Inlining crítico**: CSS/JS inicial no HTML

## 6. Stack Tecnológico

### Frontend
- **HTMX**: Interatividade sem JavaScript pesado
- **Alpine.js**: Reatividade para componentes complexos
- **TailwindCSS v4**: Styling moderno
- **Chart.js**: Gráficos e sparklines
- **Animate.css**: Animações suaves

### Backend
- **ElysiaJS**: Framework web
- **Bun**: Runtime rápido
- **Redis**: Cache e pub/sub
- **MongoDB**: Persistência
- **WebSocket/SSE**: Real-time

## 7. Timeline de Implementação

### Fase 1: Fundação (Dia 1-2)
- [ ] Criar estrutura de arquivos modular
- [ ] Implementar layout base com header/sidebar/search
- [ ] Setup de estilos e tema

### Fase 2: Componentes Core (Dia 3-4)
- [ ] Implementar painel ticker central
- [ ] Criar cards de métricas
- [ ] Desenvolver tabela de tickets com virtual scroll

### Fase 3: Funcionalidades (Dia 5-6)
- [ ] Integrar busca avançada
- [ ] Implementar ações de workflow
- [ ] Adicionar real-time updates

### Fase 4: Otimização (Dia 7)
- [ ] Performance tuning
- [ ] Testes de responsividade
- [ ] Ajustes finais de UX

## 8. Métricas de Sucesso

- **Performance**: First Contentful Paint < 1s
- **Interatividade**: Time to Interactive < 2s
- **Bundle size**: JS inicial < 50kb (gzipped)
- **Real-time**: Updates < 500ms latência
- **Usabilidade**: Todas ações acessíveis em < 3 clicks

---

**Próximo passo**: Criar mockup HTML interativo para validação
