# PLANO DETALHADO v5.5.4 - Ticket Edit Functionality

**Autor: Juliano Stefano <jsdealencar@ayesa.com> [2025]**
**Data Início:** 30/09/2025
**Status:** 📋 PLANEJAMENTO COMPLETO
**Prioridade:** ALTA
**Complexidade:** MÉDIA
**Tempo Estimado:** 3-5 dias

---

## 📊 CONTEXTO

### ✅ Features Completas
- **v5.5.1**: Track Running Scheduled Tasks
- **v5.5.2**: Implement Ticket History (visualização de histórico)
- **v5.5.3**: Fix instanceUrl.endsWith TypeError (servidor estável)

### 🎯 Objetivo v5.5.4
Implementar funcionalidade completa de **edição de tickets** via UI, completando o CRUD básico (Create, Read, **Update**, Delete).

### 📋 Análise da Base de Código Existente

**Arquivos Principais Identificados:**

1. **EnhancedTicketModal.ts** (842 linhas)
   - ✅ Modal profissional com 4 tabs (Detalhes, SLA, Notas, Histórico)
   - ✅ Visualização completa de tickets
   - ❌ **SEM modo de edição** - apenas read-only
   - 🎯 **Precisa adicionar:** Edit mode toggle, form fields, save/cancel buttons

2. **ModalRoutes.ts** (267 linhas)
   - ✅ GET /modal/ticket/:table/:sysId (visualização)
   - ✅ GET /modal/data/:table/:sysId (JSON data)
   - ❌ **FALTA:** PUT endpoint para updates
   - 🎯 **Precisa adicionar:** Update route com validação TypeBox

3. **ConsolidatedServiceNowService.ts**
   - ✅ Método `update()` já existe (linha 203)
   - ✅ Usado em batch operations
   - ✅ Integration com ServiceNow API funcional
   - 🎯 **Pronto para uso** - apenas precisa de endpoint HTTP

4. **TicketTypes.ts** (68 linhas)
   - ✅ TicketData interface completa
   - ✅ HistoryEntry e HistoryResponse para v5.5.2
   - ❌ **FALTA:** UpdateTicketRequest schema
   - 🎯 **Precisa adicionar:** TypeBox schemas para validação

---

## 🏗️ ARQUITETURA DA SOLUÇÃO

### Fluxo de Edição de Ticket

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE EDIÇÃO v5.5.4                       │
└─────────────────────────────────────────────────────────────────┘

1. USER INTERACTION
   │
   ├─> Click "Editar" button no modal
   │   └─> EnhancedTicketModal.ts: toggleEditMode()
   │
   ├─> Modal muda para EDIT MODE
   │   ├─> Read-only fields → Input fields
   │   ├─> Footer buttons: "Salvar" + "Cancelar"
   │   └─> Validation em tempo real
   │
   ├─> User edita campos permitidos
   │   ├─> short_description
   │   ├─> description
   │   ├─> priority
   │   ├─> state
   │   ├─> assignment_group
   │   ├─> category
   │   └─> urgency/impact
   │
   ├─> Click "Salvar"
   │   └─> JavaScript validation → POST to API
   │
2. API LAYER
   │
   ├─> PUT /modal/ticket/:table/:sysId
   │   ├─> TypeBox validation
   │   ├─> Authorization check (futuro)
   │   └─> Call service layer
   │
3. SERVICE LAYER
   │
   ├─> ConsolidatedServiceNowService.update()
   │   ├─> Update MongoDB cache
   │   ├─> Update ServiceNow via API
   │   ├─> Emit event para Redis Streams
   │   └─> Return success/error
   │
4. RESPONSE
   │
   ├─> Success
   │   ├─> Show success notification
   │   ├─> Reload modal data (updated)
   │   └─> Exit edit mode
   │
   └─> Error
       ├─> Show error notification
       ├─> Keep edit mode active
       └─> Highlight invalid fields
```

---

## 📋 IMPLEMENTAÇÃO DETALHADA

### **FASE 1: Backend - API Endpoint (Dia 1)**

#### 1.1 Adicionar TypeBox Schemas em TicketTypes.ts

**Arquivo:** `src/types/TicketTypes.ts`

```typescript
import { t } from 'elysia';

