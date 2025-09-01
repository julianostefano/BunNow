import { app } from "../src/routes/app";
import { describe, it, expect } from "bun:test";

// Exemplo de teste para POST /record/:table

describe("POST /record/:table", () => {
  it("should return 200 and a record object (mocked)", async () => {
    const req = new Request("http://localhost/record/user", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-instance-url": "https://dev0000.service-now.com",
        "authorization": "token-mock"
      },
      body: JSON.stringify({ name: "John Doe" })
    });
    const res = await app.handle(req);
    expect(res.status).toBe(200);
    // Opcional: validar corpo da resposta
    // const data = await res.json();
    // expect(data).toHaveProperty('name', 'John Doe');
  });
});
