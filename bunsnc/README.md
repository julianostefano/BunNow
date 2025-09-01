# bunsnc HTTP API & CLI – Documentação Detalhada

## Visão Geral

O `bunsnc` é uma aplicação baseada em Bun + Elysia que expõe operações ServiceNow via HTTP API e CLI. Todos os métodos principais estão implementados, incluindo CRUD de registros, operações em lote (batch), upload/download de anexos e autenticação via headers.

---

## Endpoints HTTP

### 1. Criar Registro (CRUD)
- **POST** `/record/:table`
- **Headers:**
   - `x-instance-url`: URL da instância ServiceNow (opcional, pode usar env)
   - `authorization`: Token de autenticação (opcional, pode usar env)
- **Body:**
```json
{
   "campo1": "valor1",
   "campo2": "valor2"
}
```
- **Exemplo curl:**
```sh
curl -X POST http://localhost:3000/record/incident \
   -H "Content-Type: application/json" \
   -H "x-instance-url: https://dev12345.service-now.com" \
   -H "authorization: Bearer SEU_TOKEN" \
   -d '{"short_description": "Teste", "priority": "2"}'
```

### 2. Upload de Anexo
- **POST** `/attachment/:table/:sysId`
- **Headers:**
   - `x-instance-url`, `authorization` (idem acima)
- **Body:**
   - `file`: Arquivo binário (multipart/form-data ou base64)
- **Exemplo curl:**
```sh
curl -X POST http://localhost:3000/attachment/incident/1234567890abcdef \
   -H "x-instance-url: https://dev12345.service-now.com" \
   -H "authorization: Bearer SEU_TOKEN" \
   -F "file=@/caminho/para/arquivo.pdf"
```

### 3. Download de Anexo
- **GET** `/attachment/:attachmentId`
- **Headers:**
   - `x-instance-url`, `authorization` (idem acima)
- **Exemplo curl:**
```sh
curl -X GET http://localhost:3000/attachment/abcdef1234567890 \
   -H "x-instance-url: https://dev12345.service-now.com" \
   -H "authorization: Bearer SEU_TOKEN" \
   -o arquivo_baixado.pdf
```

### 4. Batch (Operações em Lote)
- **POST** `/batch`
- **Headers:**
   - `x-instance-url`, `authorization` (idem acima)
- **Body:**
```json
{
   "operations": [
      { "op": "create", "table": "incident", "data": { "short_description": "Teste batch" } },
      { "op": "update", "table": "incident", "sys_id": "abc123", "data": { "priority": "1" } }
   ]
}
```
- **Exemplo curl:**
```sh
curl -X POST http://localhost:3000/batch \
   -H "Content-Type: application/json" \
   -H "x-instance-url: https://dev12345.service-now.com" \
   -H "authorization: Bearer SEU_TOKEN" \
   -d '{
      "operations": [
         { "op": "create", "table": "incident", "data": { "short_description": "Teste batch" } },
         { "op": "update", "table": "incident", "sys_id": "abc123", "data": { "priority": "1" } }
      ]
   }'
```
- **Resposta de erro:**
```json
{ "error": "operations deve ser um array" }
```

---

## CLI (Linha de Comando)

- Todos os comandos do HTTP estão disponíveis via CLI.
- Exemplo:
```sh
bun bunsnc/cli.js record create incident '{"short_description": "Via CLI"}'
```
- Use `--help` para ver todos os comandos e opções:
```sh
bun bunsnc/cli.js --help
```

---

## Autenticação
- Recomenda-se usar variáveis de ambiente para `SNC_INSTANCE_URL` e `SNC_AUTH_TOKEN`.
- Headers podem sobrescrever valores do `.env`.

---

## Observações
- Todos os endpoints são threat-safe e validados por tipos.
- Testes automatizados cobrem todos os fluxos principais.
- Não há stubs ou mocks: todas as operações são reais.

---

## Exemplos de .env
```
SNC_INSTANCE_URL=https://dev12345.service-now.com
SNC_AUTH_TOKEN=Bearer SEU_TOKEN
```

---

## Dúvidas ou Contribuições
Abra issues ou pull requests no repositório.
# Bunsnc Project

Bunsnc is a synchronization tool built using Bun and ElysiaJS. This project aims to provide a simple and efficient way to manage synchronization processes.

## Project Structure

```
bunsnc
├── src
│   ├── index.ts               # Entry point of the application
│   ├── controllers
│   │   └── syncController.ts   # Manages synchronization processes
│   ├── routes
│   │   └── syncRoutes.ts       # Defines synchronization-related routes
│   └── types
│       └── index.ts            # Type definitions for the application
├── bun.lockb                   # Lock file for Bun dependencies
├── package.json                # NPM configuration file
├── tsconfig.json               # TypeScript configuration file
└── README.md                   # Project documentation
```

## Features

- **Synchronization Management**: Start and stop synchronization processes using the `SyncController`.
- **Route Definitions**: Easily define and manage routes related to synchronization.
- **Type Safety**: Utilize TypeScript for type safety and better development experience.

## Getting Started

1. Clone the repository:
   ```
   git clone <repository-url>
   cd bunsnc
   ```

2. Install dependencies:
   ```
   bun install
   ```

3. Run the application:
   ```
   bun run start
   ```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.