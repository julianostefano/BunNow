# Planejamento de Implementação Completa - bunsnc

**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**

## 📊 Status Atual vs Meta

**ATUAL**: ~60% das funcionalidades PySNC implementadas ✅ **FASE 1 CONCLUÍDA**  
**META**: 100% paridade funcional com PySNC  
**PRAZO ESTIMADO**: 2-3 semanas (80-120 horas)  
**PROGRESSO**: **Milestone 1 - CONCLUÍDO** (Query Builder Avançado)

---

## 🎯 FASE 1 - FUNCIONALIDADES CRÍTICAS (Semana 1-2)

### 1.1 Query Builder Avançado - ✅ **CONCLUÍDO**
**Estimativa**: 3-4 dias ✅ **IMPLEMENTADO EM 1 DIA** (2025-09-01)

#### Implementações Necessárias:

**Arquivo**: `bunsnc/src/query/QueryBuilder.ts`
```typescript
interface QueryBuilder {
  addQuery(field: string, operator: string, value?: any): QueryCondition;
  addOrCondition(field: string, operator: string, value?: any): OrCondition;
  addJoinQuery(joinTable: string, primaryField?: string, joinTableField?: string): JoinQuery;
  addRLQuery(relatedTable: string, relatedField: string, operatorCondition: string, stopAtRelationship?: boolean): RLQuery;
  addNullQuery(field: string): QueryCondition;
  addNotNullQuery(field: string): QueryCondition;
  addActiveQuery(): QueryCondition;
  addEncodedQuery(query: string): void;
  orderBy(field: string): void;
  orderByDesc(field: string): void;
  generateQuery(): string;
}
```

**Operadores Suportados**:
- Números: `=`, `!=`, `>`, `>=`, `<`, `<=`
- Strings: `=`, `!=`, `IN`, `NOT IN`, `STARTSWITH`, `ENDSWITH`, `CONTAINS`, `DOES NOT CONTAIN`, `INSTANCEOF`
- Especiais: `ISEMPTY`, `ISNOTEMPTY`

**Arquivos Criados**: ✅ **TODOS IMPLEMENTADOS**
- ✅ `bunsnc/src/query/QueryBuilder.ts` - Interface completa compatível PySNC
- ✅ `bunsnc/src/query/QueryCondition.ts` - Condições com OR aninhadas
- ✅ `bunsnc/src/query/OrCondition.ts` - Operador OR
- ✅ `bunsnc/src/query/JoinQuery.ts` - Queries JOIN com tabelas relacionadas
- ✅ `bunsnc/src/query/RLQuery.ts` - Related List queries com stop conditions
- ✅ `bunsnc/src/query/Query.ts` - Classe base Query 
- ✅ `bunsnc/src/query/BaseCondition.ts` - Classe base para condições
- ✅ `bunsnc/src/query/index.ts` - Exports e factory functions

**Testes Implementados**: ✅ **36 TESTES - 100% SUCESSO**
- ✅ `bunsnc/src/tests/query/QueryBuilder.test.ts` - 27 testes unitários
- ✅ `bunsnc/src/tests/integration/QueryBuilder.integration.test.ts` - 9 testes integração

**Integração**: ✅ **COMPLETA**
- ✅ `bunsnc/src/controllers/recordController.ts` - Integração com RecordController
- ✅ `bunsnc/src/examples/QueryBuilderUsage.ts` - Exemplos práticos completos

**Commit**: ✅ `3c61261` - feat(query): Implementação completa Query Builder

### 1.2 GlideRecord Pattern - **PRIORIDADE MÁXIMA**
**Estimativa**: 4-5 dias

#### Implementações Necessárias:

**Arquivo**: `bunsnc/src/record/GlideRecord.ts`
```typescript
interface GlideRecord {
  // Navigation
  next(): boolean;
  hasNext(): boolean;
  rewind(): void;
  
  // CRUD Operations
  get(sysId: string): boolean;
  get(field: string, value: any): boolean;
  insert(): GlideElement | null;
  update(): GlideElement | null;
  delete(): boolean;
  deleteMultiple(): boolean;
  updateMultiple(): boolean;
  
  // Query Methods
  query(): void;
  addQuery(field: string, operator: string, value?: any): QueryCondition;
  // ... todos os métodos de query
  
  // Data Access
  getValue(field: string): any;
  getDisplayValue(field: string): any;
  getElement(field: string): GlideElement;
  setValue(field: string, value: any): void;
  setDisplayValue(field: string, value: any): void;
  
  // Utilities
  serialize(): object;
  serializeAll(): object[];
  changes(): boolean;
  getRowCount(): number;
  getEncodedQuery(): string;
  getLink(): string;
  
  // Iteration
  [Symbol.iterator](): Iterator<GlideRecord>;
}
```

