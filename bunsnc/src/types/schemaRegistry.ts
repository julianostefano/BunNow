// Registry de schemas dinâmicos por tabela
// Exemplo: cada tabela tem um schema Elysia t.Object
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

// Função utilitária para obter o schema de uma tabela
export function getSchemaForTable(table: string) {
  return schemaRegistry[table] || t.Object({});
}
