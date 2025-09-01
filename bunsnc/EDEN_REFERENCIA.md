# Referência rápida: Eden, Elysia e melhores práticas

## Instalação
- Instale Eden e Elysia com:
  ```bash
  bun add @elysiajs/eden
  bun add -d elysia
  ```
- Certifique-se de que as versões de Elysia no client e server sejam compatíveis.
- Ative `strict: true` no tsconfig.json.
- Use TypeScript >= 5.0.

## Exportando tipos do servidor
- Exporte o tipo da sua instância Elysia:
  ```ts
  // server.ts
  import { Elysia, t } from 'elysia';
  const app = new Elysia()
    .get('/', () => 'Hi Elysia')
    .listen(3000);
  export type App = typeof app;
  ```

## Consumindo API com Treaty (Eden)
- No client, importe o tipo e use treaty:
  ```ts
  import { treaty } from '@elysiajs/eden';
  import type { App } from './server';
  const client = treaty<App>('http://localhost:3000');
  const { data } = await client.hi.get();
  ```
- Para rotas dinâmicas:
  ```ts
  // /item/:name
  client.item({ name: 'Skadi' }).get();
  ```

## Eden Fetch
- Alternativa ao Treaty, usa sintaxe fetch-like:
  ```ts
  import { edenFetch } from '@elysiajs/eden';
  import type { App } from './server';
  const fetch = edenFetch<App>('http://localhost:3000');
  const { data, error } = await fetch('/mirror', { method: 'POST', body: { id: 1, name: 'X' } });
  ```
- Use Treaty para maioria dos casos, Fetch para projetos com muitas rotas.

## Estrutura recomendada
- Use estrutura por feature:
  ```
  src/
    modules/
      auth/
        index.ts (controller)
        service.ts
        model.ts
      user/
        index.ts
        service.ts
        model.ts
    utils/
  ```
- Controller = Elysia instance (não crie controllers separados)
- Service = lógica de negócio, abstraída de Elysia
- Model = use Elysia.t para validação e tipagem

## Melhores práticas
- Sempre use method chaining em Elysia para garantir inferência de tipos.
- Não passe o Context inteiro para services, extraia apenas o necessário.
- Use hooks/lifecycle para customizações (onRequest, onParse, beforeHandle, afterHandle, onError, etc).
- Use models com Elysia.t e obtenha tipos com `typeof model.static`.
- Plugins podem ser reutilizados sem problemas de performance.

## Ciclo de vida (lifecycle)
- Principais eventos: request, parse, transform, beforeHandle, afterHandle, mapResponse, onError, afterResponse.
- Use hooks locais ou globais conforme necessidade.
- Ordem dos hooks importa: eventos só afetam rotas registradas depois deles.

## Links úteis
- [Instalação](https://elysiajs.com/eden/installation.html)
- [Treaty/overview](https://elysiajs.com/eden/treaty/overview.html)
- [Fetch](https://elysiajs.com/eden/fetch.html)
- [Best Practice](https://elysiajs.com/essential/best-practice.html)
- [Life Cycle](https://elysiajs.com/essential/life-cycle.html)

---
Este arquivo serve como referência rápida para desenvolvimento com Eden/Elysia seguindo as melhores práticas da documentação oficial.
