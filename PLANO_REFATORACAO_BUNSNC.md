# ---
## Mapeamento dos módulos e funcionalidades do pysnc

| Módulo/Função         | pysnc (Python)         | bunsnc (Bun+Elysia)         | Status |
|-----------------------|------------------------|-----------------------------|--------|
| Autenticação          | auth.py                | AuthService, hooks Elysia   | OK     |
| Manipulação de Registros | record.py           | ServiceNowService           | OK     |
| Queries               | query.py               | ServiceNowService           | OK     |
| Anexos                | attachment.py          | AttachmentService           | OK     |
| Serialização          | serialization.py       | utils.ts                    | OK     |
| Exceções              | exceptions.py          | exceptions.ts               | OK     |
| Utilitários           | utils.py               | utils.ts                    | OK     |
| CLI                   | __main__.py            | cli.ts (commander)          | OK     |
| API HTTP              | -                      | app.ts (Elysia)             | OK     |
| Batch                 | -                      | BatchService                | OK     |
| Dynamic Schema        | -                      | schemaRegistry, t.Object    | OK     |

---
## Especificação: Exportação de métodos para CLI e API

- Todos os métodos principais (CRUD, batch, anexos, autenticação) são expostos tanto via CLI (commander) quanto via rotas HTTP (Elysia).
- O CLI utiliza comandos como `login`, `record`, `batch`, `upload`, `download`, etc., mapeando diretamente para os métodos das services.
- A API HTTP expõe rotas RESTful, com validação de tipos forte (t.Object) e threat-safety, compatível com Eden.
- Novos métodos ou módulos devem ser adicionados tanto ao CLI quanto à API, seguindo o padrão de service + controller/route.

---
## Checklist de Compatibilidade

- [x] Autenticação funcional (CLI e API)
- [x] CRUD de registros (CLI e API)
- [x] Queries avançadas (CLI e API)
- [x] Upload/download de anexos (CLI e API)
- [x] Batch operations (CLI e API)
- [x] Dynamic schema/validação (API)
- [x] Exceções e erros mapeados
- [x] Serialização/deserialização
- [x] Documentação de endpoints e CLI
- [x] Testes automatizados principais

---
## Guia de Migração pysnc → bunsnc

1. Instale o bunsnc e configure as variáveis de ambiente (`SNC_INSTANCE_URL`, `SNC_AUTH_TOKEN`).
2. Para scripts CLI, substitua comandos pysnc por equivalentes bunsnc (ex: `python -m pysnc ...` → `bun bunsnc/src/cli.ts ...`).
3. Para integração HTTP, utilize as rotas RESTful documentadas em `app.ts`.
4. Adapte eventuais scripts Python para consumir a API HTTP ou reimplemente usando o CLI JS.
5. Consulte a documentação e exemplos para detalhes de parâmetros, schemas e autenticação.

---
// leitura automatizada para análise de progresso
// ...existing file content...

## 1. Levantamento e Análise
- Mapear todos os módulos e funcionalidades do pysnc (autenticação, manipulação de registros, queries, anexos, etc).
- Identificar dependências externas e integrações (ex: requests HTTP, autenticação ServiceNow).
- Levantar pontos de entrada CLI e fluxos de uso mais comuns.
- Entregáveis: Documento de levantamento de requisitos e funcionalidades.

## 2. Arquitetura Proposta
- Definir estrutura de pastas e responsabilidades dos módulos:
  - `controllers/`: lógica de negócio
  - `routes/`: rotas Elysia
  - `types/`: tipagens compartilhadas
  - `cli/`: comandos CLI
  - `services/`: integrações ServiceNow, autenticação
- Especificar como métodos serão exportados para CLI e API.
- Entregáveis: Diagrama de arquitetura e estrutura inicial de diretórios.

## 3. Refatoração dos Módulos
- Portar funcionalidades do pysnc para JS/TS:
  - Autenticação: service para login/token
  - Query/Record: classes/funções CRUD
  - Attachment: upload/download de anexos
  - Utils: utilitários
- Garantir tipagem forte e reutilização entre CLI e API.
- Entregáveis: Módulos core implementados em JS/TS.

## 4. Implementação CLI
- Definir comandos equivalentes aos do pysnc (query, insert, update, delete, attachment).
- Implementar parsing de argumentos, validação e exibição de resultados.
- Suporte a arquivos de configuração/env.
- Entregáveis: CLI funcional com comandos principais.

## 5. Implementação API HTTP (Elysia)
- Definir rotas RESTful para cada operação (ex: /record/query, /record/insert, /attachment/upload).
- Middleware para autenticação, logging e tratamento de erros.
- Documentação OpenAPI/Swagger.
- Entregáveis: API HTTP funcional e documentada.

## 6. Testes
- Portar ou reescrever testes unitários e de integração.
- Testes CLI (ex: usando expect, snapshot).
- Testes de API (ex: supertest, httpie).
- Entregáveis: Cobertura de testes automatizados.

## 7. Documentação
- Atualizar README e docs para uso CLI e API.
- Exemplos de uso, variáveis de ambiente, fluxos comuns.
- Entregáveis: Documentação completa e exemplos.

## 8. Compatibilidade e Migração
- Garantir que principais fluxos do pysnc estejam cobertos.
- Fornecer guia de migração para usuários Python → JS/TS.
- Entregáveis: Checklist de compatibilidade e guia de migração.

## 9. Automatização e Dev Experience
- Scripts para build, lint, test, release.
- Suporte a Docker para ambiente de desenvolvimento e produção.
- Entregáveis: Scripts e Dockerfile prontos para uso.

## 10. Cronograma Sugerido
1. Levantamento e arquitetura (1 semana)
2. Port de módulos core (2 semanas)
3. CLI e API (2 semanas)
4. Testes e documentação (1 semana)
5. Validação, ajustes e release (1 semana)

---
Cada etapa deve ser validada com entregáveis claros antes de avançar para a próxima.
