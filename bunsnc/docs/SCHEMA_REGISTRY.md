# Como adicionar ou alterar schemas dinâmicos

O sistema utiliza um registry de schemas dinâmicos para validação automática dos dados enviados nas rotas de CRUD. Cada tabela pode ter um schema próprio, definido usando o validador `t.Object` do Elysia.

## Local do registry
O arquivo de schemas fica em:

```
bunsnc/src/types/schemaRegistry.ts
```

## Exemplo de schema
```ts
import { t } from "elysia";

export const schemaRegistry: Record<string, any> = {
  incident: t.Object({
    short_description: t.String(),
    description: t.Optional(t.String()),
    priority: t.Optional(t.Number()),
    state: t.Optional(t.String()),
  }),
  user: t.Object({
    name: t.String(),
    email: t.String(),
    active: t.Optional(t.Boolean()),
  }),
  // Adicione outros schemas conforme necessário
};
```

## Como adicionar um novo schema
1. Abra o arquivo `schemaRegistry.ts`.
2. Adicione uma nova entrada no objeto `schemaRegistry` com o nome da tabela como chave e o schema como valor.
3. Use os tipos do Elysia (`t.String()`, `t.Number()`, `t.Boolean()`, etc) para definir os campos.

## Como alterar um schema existente
1. Localize a chave da tabela desejada no objeto `schemaRegistry`.
2. Altere, adicione ou remova campos conforme necessário.

## Observações
- Se não houver schema para uma tabela, será usado um schema vazio (`t.Object({})`), permitindo qualquer payload.
- Sempre que possível, defina os campos obrigatórios e opcionais para garantir validação forte.

---

Dúvidas ou sugestões? Edite este arquivo ou abra uma issue.
