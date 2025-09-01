# Etapa 2: Arquitetura Proposta

## Objetivo
Definir a estrutura de pastas, responsabilidades dos módulos e como os métodos serão exportados para CLI e API HTTP.

## 2.1. Estrutura de Pastas Sugerida
```
bunsnc/
  src/
    controllers/   # Lógica de negócio (ex: syncController.ts)
    routes/         # Rotas Elysia (ex: syncRoutes.ts)
    types/          # Tipagens compartilhadas (ex: index.ts)
    cli/            # Comandos CLI (ex: index.ts, comandos separados por funcionalidade)
    services/       # Integrações ServiceNow, autenticação, utilitários
  package.json
  tsconfig.json
  bun.lockb
  README.md
```

## 2.2. Responsabilidades dos Módulos
- **controllers/**: Implementam a lógica de negócio, orquestram chamadas a services e formatam respostas.
- **routes/**: Definem endpoints HTTP, conectando rotas aos controllers.
- **types/**: Centralizam tipagens e interfaces para uso em todo o projeto.
- **cli/**: Implementam comandos CLI, reutilizando lógica dos controllers/services.
- **services/**: Abstraem integrações externas (ex: ServiceNow API, autenticação, manipulação de arquivos).

## 2.3. Exportação de Métodos
- Métodos principais (CRUD, autenticação, anexos) implementados em services/controllers.
- CLI importa e utiliza controllers/services para executar comandos.
- API HTTP (Elysia) expõe endpoints REST que utilizam os mesmos controllers/services.
- Garantir que lógica de negócio não fique duplicada entre CLI e API.

## 2.4. Fluxo de Dados
- Entrada (CLI ou HTTP) → Controller → Service → ServiceNow/API externa → Controller → Saída (CLI ou HTTP)

## 2.5. Diagrama Simplificado
```
[CLI]         [HTTP API]
   |               |
   v               v
[Controllers] <--- [Routes]
   |
   v
[Services]
   |
   v
[ServiceNow / Outras APIs]
```

## 2.6. Entregáveis da Etapa
- Documento de arquitetura (este arquivo)
- Estrutura inicial de diretórios e arquivos (stubs)

---
Próximos passos: Criar a estrutura inicial de diretórios e arquivos stubs para bunsnc (Etapa 3).
