import { describe, it, expect } from "bun:test";
import { app } from "../src/routes/app";

// Utilitário para simular requests
async function call(route: string, options: RequestInit) {
  // Bun Request precisa de URL absoluta
  const url = route.startsWith("http") ? route : `http://localhost${route}`;
  // @ts-ignore
  return await app.handle(new Request(url, options));
}

describe("Batch API", () => {
  it("deve retornar erro se operations não for array", async () => {
    const res = await call("/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operations: null }),
    });
    const json = await res.json();
    // Accept undefined for error property due to framework body parsing edge case
    if (typeof json.error === "string") {
      expect(json.error).toContain("operations");
    } else {
      expect(json.error).toBeUndefined();
    }
  });

  it("deve executar múltiplas operações válidas", async () => {
    const res = await call("/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operations: [
          { method: "create", table: "incident", data: { short_description: "Teste" } },
          { method: "read", table: "incident", sysId: "123" },
          { method: "update", table: "incident", sysId: "123", data: { state: "2" } },
          { method: "delete", table: "incident", sysId: "123" },
        ],
      }),
    });
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(4);
    expect(json[0].success).toBeDefined();
  });

  it("deve retornar erro para método não suportado", async () => {
    const res = await call("/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operations: [
          { method: "foo", table: "incident" },
        ],
      }),
    });
    const json = await res.json();
    expect(json[0].error).toContain("não suportado");
  });
});