// Campos editáveis do ticket
export const UpdateTicketSchema = t.Object({
  short_description: t.Optional(t.String({ minLength: 3, maxLength: 160 })),
  description: t.Optional(t.String({ maxLength: 4000 })),
  priority: t.Optional(t.String({ pattern: '^[1-5]$' })),
  state: t.Optional(t.String()),
  assignment_group: t.Optional(t.String()),
  assigned_to: t.Optional(t.String()),
  category: t.Optional(t.String()),
  subcategory: t.Optional(t.String()),
  urgency: t.Optional(t.String({ pattern: '^[1-3]$' })),
  impact: t.Optional(t.String({ pattern: '^[1-3]$' })),
  work_notes: t.Optional(t.String({ maxLength: 4000 })),
});

export type UpdateTicketRequest = typeof UpdateTicketSchema.static;

export interface UpdateTicketResponse {
  success: boolean;
  sys_id: string;
  updated_fields: string[];
  timestamp: string;
  error?: string;
  validation_errors?: Record<string, string>;
}
```

**Validações Implementadas:**
- ✅ short_description: 3-160 caracteres
- ✅ description: até 4000 caracteres
- ✅ priority: valores 1-5 (regex)
- ✅ urgency/impact: valores 1-3 (regex)
- ✅ Campos opcionais (update parcial)

#### 1.2 Criar Endpoint PUT em ModalRoutes.ts

**Arquivo:** `src/routes/ModalRoutes.ts`

```typescript
// Adicionar após GET routes existentes

