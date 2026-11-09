import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import express from "express";
import request from "supertest";
import { createFrontendRouter } from "../src/frontend.js";

const directory = mkdtempSync(join(tmpdir(), "finansys-frontend-"));
mkdirSync(join(directory, "assets"));
writeFileSync(join(directory, "index.html"), "<!doctype html><title>FinanSys</title>");
writeFileSync(join(directory, "favicon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
writeFileSync(join(directory, "assets", "index-abc123.js"), "console.log('ok');");

after(() => rmSync(directory, { recursive: true, force: true }));

// Monta como no app.ts: rota da API, site e o 404 em JSON por último.
const app = express();
app.get("/api/v1/health", (_request, response) => {
  response.json({ status: "ok" });
});
app.use(createFrontendRouter(directory));
app.use((_request, response) => {
  response.status(404).json({ error: "Rota não encontrada." });
});

test("a raiz entrega o index.html, sempre revalidado", async () => {
  const response = await request(app).get("/");

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /text\/html/);
  assert.match(response.text, /<title>FinanSys<\/title>/);
  assert.equal(response.headers["cache-control"], "no-cache");
});

test("arquivos de /assets ganham cache longo", async () => {
  const response = await request(app).get("/assets/index-abc123.js");

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /javascript/);
  assert.equal(response.headers["cache-control"], "public, max-age=31536000, immutable");
});

test("arquivos fora de /assets, como o favicon, são revalidados", async () => {
  const response = await request(app).get("/favicon.svg");

  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-cache");
});

test("uma rota da página sem arquivo recebe o index.html", async () => {
  const response = await request(app).get("/historico");

  assert.equal(response.status, 200);
  assert.match(response.text, /<title>FinanSys<\/title>/);
  assert.equal(response.headers["cache-control"], "no-cache");
});

test("o site envia cabeçalhos de segurança, inclusive contra ser embutido em outro site", async () => {
  const response = await request(app).get("/");

  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin");
});

test("um arquivo inexistente responde 404 em JSON, e não o index.html", async () => {
  const response = await request(app).get("/assets/nao-existe.js");

  assert.equal(response.status, 404);
  assert.match(response.headers["content-type"], /application\/json/);
});

test("rotas da API continuam com a API, e as inexistentes respondem 404 em JSON", async () => {
  const health = await request(app).get("/api/v1/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.status, "ok");
  assert.equal(health.headers["x-frame-options"], undefined);

  for (const path of ["/api", "/api/v1/nao-existe"]) {
    const response = await request(app).get(path);
    assert.equal(response.status, 404, path);
    assert.match(response.headers["content-type"], /application\/json/, path);
  }
});

test("métodos que não são GET nem HEAD não recebem o index.html", async () => {
  const response = await request(app).post("/historico");

  assert.equal(response.status, 404);
  assert.match(response.headers["content-type"], /application\/json/);
});

test("caminhos que tentam sair da pasta do site são recusados", async () => {
  const response = await request(app).get("/..%2f..%2fpackage.json");

  assert.notEqual(response.status, 200);
});

test("sem o site compilado, o servidor recusa iniciar com uma mensagem clara", () => {
  assert.throws(
    () => createFrontendRouter(join(directory, "nao-existe")),
    /npm run build/,
  );
});