**Arquivo**: `bunsnc/src/record/GlideElement.ts`
```typescript
interface GlideElement {
  getName(): string;
  getValue(): any;
  getDisplayValue(): any;
  getLink(): any;
  setValue(value: any): void;
  setDisplayValue(value: any): void;
  setLink(link: any): void;
  changes(): boolean;
  nil(): boolean;
  serialize(): object;
  dateValue(): Date;
  dateNumericValue(): number;
  setDateNumericValue(ms: number): void;
}
```

**Arquivos a Criar**:
- `bunsnc/src/record/GlideRecord.ts`
- `bunsnc/src/record/GlideElement.ts`
- `bunsnc/src/record/index.ts`

### 1.3 Sistema de Exceções Específico - **PRIORIDADE ALTA**
**Estimativa**: 1 dia

**Arquivo**: `bunsnc/src/exceptions/index.ts`
```typescript
export class AuthenticationException extends Error {}
export class InsertException extends Error {}
export class UpdateException extends Error {}
export class DeleteException extends Error {}
export class NotFoundException extends Error {}
export class RequestException extends Error {}
export class RoleException extends Error {}
export class EvaluationException extends Error {}
export class AclQueryException extends Error {}
export class InstanceException extends Error {}
export class UploadException extends Error {}
export class NoRecordException extends Error {}
```

---

## 🎯 FASE 2 - FUNCIONALIDADES IMPORTANTES (Semana 2-3)

### 2.1 ServiceNow Client Completo - **PRIORIDADE ALTA**
**Estimativa**: 2-3 dias

**Arquivo**: `bunsnc/src/client/ServiceNowClient.ts`
```typescript
interface ServiceNowClient {
  // Factory Methods
  GlideRecord(table: string, batchSize?: number, rewindable?: boolean): GlideRecord;
  Attachment(table: string): Attachment;
  
  // Utilities
  guessIsSysId(value: string): boolean;
  
  // Properties
  instance: string;
  session: any; // HTTP client session
  
  // APIs
  tableApi: TableAPI;
  attachmentApi: AttachmentAPI;
  batchApi: BatchAPI;
}
```

### 2.2 Attachment Funcionalidades Avançadas - **PRIORIDADE ALTA**
**Estimativa**: 2 dias

**Arquivo**: `bunsnc/src/attachment/Attachment.ts`
```typescript
interface Attachment {
  // File Operations
  asTempFile(chunkSize?: number): Promise<Blob>;
  writeTo(path: string, chunkSize?: number): Promise<string>;
  read(): Promise<Uint8Array>;
  readLines(encoding?: string, delimiter?: string): Promise<string[]>;
  
  // CRUD Operations
  get(sysId: string): boolean;
  delete(): boolean;
  addAttachment(tableSysId: string, fileName: string, file: File, contentType?: string): Promise<string>;
  
  // Query Operations
  query(): void;
  addQuery(field: string, operator: string, value?: any): QueryCondition;
  
  // Navigation
  next(): boolean;
  [Symbol.iterator](): Iterator<Attachment>;
  
  // Utilities
  getLink(): string | null;
}
```

### 2.3 Paginação Automática - **PRIORIDADE MÉDIA**
**Estimativa**: 1-2 dias

- Implementar paginação transparente em GlideRecord
- Batch loading automático
- Configuração de batch_size
- Lazy loading de resultados

### 2.4 Batch Processing Avançado - **PRIORIDADE MÉDIA**
**Estimativa**: 2 dias

**Arquivo**: `bunsnc/src/batch/BatchAPI.ts`
```typescript
interface BatchAPI {
  // Request Management
  addRequest(request: any, callback: Function): void;
  execute(attempt?: number): Promise<void>;
  
  // CRUD with Callbacks
  get(record: GlideRecord, sysId: string, callback: Function): void;
  post(record: GlideRecord, callback: Function): void;
  put(record: GlideRecord, callback: Function): void;
  patch(record: GlideRecord, callback: Function): void;
  delete(record: GlideRecord, callback: Function): void;
  list(record: GlideRecord, callback: Function): void;
  
  // Response Transformation
  transformResponse(request: any, response: any): any;
}
```