.put(
  '/ticket/:table/:sysId',
  async ({ params, body, set }) => {
    const startTime = Date.now();

    try {
      logger.info(`✏️ Updating ticket ${params.table}/${params.sysId}`);
      logger.debug('Update data:', body);

      // Validate table
      const validTables = ['incident', 'change_task', 'sc_task'];
      if (!validTables.includes(params.table)) {
        set.status = 400;
        return {
          success: false,
          error: `Invalid table: ${params.table}`,
        };
      }

      // Validate at least one field is being updated
      const updateFields = Object.keys(body);
      if (updateFields.length === 0) {
        set.status = 400;
        return {
          success: false,
          error: 'No fields to update',
        };
      }

      // Call service to update ticket
      const consolidatedService = await import(
        '../services/ConsolidatedServiceNowService'
      );

      const result = await consolidatedService.consolidatedService.update(
        params.table,
        params.sysId,
        body
      );

      // Record metrics
      await systemService.recordMetric({
        operation: 'ticket_update',
        endpoint: `/modal/ticket/${params.table}/${params.sysId}`,
        response_time_ms: Date.now() - startTime,
      });

      logger.info(`✅ Ticket ${params.sysId} updated successfully`);

      return {
        success: true,
        sys_id: params.sysId,
        updated_fields: updateFields,
        timestamp: new Date().toISOString(),
      } as UpdateTicketResponse;

    } catch (error: unknown) {
      logger.error(`❌ Error updating ticket ${params.sysId}:`, error);

      set.status = 500;
      return {
        success: false,
        sys_id: params.sysId,
        updated_fields: [],
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Internal server error',
      } as UpdateTicketResponse;
    }
  },
  {
    params: t.Object({
      table: t.String(),
      sysId: t.String(),
    }),
    body: UpdateTicketSchema,
  }
)
```

**Features:**
- ✅ TypeBox validation automática
- ✅ Table whitelist (incident, change_task, sc_task)
- ✅ Logging detalhado
- ✅ Metrics tracking
- ✅ Error handling robusto
- ✅ Response type-safe

---

### **FASE 2: Frontend - Edit Mode UI (Dia 2-3)**

#### 2.1 Adicionar Edit State ao EnhancedTicketModal.ts

**Modificações no generateModal():**

```typescript
export class EnhancedTicketModalView {
  static generateModal(props: EnhancedModalProps): string {
    return `
      <div id="ticket-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 modal-professional" data-edit-mode="false">
        <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
          <!-- Modal Header com Edit Button -->
          ${this.generateModalHeader(props.ticket)}

          <!-- Modal Tabs -->
          ${this.generateTabs()}

          <!-- Modal Content -->
          <div class="flex-1 overflow-hidden">
            <!-- Detalhes Tab com Edit Mode -->
            <div id="tab-detalhes" class="tab-content active overflow-y-auto p-6 h-full">
              ${this.generateDetailsTabWithEdit(props.ticket)}
            </div>

            <!-- Outras tabs permanecem iguais -->
            <!-- ... -->
          </div>

          <!-- Modal Footer com Save/Cancel -->
          ${this.generateEditableModalFooter(props.ticket)}
        </div>

        ${props.showRealTime ? this.generateRealTimeScript(props.ticket.sys_id) : ""}
        ${this.generateEditModeScript(props.ticket)}
      </div>

      ${this.generateModalStyles()}
      ${this.generateModalScript()}
    `;
  }
}
```

#### 2.2 Criar generateDetailsTabWithEdit()

**Novo método para tab de detalhes editável:**

```typescript
private static generateDetailsTabWithEdit(ticket: TicketData): string {
  return `
    <div class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Informações Básicas -->
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            Informações Básicas
          </h3>

          <div class="space-y-3">
            <!-- Número (Read-Only) -->
            <div class="flex justify-between">
              <span class="font-medium text-gray-700">Número:</span>
              <span class="text-gray-900">${ticket.number}</span>
            </div>

            <!-- Estado (Editable) -->
            <div class="flex justify-between items-center">
              <span class="font-medium text-gray-700">Estado:</span>

              <!-- View Mode -->
              <span class="view-mode-field px-2 py-1 text-xs font-medium bg-${this.getStateColor(ticket.state)}-100 text-${this.getStateColor(ticket.state)}-800 rounded">
                ${this.getStateText(ticket.state)}
              </span>

              <!-- Edit Mode -->
              <select
                name="state"
                class="edit-mode-field hidden px-2 py-1 text-xs font-medium border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                data-original-value="${ticket.state}"
              >
                <option value="1" ${ticket.state === '1' ? 'selected' : ''}>Novo</option>
                <option value="2" ${ticket.state === '2' ? 'selected' : ''}>Em Andamento</option>
                <option value="3" ${ticket.state === '3' ? 'selected' : ''}>Em Espera</option>
                <option value="6" ${ticket.state === '6' ? 'selected' : ''}>Resolvido</option>
                <option value="7" ${ticket.state === '7' ? 'selected' : ''}>Fechado</option>
                <option value="8" ${ticket.state === '8' ? 'selected' : ''}>Cancelado</option>
              </select>
            </div>

            <!-- Prioridade (Editable) -->
            <div class="flex justify-between items-center">
              <span class="font-medium text-gray-700">Prioridade:</span>

              <!-- View Mode -->
              <span class="view-mode-field px-2 py-1 text-xs font-medium bg-${this.getPriorityColor(ticket.priority)}-100 text-${this.getPriorityColor(ticket.priority)}-800 rounded">
                P${ticket.priority}
              </span>

              <!-- Edit Mode -->
              <select
                name="priority"
                class="edit-mode-field hidden px-2 py-1 text-xs font-medium border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                data-original-value="${ticket.priority}"
              >
                <option value="1" ${ticket.priority === '1' ? 'selected' : ''}>P1 - Crítica</option>
                <option value="2" ${ticket.priority === '2' ? 'selected' : ''}>P2 - Alta</option>
                <option value="3" ${ticket.priority === '3' ? 'selected' : ''}>P3 - Moderada</option>
                <option value="4" ${ticket.priority === '4' ? 'selected' : ''}>P4 - Baixa</option>
                <option value="5" ${ticket.priority === '5' ? 'selected' : ''}>P5 - Planejamento</option>
              </select>
            </div>

            <!-- Assignment Group (Editable) -->
            <div class="flex justify-between items-center">
              <span class="font-medium text-gray-700">Grupo:</span>

              <!-- View Mode -->
              <span class="view-mode-field text-gray-900">${ticket.assignment_group || 'Não atribuído'}</span>

              <!-- Edit Mode -->
              <input
                type="text"
                name="assignment_group"
                class="edit-mode-field hidden px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 w-64"
                value="${ticket.assignment_group || ''}"
                data-original-value="${ticket.assignment_group || ''}"
                placeholder="Nome do grupo"
              />
            </div>
          </div>
        </div>

        <!-- Descrição (Editable) -->
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg class="w-5 h-5 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"></path>
            </svg>
            Descrição
          </h3>

          <!-- Short Description (Editable) -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Descrição Curta</label>

            <!-- View Mode -->
            <p class="view-mode-field text-gray-900 text-sm">${ticket.short_description}</p>

            <!-- Edit Mode -->
            <input
              type="text"
              name="short_description"
              class="edit-mode-field hidden w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              value="${ticket.short_description}"
              data-original-value="${ticket.short_description}"
              maxlength="160"
              placeholder="Descrição curta do ticket (3-160 caracteres)"
            />
            <span class="edit-mode-field hidden text-xs text-gray-500 mt-1" id="short-desc-counter">0/160</span>
          </div>

          <!-- Full Description (Editable) -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Descrição Completa</label>

            <!-- View Mode -->
            <p class="view-mode-field text-gray-700 text-sm whitespace-pre-wrap">${ticket.description || 'Sem descrição'}</p>

            <!-- Edit Mode -->
            <textarea
              name="description"
              class="edit-mode-field hidden w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 h-32"
              data-original-value="${ticket.description || ''}"
              maxlength="4000"
              placeholder="Descrição detalhada do ticket (até 4000 caracteres)"
            >${ticket.description || ''}</textarea>
            <span class="edit-mode-field hidden text-xs text-gray-500 mt-1" id="desc-counter">0/4000</span>
          </div>
        </div>
      </div>

      <!-- Work Notes Section (Edit Mode Only) -->
      <div class="edit-mode-field hidden bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
          </svg>
          Nota de Trabalho (Opcional)
        </h3>

        <textarea
          name="work_notes"
          class="w-full px-3 py-2 text-sm border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-500 h-24"
          maxlength="4000"
          placeholder="Adicione uma nota explicando as mudanças realizadas..."
        ></textarea>
        <p class="text-xs text-gray-600 mt-2">
          💡 Esta nota será registrada no histórico do ticket como trabalho realizado.
        </p>
      </div>

      <!-- Validation Errors Display -->
      <div id="validation-errors" class="hidden bg-red-50 border border-red-200 rounded-lg p-4">
        <h4 class="text-sm font-semibold text-red-800 mb-2 flex items-center">
          <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
          </svg>
          Erros de Validação
        </h4>
        <ul id="validation-error-list" class="text-sm text-red-700 list-disc list-inside space-y-1"></ul>
      </div>
    </div>
  `;
}
```

**Features:**
- ✅ Dual mode: View mode + Edit mode
- ✅ CSS classes para toggle (.view-mode-field, .edit-mode-field)
- ✅ data-original-value para rollback em cancelamento
- ✅ Character counters para campos com limite
- ✅ Work notes section (opcional)
- ✅ Validation errors display
- ✅ Campos read-only (número, datas) vs editáveis

#### 2.3 Atualizar generateEditableModalFooter()

```typescript
private static generateEditableModalFooter(ticket: TicketData): string {
  return `
    <div class="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-between items-center">
      <div class="flex items-center space-x-4">
        <span class="text-sm text-gray-500">
          Última atualização: ${this.formatDateTime(ticket.sys_updated_on)}
        </span>
        <div id="real-time-indicator" class="flex items-center space-x-2 text-green-600">
          <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span class="text-xs">Tempo real ativo</span>
        </div>
      </div>

      <div class="flex items-center space-x-3">
        <!-- View Mode Buttons -->
        <div id="view-mode-buttons" class="flex items-center space-x-3">
          <button
            onclick="toggleEditMode()"
            class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
            Editar Ticket
          </button>

          <button
            onclick="openServiceNow('${ticket.sys_id}', '${ticket.table}')"
            class="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
            Abrir no ServiceNow
          </button>

          <button
            onclick="closeModal()"
            class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gray-600 border border-transparent rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            Fechar
          </button>
        </div>

        <!-- Edit Mode Buttons (Hidden by default) -->
        <div id="edit-mode-buttons" class="hidden flex items-center space-x-3">
          <button
            onclick="saveTicketChanges()"
            id="save-ticket-btn"
            class="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span id="save-btn-text">Salvar Alterações</span>
          </button>

          <button
            onclick="cancelEdit()"
            class="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  `;
}
```

**Features:**
- ✅ Dois conjuntos de botões: view-mode-buttons e edit-mode-buttons
- ✅ Toggle entre modos
- ✅ Botão "Editar Ticket" para entrar em edit mode
- ✅ Botões "Salvar" e "Cancelar" em edit mode
- ✅ Loading state no botão salvar
- ✅ Disabled state durante save

---

### **FASE 3: Frontend - JavaScript Logic (Dia 3)**

#### 3.1 Criar generateEditModeScript()

```typescript
private static generateEditModeScript(ticket: TicketData): string {
  return `
    <script>
      // Edit Mode State
      let isEditMode = false;
      let originalValues = {};
      let hasUnsavedChanges = false;

      /**
       * Toggle between view and edit modes
       */
      function toggleEditMode() {
        isEditMode = !isEditMode;
        const modal = document.getElementById('ticket-modal');
        modal.setAttribute('data-edit-mode', isEditMode);

        if (isEditMode) {
          enterEditMode();
        } else {
          exitEditMode();
        }
      }

      /**
       * Enter edit mode
       */
      function enterEditMode() {
        console.log('📝 Entering edit mode');

        // Hide view mode fields, show edit mode fields
        document.querySelectorAll('.view-mode-field').forEach(el => {
          el.classList.add('hidden');
        });

        document.querySelectorAll('.edit-mode-field').forEach(el => {
          el.classList.remove('hidden');
        });

        // Toggle buttons
        document.getElementById('view-mode-buttons').classList.add('hidden');
        document.getElementById('edit-mode-buttons').classList.remove('hidden');

        // Store original values for rollback
        storeOriginalValues();

        // Setup character counters
        setupCharacterCounters();

        // Setup change detection
        setupChangeDetection();

        // Disable real-time updates (para evitar conflitos)
        if (window.stopRealTimeUpdates) {
          window.stopRealTimeUpdates();
        }
      }

      /**
       * Exit edit mode (without saving)
       */
      function exitEditMode() {
        console.log('👁️ Exiting edit mode');

        // Show view mode fields, hide edit mode fields
        document.querySelectorAll('.view-mode-field').forEach(el => {
          el.classList.remove('hidden');
        });

        document.querySelectorAll('.edit-mode-field').forEach(el => {
          el.classList.add('hidden');
        });

        // Toggle buttons
        document.getElementById('view-mode-buttons').classList.remove('hidden');
        document.getElementById('edit-mode-buttons').classList.add('hidden');

        // Clear validation errors
        hideValidationErrors();

        // Re-enable real-time updates
        if (window.startRealTimeUpdates) {
          window.startRealTimeUpdates();
        }
      }

      /**
       * Store original field values
       */
      function storeOriginalValues() {
        originalValues = {};
        document.querySelectorAll('.edit-mode-field[data-original-value]').forEach(field => {
          if (field.name) {
            originalValues[field.name] = field.getAttribute('data-original-value');
          }
        });
        console.log('💾 Original values stored:', originalValues);
      }

      /**
       * Setup character counters for text fields
       */
      function setupCharacterCounters() {
        const shortDescField = document.querySelector('input[name="short_description"]');
        const descField = document.querySelector('textarea[name="description"]');

        if (shortDescField) {
          const counter = document.getElementById('short-desc-counter');
          shortDescField.addEventListener('input', (e) => {
            const count = e.target.value.length;
            counter.textContent = \`\${count}/160\`;
            counter.className = count > 160 ? 'text-xs text-red-500 mt-1' : 'text-xs text-gray-500 mt-1';
          });
          // Initialize counter
          shortDescField.dispatchEvent(new Event('input'));
        }

        if (descField) {
          const counter = document.getElementById('desc-counter');
          descField.addEventListener('input', (e) => {
            const count = e.target.value.length;
            counter.textContent = \`\${count}/4000\`;
            counter.className = count > 4000 ? 'text-xs text-red-500 mt-1' : 'text-xs text-gray-500 mt-1';
          });
          // Initialize counter
          descField.dispatchEvent(new Event('input'));
        }
      }

      /**
       * Setup change detection
       */
      function setupChangeDetection() {
        document.querySelectorAll('.edit-mode-field[name]').forEach(field => {
          field.addEventListener('change', () => {
            hasUnsavedChanges = true;
            console.log('⚠️ Unsaved changes detected');
          });
        });
      }

      /**
       * Cancel edit and rollback changes
       */
      function cancelEdit() {
        if (hasUnsavedChanges) {
          const confirmed = confirm('Você tem alterações não salvas. Deseja descartar as mudanças?');
          if (!confirmed) return;
        }

        // Rollback all fields to original values
        document.querySelectorAll('.edit-mode-field[name]').forEach(field => {
          if (field.name && originalValues[field.name] !== undefined) {
            field.value = originalValues[field.name];
          }
        });

        hasUnsavedChanges = false;
        toggleEditMode();
      }

      /**
       * Validate field values
       */
      function validateFields() {
        const errors = {};

        // Short description validation
        const shortDesc = document.querySelector('input[name="short_description"]')?.value;
        if (shortDesc && (shortDesc.length < 3 || shortDesc.length > 160)) {
          errors.short_description = 'Descrição curta deve ter entre 3 e 160 caracteres';
        }

        // Description validation
        const desc = document.querySelector('textarea[name="description"]')?.value;
        if (desc && desc.length > 4000) {
          errors.description = 'Descrição completa não pode exceder 4000 caracteres';
        }

        // Priority validation
        const priority = document.querySelector('select[name="priority"]')?.value;
        if (priority && !/^[1-5]$/.test(priority)) {
          errors.priority = 'Prioridade deve ser entre 1 e 5';
        }

        // Urgency/Impact validation
        const urgency = document.querySelector('select[name="urgency"]')?.value;
        if (urgency && !/^[1-3]$/.test(urgency)) {
          errors.urgency = 'Urgência deve ser entre 1 e 3';
        }

        const impact = document.querySelector('select[name="impact"]')?.value;
        if (impact && !/^[1-3]$/.test(impact)) {
          errors.impact = 'Impacto deve ser entre 1 e 3';
        }

        return errors;
      }

      /**
       * Show validation errors
       */
      function showValidationErrors(errors) {
        const errorDiv = document.getElementById('validation-errors');
        const errorList = document.getElementById('validation-error-list');

        errorList.innerHTML = '';
        Object.entries(errors).forEach(([field, message]) => {
          const li = document.createElement('li');
          li.textContent = \`\${field}: \${message}\`;
          errorList.appendChild(li);
        });

        errorDiv.classList.remove('hidden');
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      /**
       * Hide validation errors
       */
      function hideValidationErrors() {
        document.getElementById('validation-errors').classList.add('hidden');
      }

      /**
       * Collect changed fields
       */
      function collectChangedFields() {
        const changes = {};

        document.querySelectorAll('.edit-mode-field[name]').forEach(field => {
          if (field.name && originalValues[field.name] !== undefined) {
            const currentValue = field.value;
            const originalValue = originalValues[field.name];

            // Only include if value changed
            if (currentValue !== originalValue) {
              changes[field.name] = currentValue;
            }
          }
        });

        // Always include work_notes if present (even if empty)
        const workNotes = document.querySelector('textarea[name="work_notes"]')?.value;
        if (workNotes && workNotes.trim()) {
          changes.work_notes = workNotes;
        }

        return changes;
      }

      /**
       * Save ticket changes
       */
      async function saveTicketChanges() {
        console.log('💾 Saving ticket changes...');

        // Validate fields
        const validationErrors = validateFields();
        if (Object.keys(validationErrors).length > 0) {
          showValidationErrors(validationErrors);
          return;
        }

        hideValidationErrors();

        // Collect changed fields
        const changes = collectChangedFields();

        if (Object.keys(changes).length === 0) {
          alert('Nenhuma alteração foi feita.');
          return;
        }

        console.log('📤 Sending changes:', changes);

        // Disable save button and show loading
        const saveBtn = document.getElementById('save-ticket-btn');
        const saveBtnText = document.getElementById('save-btn-text');
        saveBtn.disabled = true;
        saveBtnText.textContent = 'Salvando...';

        try {
          const response = await fetch('/modal/ticket/${ticket.table}/${ticket.sys_id}', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(changes),
          });

          const result = await response.json();

          if (response.ok && result.success) {
            console.log('✅ Ticket updated successfully:', result);

            // Show success notification
            showNotification('✅ Ticket atualizado com sucesso!', 'success');

            // Wait 1 second then reload modal to show updated data
            setTimeout(() => {
              location.reload(); // Reload entire page to fetch fresh data
            }, 1000);

          } else {
            console.error('❌ Failed to update ticket:', result);

            if (result.validation_errors) {
              showValidationErrors(result.validation_errors);
            } else {
              alert(\`Erro ao salvar: \${result.error || 'Erro desconhecido'}\`);
            }

            // Re-enable button
            saveBtn.disabled = false;
            saveBtnText.textContent = 'Salvar Alterações';
          }

        } catch (error) {
          console.error('❌ Network error:', error);
          alert('Erro de rede. Verifique sua conexão e tente novamente.');

          // Re-enable button
          saveBtn.disabled = false;
          saveBtnText.textContent = 'Salvar Alterações';
        }
      }

      /**
       * Show notification toast
       */
      function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = \`fixed top-4 right-4 z-[60] px-6 py-4 rounded-lg shadow-lg \${
          type === 'success' ? 'bg-green-500' :
          type === 'error' ? 'bg-red-500' :
          'bg-blue-500'
        } text-white font-medium transition-all duration-300 transform translate-x-0\`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
          notification.style.transform = 'translateX(0)';
        }, 10);

        // Remove after 3 seconds
        setTimeout(() => {
          notification.style.transform = 'translateX(full)';
          setTimeout(() => notification.remove(), 300);
        }, 3000);
      }

      // Warn user about unsaved changes before closing modal
      window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges && isEditMode) {
          e.preventDefault();
          e.returnValue = '';
          return '';
        }
      });

      // Warn before closing modal manually
      const originalCloseModal = window.closeModal;
      window.closeModal = function() {
        if (hasUnsavedChanges && isEditMode) {
          const confirmed = confirm('Você tem alterações não salvas. Deseja fechar mesmo assim?');
          if (!confirmed) return;
        }
        originalCloseModal();
      };
    </script>
  `;
}
```

**Features Implementadas:**
- ✅ Edit mode toggle completo
- ✅ Store/rollback original values
- ✅ Character counters dinâmicos
- ✅ Change detection
- ✅ Client-side validation
- ✅ Validation errors display
- ✅ Changed fields collection (diff tracking)
- ✅ API call com error handling
- ✅ Loading states
- ✅ Success/error notifications
- ✅ Unsaved changes warning
- ✅ Auto-reload após save
- ✅ Disable real-time durante edição

---

### **FASE 4: Testing & Validation (Dia 4)**

#### 4.1 Test Checklist

**Backend Tests:**
```bash
# Test PUT endpoint
curl -X PUT http://localhost:3008/modal/ticket/incident/abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "short_description": "Updated ticket description",
    "priority": "2",
    "state": "2"
  }'

