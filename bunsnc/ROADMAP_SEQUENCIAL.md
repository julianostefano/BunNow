# Roadmap de Expansão bunsnc (Elysia + Bun)

## 1. Autenticação e Sessão
- Rotas: /auth/login, /auth/logout
- Service: AuthService (login, logout, validateToken)
- Proteção de rotas privadas com hooks (beforeHandle)
- Documentar fluxo de autenticação e uso de tokens

## 2. Validação Dinâmica de Schema
- Registry de schemas por tabela
- Uso de t.Object(schema) nas rotas
- Documentar como adicionar/alterar schemas

## 3. Suporte a Batch
- Rota: POST /batch para múltiplas operações
- ServiceNowService executa array de operações sequencialmente
- Documentar payload e resposta

## 4. Documentação Automática
- Plugin Swagger do Elysia
- Expor OpenAPI das rotas
- Documentar acesso e customização

## 5. Testes Automatizados
- Testes para autenticação, batch, anexos, erros
- Documentar exemplos e padrões de teste

## 6. CLI
- Comandos: login, consulta, batch, upload/download de anexo
- Documentar exemplos de uso e extensão

---

## Progresso Sequencial (Sequential Thinking)
- Cada etapa será implementada e documentada na ordem acima.
- Ao retomar a sessão, continue do próximo item não concluído.
- Decisões, exemplos e padrões serão registrados neste arquivo para referência futura.

---

## Status Atual
- Iniciando etapa 1: autenticação e sessão.
- Próximos passos: criar rotas /auth/login, /auth/logout, implementar AuthService, proteger rotas privadas.


./bunsnc get --table incident --sys_id <id>
./bunsnc create --table incident --data '{"short_description":"Teste"}'
./bunsnc update --table incident --sys_id <id> --data '{"state":"2"}'
./bunsnc delete --table incident --sys_id <id>

SERVICENOW_INSTANCE=https://sua-instancia.service-now.com
SERVICENOW_USERNAME=seu_usuario
SERVICENOW_PASSWORD=sua_senha_ou_token


export SERVICENOW_INSTANCE=https://sua-instancia.service-now.com
export SERVICENOW_USERNAME=seu_usuario
export SERVICENOW_PASSWORD=sua_senha_ou_token
./bunsnc