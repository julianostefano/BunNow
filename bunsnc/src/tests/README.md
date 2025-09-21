# ServiceNow Endpoint Testing and Data Mapping

**Author:** Juliano Stefano <jsdealencar@ayesa.com> [2025]

Este módulo contém ferramentas abrangentes para testar, mapear e analisar endpoints do ServiceNow, preparando o terreno para implementação de armazenamento otimizado.

## 📋 Visão Geral

### Componentes Principais

1. **ServiceNowEndpointMapper** - Framework principal para análise de endpoints
2. **CLI Endpoint Tests** - Interface de linha de comando para testes
3. **Ticket Data Analysis** - Análise especializada para tabelas de tickets
4. **Enhanced Storage Service** - Serviço de armazenamento otimizado

## 🚀 Quick Start

### 1. Configuração Inicial

```bash
# Copiar template de configuração
cp .env.example .env

# Editar .env com suas credenciais do ServiceNow
# SERVICENOW_INSTANCE_URL=https://sua-instancia.service-now.com
# SERVICENOW_USERNAME=seu-usuario
# SERVICENOW_PASSWORD=sua-senha
```

### 2. Teste de Conectividade

```bash
# Teste rápido de conectividade
bun run test:quick

# ou diretamente
bun src/tests/cli-endpoint-tests.ts quick-test
```

### 3. Análise Completa

```bash
# Análise completa com geração de interfaces TypeScript
bun run test:mapping

# Análise específica de tickets
bun run analyze:tickets
```

## 🔧 Comandos Disponíveis

### Scripts NPM Configurados

```bash
bun run test:endpoints     # Mostra ajuda dos testes de endpoint
bun run test:quick         # Teste rápido de conectividade
bun run test:mapping       # Análise completa com interfaces TS
bun run analyze:tickets    # Análise especializada de tickets
```

### Comandos CLI Detalhados

#### 1. Teste de Tabela Específica

```bash
bun src/tests/cli-endpoint-tests.ts test-table -t incident -l 100
bun src/tests/cli-endpoint-tests.ts test-table -t change_task -l 50 -f "active=true"
```

#### 2. Mapeamento de Estrutura

```bash
bun src/tests/cli-endpoint-tests.ts map-structure -t incident -s 200 --export
bun src/tests/cli-endpoint-tests.ts map-structure -t sys_user_group -s 100
```

#### 3. Teste de Performance

```bash
bun src/tests/cli-endpoint-tests.ts performance-test -t incident
bun src/tests/cli-endpoint-tests.ts performance-test -t change_task
```

#### 4. Comparação de Tabelas

```bash
bun src/tests/cli-endpoint-tests.ts compare-tables -t "incident,change_task,sc_task"
```

#### 5. Análise de Campos Específicos

```bash
bun src/tests/cli-endpoint-tests.ts field-analysis -f assignment_group
bun src/tests/cli-endpoint-tests.ts field-analysis -f state -t "incident,change_task"
```

#### 6. Análise Completa

```bash
bun src/tests/cli-endpoint-tests.ts analyze-all --generate-interfaces
```

## 📊 Estrutura de Saída

### Diretórios Gerados

```
src/tests/
├── data-schemas/           # Esquemas descobertos
│   ├── endpoint-test-results.json
│   ├── table-schemas.json
│   ├── mapping-summary.json
│   ├── servicenow-interfaces.ts
│   └── incident-schema.json
├── ticket-analysis/        # Análise específica de tickets
│   ├── incident-analysis.json
│   ├── change_task-analysis.json
│   ├── sc_task-analysis.json
│   ├── ticket-tables-comparison.json
│   └── mongodb-schemas/
│       ├── base-ticket-schema.json
│       └── incident-schema.json
```

### Arquivos de Resultado

#### endpoint-test-results.json

```json
[
  {
    "endpoint": "/api/now/table/incident",
    "status": "success",
    "responseTime": 245,
    "recordCount": 100,
    "sampleData": [...]
  }
]
```

#### table-schemas.json

```json
[
  {
    "tableName": "incident",
    "totalRecords": 100,
    "analyzedRecords": 100,
    "fields": [
      {
        "fieldName": "sys_id",
        "dataType": "guid",
        "isRequired": true,
        "frequency": 100,
        "uniqueValues": 100
      }
    ],
    "relationships": [...],
    "performance": {...}
  }
]
```

## 🎯 Casos de Uso Típicos

### 1. Nova Implementação

```bash
# 1. Teste inicial de conectividade
bun run test:quick

# 2. Análise completa do ambiente
bun run test:mapping

# 3. Análise específica de tickets
bun run analyze:tickets

# 4. Revisar resultados em data-schemas/ e ticket-analysis/
```