# Expected response:
{
  "success": true,
  "sys_id": "abc123",
  "updated_fields": ["short_description", "priority", "state"],
  "timestamp": "2025-09-30T15:00:00.000Z"
}
```

**Frontend Tests:**
1. ✅ Modal carrega em view mode
2. ✅ Click "Editar" entra em edit mode
3. ✅ Campos read-only permanecem read-only
4. ✅ Campos editáveis mostram inputs
5. ✅ Character counters funcionam
6. ✅ Validation em tempo real funciona
7. ✅ "Cancelar" restaura valores originais
8. ✅ "Salvar" envia apenas campos alterados
9. ✅ Success notification aparece
10. ✅ Modal recarrega com dados atualizados
11. ✅ Error handling funciona
12. ✅ Unsaved changes warning funciona

#### 4.2 Integration Tests

**Cenários de Teste:**

1. **Edição Simples**
   - Alterar prioridade de P3 para P2
   - Verificar update no MongoDB
   - Verificar update no ServiceNow
   - Verificar histórico registrado

2. **Edição Múltiplos Campos**
   - Alterar prioridade, estado e descrição
   - Verificar todos os campos atualizados
   - Verificar work_notes no histórico

3. **Validação de Erros**
   - Tentar descrição curta < 3 caracteres
   - Verificar erro exibido
   - Verificar save bloqueado

4. **Cancelamento**
   - Alterar campos
   - Clicar "Cancelar"
   - Verificar valores originais restaurados

5. **Conflito Real-time**
   - Abrir ticket em edit mode
   - Outro usuário altera o ticket
   - Verificar handling do conflito (atualmente: last write wins)

---

### **FASE 5: Documentation & Release (Dia 5)**

#### 5.1 Atualizar PROGRESS_CORE_SERVICES_MIGRATION_V5.0.0.md

Adicionar seção completa v5.5.4 documentando:
- ✅ Implementação backend (endpoint PUT)
- ✅ Implementação frontend (edit mode UI)
- ✅ JavaScript logic (validation, save)
- ✅ Testing results
- ✅ Known limitations

#### 5.2 Criar Migration Notes

**Breaking Changes:** Nenhuma
**New Features:**
- ✅ Ticket edit functionality via modal
- ✅ TypeBox validation para updates
- ✅ Client-side validation
- ✅ Work notes support
- ✅ Change tracking

**Dependencies:** Nenhuma nova
**Configuration:** Nenhuma mudança necessária

---

## 🎯 SUCCESS CRITERIA

### Technical Success
- ✅ PUT endpoint funcional com TypeBox validation
- ✅ Edit mode UI completo e profissional
- ✅ Client-side e server-side validation
- ✅ Error handling robusto
- ✅ 100% TypeScript type-safe
- ✅ Zero hardcoded data

### User Experience Success
- ✅ UI intuitiva com toggle view/edit
- ✅ Character counters em tempo real
- ✅ Validation feedback clara
- ✅ Success/error notifications
- ✅ Unsaved changes protection
- ✅ Loading states durante save

### Integration Success
- ✅ MongoDB cache updated
- ✅ ServiceNow API updated via existing service
- ✅ Redis Streams event emitted
- ✅ History tracking funcional
- ✅ Metrics recorded

---

## 🚨 KNOWN LIMITATIONS & FUTURE ENHANCEMENTS

### Current Limitations
1. **Last Write Wins:** Sem conflict resolution se dois usuários editarem simultaneamente
2. **No Field-Level Permissions:** Todos os campos editáveis para todos (futuro: RBAC)
3. **No Audit Trail UI:** Changes registradas mas sem UI para visualizar detalhes
4. **No Undo/Redo:** Apenas cancel antes de save
5. **No Bulk Edit:** Apenas um ticket por vez

### Future Enhancements (v5.6.x+)
- **Optimistic Locking:** Detectar conflitos de edição
- **Field-Level Permissions:** RBAC integration
- **Audit Trail Tab:** Visualizar quem mudou o quê
- **Undo/Redo:** History stack para múltiplos níveis
- **Bulk Edit:** Selecionar múltiplos tickets para editar
- **Auto-Save:** Save automático a cada N segundos
- **Collaborative Editing:** Mostrar quem está editando em tempo real

---

## 📊 ESTIMATED EFFORT

### Time Breakdown
- **Dia 1:** Backend (API + Schemas) - 4-6 horas
- **Dia 2-3:** Frontend (UI + JavaScript) - 8-10 horas
- **Dia 4:** Testing & Bug Fixes - 4-6 horas
- **Dia 5:** Documentation & Release - 2-3 horas

**Total:** 18-25 horas (3-5 dias úteis)

### Resource Requirements
- 1 Senior Full-Stack Developer
- Access to development ServiceNow instance
- Access to MongoDB/Redis infrastructure

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Backend
- [ ] Adicionar UpdateTicketSchema em TicketTypes.ts
- [ ] Adicionar UpdateTicketResponse interface
- [ ] Criar PUT endpoint em ModalRoutes.ts
- [ ] TypeBox validation configurada
- [ ] Error handling implementado
- [ ] Metrics tracking configurado
- [ ] Logging detalhado adicionado

### Frontend - UI
- [ ] generateDetailsTabWithEdit() criado
- [ ] generateEditableModalFooter() atualizado
- [ ] View mode fields CSS (.view-mode-field)
- [ ] Edit mode fields CSS (.edit-mode-field)
- [ ] Character counters UI
- [ ] Validation errors display
- [ ] Work notes section
- [ ] Edit/Save/Cancel buttons

### Frontend - JavaScript
- [ ] toggleEditMode() implementado
- [ ] enterEditMode() implementado
- [ ] exitEditMode() implementado
- [ ] storeOriginalValues() implementado
- [ ] setupCharacterCounters() implementado
- [ ] setupChangeDetection() implementado
- [ ] cancelEdit() implementado
- [ ] validateFields() implementado
- [ ] collectChangedFields() implementado
- [ ] saveTicketChanges() implementado
- [ ] showNotification() implementado
- [ ] Unsaved changes warning

### Testing
- [ ] Backend unit tests
- [ ] API endpoint tests (curl)
- [ ] Frontend manual tests (checklist acima)
- [ ] Integration tests
- [ ] Error scenarios tests
- [ ] Performance tests

### Documentation
- [ ] PROGRESS_CORE_SERVICES_MIGRATION_V5.0.0.md updated
- [ ] API documentation updated
- [ ] User guide created
- [ ] Developer notes documented

### Release
- [ ] Code review completed
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Git commit with detailed message
- [ ] Git push to main
- [ ] Version tag (v5.5.4)

---

## 🎯 PRÓXIMOS PASSOS APÓS v5.5.4

1. **v5.6.0 - Dead Letter Queue**
   - Redis Streams DLQ implementation
   - Error tracking e recovery
   - Manual retry UI

2. **Resolver TODOs em Produção**
   - Analytics calculations (não hardcoded)
   - Notification system implementation
   - Task details modal

3. **v5.2.0 - AI Services Migration**
   - KnowledgeGraphService → Plugin
   - NeuralSearchService → Plugin

---

**Status Final:** 📋 PLANO COMPLETO E PRONTO PARA IMPLEMENTAÇÃO

**Aprovação:** Aguardando confirmação do usuário para iniciar implementação

**Autor: Juliano Stefano <jsdealencar@ayesa.com> [2025]**
