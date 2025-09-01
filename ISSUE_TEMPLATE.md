# Issue Template - Implementação Completa

**Para criar o issue manualmente no GitHub, copie e cole o conteúdo abaixo:**

---

**Título**: 🚧 Implementação Completa - Paridade Funcional com PySNC

**Labels**: `enhancement`, `help wanted`, `good first issue`

**Conteúdo**:

## 🎯 Objetivo
Implementar 100% das funcionalidades do PySNC no bunsnc para paridade funcional completa.

## 📊 Status Atual
- **Implementado**: ~40% das funcionalidades PySNC
- **Faltando**: ~60% das funcionalidades críticas e importantes
- **Prazo**: 2-3 semanas (80-120 horas)

## 🚨 Funcionalidades Críticas Ausentes

### 1. Query Builder Avançado - PRIORIDADE MÁXIMA
- [ ] Sistema de Query com operadores complexos (`=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `CONTAINS`, etc.)
- [ ] OR conditions (`add_or_condition`)
- [ ] JOIN queries (`add_join_query`) 
- [ ] RL queries (`add_rl_query`) - Related List queries
- [ ] Null queries (`add_null_query`, `add_not_null_query`)
- [ ] Encoded queries (`add_encoded_query`)
- [ ] Order by ascendente/descendente (`order_by`, `order_by_desc`)

### 2. GlideRecord Pattern - PRIORIDADE MÁXIMA
- [ ] GlideRecord completo com iteração (`next()`, `has_next()`, `rewind()`)
- [ ] GlideElement com `display_value`, `value`, `link`
- [ ] Serialização avançada (`serialize()`, `serialize_all()`)
- [ ] Navegação e manipulação de registros
- [ ] Paginação automática
- [ ] Iterator pattern com `Symbol.iterator`

### 3. Sistema de Exceções Específico - PRIORIDADE ALTA
- [ ] `AuthenticationException`, `InsertException`, `UpdateException`
- [ ] `DeleteException`, `NotFoundException`, `RequestException`
- [ ] `RoleException`, `EvaluationException`, `AclQueryException`
- [ ] Tratamento granular de erros por operação

## 📅 Milestones

### Milestone 1 - Funcionalidades Críticas (Semana 1-2)
- [ ] **Query Builder Avançado** (3-4 dias)
- [ ] **GlideRecord Pattern** (4-5 dias)  
- [ ] **Sistema de Exceções** (1 dia)

### Milestone 2 - Funcionalidades Importantes (Semana 2-3)
- [ ] **ServiceNow Client Completo** (2-3 dias)
- [ ] **Attachment Funcionalidades Avançadas** (2 dias)
- [ ] **Paginação Automática** (1-2 dias)
- [ ] **Batch Processing Avançado** (2 dias)

### Milestone 3 - Funcionalidades Complementares (Semana 3)
- [ ] **OAuth Avançado** (2 dias)
- [ ] **Auto Retry e Resilência** (1 dia)
- [ ] **Serialização Avançada** (1 dia)

## 🧪 Critérios de Aceitação
- [ ] 100% paridade com PySNC em funcionalidades core
- [ ] Cobertura de testes >= 90%
- [ ] Todos os testes passando (unitários + integração)
- [ ] CLI e API HTTP funcionais
- [ ] TypeScript strict mode
- [ ] Performance comparable ao PySNC

## 📚 Documentação
- [x] Planejamento completo: `PLANEJAMENTO_IMPLEMENTACAO_COMPLETA.md`
- [ ] Documentação de APIs atualizada
- [ ] Exemplos de migração PySNC → bunsnc
- [ ] Guia de desenvolvimento

---

**Documento detalhado**: Ver `PLANEJAMENTO_IMPLEMENTACAO_COMPLETA.md`  
**Status**: 📋 Planejamento Completo → Aguardando Implementação  
**Data Criação**: 2025-01-09