---

## 🎯 FASE 3 - FUNCIONALIDADES COMPLEMENTARES (Semana 3)

### 3.1 OAuth Avançado - **PRIORIDADE BAIXA**
**Estimativa**: 2 dias

- JWT Authentication
- Token refresh automático
- Session management avançado
- Multiple auth flows

### 3.2 Auto Retry e Resilência - **PRIORIDADE BAIXA**
**Estimativa**: 1 dia

- Retry automático em falhas
- Backoff exponential
- Circuit breaker
- Health checks

### 3.3 Serialização Avançada - **PRIORIDADE BAIXA**
**Estimativa**: 1 dia

- Pandas-style serialization
- Multiple display modes (`smart`, `both`, `value`, `display`)
- Advanced field filtering
- Performance optimizations

---

## 📂 ESTRUTURA DE ARQUIVOS FINAL

```
bunsnc/
├── src/
│   ├── client/
│   │   ├── ServiceNowClient.ts
│   │   └── index.ts
│   ├── record/
│   │   ├── GlideRecord.ts
│   │   ├── GlideElement.ts
│   │   └── index.ts
│   ├── query/
│   │   ├── QueryBuilder.ts
│   │   ├── QueryCondition.ts
│   │   ├── OrCondition.ts
│   │   ├── JoinQuery.ts
│   │   ├── RLQuery.ts
│   │   └── index.ts
│   ├── attachment/
│   │   ├── Attachment.ts
│   │   ├── AttachmentAPI.ts
│   │   └── index.ts
│   ├── batch/
│   │   ├── BatchAPI.ts
│   │   └── index.ts
│   ├── exceptions/
│   │   └── index.ts
│   ├── api/
│   │   ├── TableAPI.ts
│   │   ├── AttachmentAPI.ts
│   │   ├── BatchAPI.ts
│   │   └── index.ts
│   ├── auth/
│   │   ├── ServiceNowFlow.ts
│   │   ├── PasswordGrantFlow.ts
│   │   ├── JWTAuth.ts
│   │   └── index.ts
│   └── utils/
│       ├── instance.ts
│       ├── serialization.ts
│       └── index.ts
```

---

## 🧪 ESTRATÉGIA DE TESTES

### Testes Unitários
- Cada classe/módulo com testes isolados
- Mock de dependências externas
- Cobertura mínima: 90%

### Testes de Integração
- Testes com instância ServiceNow real
- Cenários end-to-end
- Performance benchmarks vs PySNC

### Testes CLI
- Todos os comandos CLI
- Validação de inputs/outputs
- Error handling

---

## 📊 MILESTONES

| Milestone | Prazo | Funcionalidades | Status |
|-----------|-------|-----------------|---------|
| **M1** | Semana 1 | Query Builder + GlideRecord básico | ✅ **CONCLUÍDO** (Query Builder) |
| **M2** | Semana 2 | GlideRecord completo + Exceções + Client | 🔄 **EM ANDAMENTO** |
| **M3** | Semana 2.5 | Attachment avançado + Paginação | ⏳ **PENDENTE** |
| **M4** | Semana 3 | Batch avançado + OAuth + Polish | ⏳ **PENDENTE** |

---

## 🎯 CRITÉRIOS DE ACEITAÇÃO

### Funcional
- [x] Query Builder avançado com paridade PySNC ✅
- [x] Todos os testes passando (36/36) ✅
- [ ] GlideRecord Pattern completo
- [ ] CLI e API HTTP funcionais
- [ ] Documentação atualizada

### Qualidade
- [x] Cobertura de testes >= 90% (Query Builder: 100%) ✅
- [x] TypeScript strict mode ✅
- [ ] Lint/format clean
- [ ] Performance comparable ao PySNC

### Produção
- [ ] Tratamento robusto de erros
- [ ] Logging adequado
- [ ] Configuração de ambiente
- [ ] Docker support

---

**Status**: 🚀 **FASE 1 CONCLUÍDA - QUERY BUILDER IMPLEMENTADO**  
**Próximo**: Fase 2 - GlideRecord Pattern + Exceções  
**Data Atualização**: 2025-09-01  
**Commit**: `3c61261` - Query Builder avançado com 36 testes (100% sucesso)