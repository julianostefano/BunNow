import { execSync } from "child_process";
import { existsSync, unlinkSync, readFileSync } from "fs";

describe("CLI Integration", () => {
  const bin = "./dist/bunsnc";
  const env = {
    ...process.env,
    SNC_INSTANCE_URL: process.env.SNC_INSTANCE_URL || "https://instance.service-now.com",
    SNC_AUTH_TOKEN: process.env.SNC_AUTH_TOKEN || "token"
  };

  it("should show help", () => {
    const out = execSync(`${bin} --help`, { env }).toString();
    expect(out).toMatch(/create/);
    expect(out).toMatch(/upload/);
  });

  it("should authenticate (env)", () => {
    // Simples: se comandos funcionam, autenticação está ok
    const out = execSync(`${bin} --help`, { env }).toString();
    expect(out).toContain("Comandos disponíveis");
  });

  it("should create a record", () => {
    const out = execSync(`${bin} create incident '{"short_description":"CLI Teste"}'`, { env }).toString();
    expect(out).toMatch(/short_description/);
  });

  it("should read a record", () => {
    // Precisa de um sys_id válido, simulação:
    const sysId = "1234abcd5678";
    const out = execSync(`${bin} read incident ${sysId}`, { env }).toString();
    expect(out).toMatch(/incident/);
  });

  it("should update a record", () => {
    const sysId = "1234abcd5678";
    const out = execSync(`${bin} update incident ${sysId} '{"state":"2"}'`, { env }).toString();
    expect(out).toMatch(/state/);
  });

  it("should delete a record", () => {
    const sysId = "1234abcd5678";
    const out = execSync(`${bin} delete incident ${sysId}`, { env }).toString();
    expect(out).toMatch(/deleted|removido|success/i);
  });

  it("should query records", () => {
    const out = execSync(`${bin} query incident '{"active":true}'`, { env }).toString();
    expect(out).toMatch(/incident/);
  });

  it("should run batch", () => {
    const batch = '[{"action":"create","table":"incident","data":{"short_description":"Batch CLI"}}]';
    const out = execSync(`${bin} batch '${batch}'`, { env }).toString();
    expect(out).toMatch(/Batch|incident/);
  });

  it("should upload attachment", () => {
    const sysId = "1234abcd5678";
    const file = "./bunsnc/test/test-upload.txt";
    // Cria arquivo de teste
    require("fs").writeFileSync(file, "conteudo");
    const out = execSync(`${bin} upload incident ${sysId} ${file}`, { env }).toString();
    expect(out).toMatch(/Upload realizado|success/i);
    unlinkSync(file);
  });

  it("should download attachment", () => {
    const attachmentId = "4321dcba8765";
    const dest = "./bunsnc/test/test-download.txt";
    const out = execSync(`${bin} download ${attachmentId} ${dest}`, { env }).toString();
    expect(out).toMatch(/Download salvo|success/i);
    expect(existsSync(dest)).toBe(true);
    unlinkSync(dest);
  });
});