### 2. Troubleshooting

```bash
# Testar tabela específica com problemas
bun src/tests/cli-endpoint-tests.ts test-table -t incident -l 10

# Analisar performance de tabela lenta
bun src/tests/cli-endpoint-tests.ts performance-test -t incident

# Comparar estruturas entre ambientes
bun src/tests/cli-endpoint-tests.ts map-structure -t incident --export
```

### 3. Desenvolvimento

```bash
# Explorar novo campo
bun src/tests/cli-endpoint-tests.ts field-analysis -f novo_campo

# Comparar implementações
bun src/tests/cli-endpoint-tests.ts compare-tables -t "tabela1,tabela2"

# Gerar interfaces TypeScript atualizadas
bun src/tests/cli-endpoint-tests.ts analyze-all --generate-interfaces
```

## 🔍 Análise de Dados

### Tipos de Campo Identificados

1. **Universal Fields** (100% frequência)
   - `sys_id`, `number`, `short_description`, `state`

2. **Common Fields** (80%+ frequência)
   - `description`, `priority`, `assignment_group`

3. **Type-Specific Fields**
   - **Incident**: `incident_state`, `severity`, `urgency`
   - **Change Task**: `change_request`, `planned_start_date`
   - **SC Task**: `request_item`, `price`, `quantity`

4. **Reference Fields**
   - `assignment_group` → `sys_user_group.sys_id`
   - `assigned_to` → `sys_user.sys_id`

### Padrões de Performance

- **Incident**: Típicamente 1000+ registros, resposta < 2s
- **Change Task**: Médio volume, resposta < 1s
- **SC Task**: Alto volume, pode precisar paginação

## 📈 Métricas e Monitoramento

### Métricas Coletadas

1. **Conectividade**
   - Tempo de resposta por endpoint
   - Taxa de sucesso/erro
   - Limites de paginação

2. **Estrutura de Dados**
   - Número de campos por tabela
   - Tipos de dados identificados
   - Frequência de preenchimento

3. **Performance**
   - Limites recomendados por tabela
   - Tempo médio de resposta
   - Tamanho médio de resposta

### Relatórios Gerados

- **Mapping Summary**: Visão geral da análise
- **Table Schemas**: Estrutura detalhada por tabela
- **Performance Report**: Métricas de performance
- **TypeScript Interfaces**: Definições de tipos

## 🛡️ Considerações de Segurança

### Dados Sensíveis

- `caller_id` - Informações pessoais
- `description` - Pode conter dados sensíveis
- `work_notes` - Comunicações internas

### Configuração Segura

```bash
# Use variáveis de ambiente
export SERVICENOW_INSTANCE_URL="https://sua-instancia.service-now.com"
export SERVICENOW_USERNAME="usuario-readonly"
export SERVICENOW_PASSWORD="senha-segura"

# Ou configure no .env (não committar no git)
```

### Permissões Recomendadas

- **Mínimo**: Leitura nas tabelas críticas
- **Recomendado**: Role dedicada para integração
- **Evitar**: Credenciais de administrador

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. Erro de Conectividade

```bash
❌ Error: SERVICENOW_INSTANCE_URL environment variable is required
```

**Solução**: Configure as variáveis de ambiente no `.env`

#### 2. Erro de Autenticação

```bash
❌ ServiceNow API Error (401): Unauthorized
```

**Solução**: Verifique credenciais e permissões

#### 3. Timeout

```bash
❌ Error: Request timeout
```

**Solução**: Reduza o tamanho da amostra ou aumente timeout

#### 4. Muitos Resultados

```bash
⚠️ Warning: High response times detected
```

**Solução**: Use paginação ou filtros mais específicos

### Debug Avançado

```bash
# Ativar logs detalhados
export DEBUG=bunsnc:*

# Testar com amostra pequena
bun src/tests/cli-endpoint-tests.ts test-table -t incident -l 5

# Verificar estrutura de resposta
bun src/tests/cli-endpoint-tests.ts map-structure -t incident -s 10
```

## 🚀 Próximos Passos

1. **Após Análise Inicial**
   - Revisar schemas gerados
   - Implementar storage otimizado
   - Configurar índices MongoDB

2. **Desenvolvimento Contínuo**
   - Monitorar mudanças na estrutura
   - Atualizar interfaces TypeScript
   - Otimizar queries baseado no uso

3. **Produção**
   - Implementar sync automático
   - Monitorar performance
   - Configurar alertas

---

Para dúvidas ou sugestões: **Juliano Stefano** <jsdealencar@ayesa.com>
