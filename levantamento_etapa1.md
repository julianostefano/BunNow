# Etapa 1: Levantamento e Análise

## Objetivo
Mapear todos os módulos, funcionalidades e fluxos do pysnc para garantir que a refatoração cubra todos os requisitos essenciais.

## 1.1. Módulos e Funcionalidades do pysnc
- **Autenticação**: Gerenciamento de credenciais, autenticação básica e OAuth.
- **Manipulação de Registros**: CRUD (Create, Read, Update, Delete) em tabelas do ServiceNow.
- **Query**: Construção e execução de queries (filtros, ordenação, paginação).
- **Anexos**: Upload e download de arquivos.
- **Exceções**: Tratamento de erros e respostas da API.
- **Utils**: Funções auxiliares (ex: serialização, manipulação de dados).

## 1.2. Dependências Externas
- Requests HTTP (ex: requests no Python)
- Autenticação ServiceNow (Basic Auth, OAuth)
- Manipulação de arquivos (para anexos)

## 1.3. Pontos de Entrada CLI
- Comandos principais:
  - query
  - insert
  - update
  - delete
  - attachment (upload/download)
- Argumentos comuns: URL da instância, usuário, senha/token, tabela, filtros, campos, arquivos

## 1.4. Fluxos de Uso Comuns
- Consulta de registros com filtros
- Inserção/atualização de registros
- Exclusão de registros
- Upload/download de anexos
- Autenticação e configuração de ambiente

## 1.5. Entregáveis da Etapa
- Documento de levantamento (este arquivo)
- Lista de funcionalidades essenciais a serem portadas
- Mapeamento dos comandos CLI e fluxos principais

---
Próximos passos: Validar este levantamento e seguir para a definição da arquitetura (Etapa 2).
