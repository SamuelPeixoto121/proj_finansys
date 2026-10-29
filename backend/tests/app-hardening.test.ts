import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import app from "../src/app.js";
import { errorHandler } from "../src/middleware/error-handler.js";

function assertNoLeak(text: string) {
  assert.ok(!/<html|<!doctype/i.test(text), "não deve devolver HTML");
  assert.ok(!/node_modules|\.ts:\d+|\bat .+\(/.test(text), "não deve vazar caminhos nem stack");
}

test("JSON quebrado responde 400 em JSON, sem vazar o stack", async () => {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("Content-Type", "application/json")
    .send("{ruim");

  assert.equal(response.status, 400);
  assert.match(response.headers["content-type"], /application\/json/);
  assert.equal(response.body.error, "O corpo da requisição não é um JSON válido.");
  assertNoLeak(response.text);
});

test("corpo grande demais responde 413 em JSON", async () => {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ email: "a".repeat(20_000) }));

  assert.equal(response.status, 413);
  assert.match(response.headers["content-type"], /application\/json/);
  assert.equal(response.body.error, "O corpo da requisição é grande demais.");
  assertNoLeak(response.text);
});

test("corpo pequeno e válido continua passando do limite de tamanho", async () => {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ email: "", password: "" }));

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Informe o e-mail e a senha.");
});

test("a API não anuncia o Express e envia os cabeçalhos de segurança", async () => {
  const response = await request(app).get("/api/v1/health");

  assert.equal(response.headers["x-powered-by"], undefined);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
});

test("rota inexistente e respostas de erro também levam os cabeçalhos", async () => {
  const notFound = await request(app).get("/api/v1/nao-existe");
  assert.equal(notFound.status, 404);
  assert.equal(notFound.headers["x-content-type-options"], "nosniff");
  assert.equal(notFound.headers["cache-control"], "no-store");

  const badJson = await request(app)
    .post("/api/v1/auth/login")
    .set("Content-Type", "application/json")
    .send("{ruim");
  assert.equal(badJson.headers["x-content-type-options"], "nosniff");
  assert.equal(badJson.headers["cache-control"], "no-store");
});

function buildErrorApp(thrown: unknown) {
  const mini = express();

  mini.get("/falha", () => {
    throw thrown;
  });
  mini.use(errorHandler);

  return mini;
}

test("erro inesperado responde 500 genérico, sem expor a mensagem interna", async () => {
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  try {
    const response = await request(buildErrorApp(new Error("senha do banco: 123"))).get("/falha");

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Erro interno do servidor." });
    assert.ok(!response.text.includes("senha do banco"));
    assert.equal(logged.length, 1, "o erro real fica registrado no log do servidor");
  } finally {
    console.error = original;
  }
});

test("erro 4xx de biblioteca responde com o mesmo código e uma mensagem genérica", async () => {
  const error = Object.assign(new Error("detalhe interno"), { status: 415 });
  const response = await request(buildErrorApp(error)).get("/falha");

  assert.equal(response.status, 415);
  assert.deepEqual(response.body, { error: "Requisição inválida." });
  assert.ok(!response.text.includes("detalhe interno"));
});

test("um valor lançado que não é Error também vira 500 em JSON", async () => {
  const original = console.error;
  console.error = () => {};

  try {
    const response = await request(buildErrorApp("texto solto")).get("/falha");

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "Erro interno do servidor." });
  } finally {
    console.error = original;
  }
});
