import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { createPasswordChangeRateLimit } from "../src/middleware/auth-rate-limit.js";

function buildApp(maxAttempts = 3) {
  const app = express();
  const state = { calls: 0 };

  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.auth = { userId: Number(req.headers["x-user"] ?? 1), role: "USER" };
    next();
  });
  app.patch("/senha", createPasswordChangeRateLimit({ maxAttempts }), (req, res) => {
    state.calls += 1;

    if (req.body.atual === "certa") {
      res.status(200).json({ ok: true });
    } else if (req.body.atual === "boom") {
      res.status(500).json({ error: "falha interna" });
    } else {
      res.status(400).json({ error: "A senha atual está incorreta." });
    }
  });

  return { app, state };
}

const wrong = { atual: "errada" };

test("bloqueia depois de várias senhas atuais erradas", async () => {
  const { app, state } = buildApp(3);

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await request(app).patch("/senha").send(wrong)).status, 400);
  }

  const blocked = await request(app).patch("/senha").send({ atual: "certa" });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Muitas tentativas/);
  assert.ok(Number(blocked.headers["retry-after"]) > 0);
  assert.equal(state.calls, 3);
});

test("cada usuário tem o seu próprio limite", async () => {
  const { app } = buildApp(2);

  for (let i = 0; i < 3; i += 1) {
    await request(app).patch("/senha").set("x-user", "1").send(wrong);
  }

  const outro = await request(app).patch("/senha").set("x-user", "2").send(wrong);
  assert.equal(outro.status, 400);
});

test("trocar a senha com sucesso zera o contador", async () => {
  const { app } = buildApp(3);

  await request(app).patch("/senha").send(wrong);
  await request(app).patch("/senha").send(wrong);
  assert.equal((await request(app).patch("/senha").send({ atual: "certa" })).status, 200);

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await request(app).patch("/senha").send(wrong)).status, 400);
  }
  assert.equal((await request(app).patch("/senha").send(wrong)).status, 429);
});

test("tentativas simultâneas não furam o limite", async () => {
  const { app, state } = buildApp(3);

  const responses = await Promise.all(
    Array.from({ length: 12 }, () => request(app).patch("/senha").send(wrong)),
  );

  assert.equal(state.calls, 3);
  assert.equal(responses.filter((response) => response.status === 429).length, 9);
});

test("erro do servidor não gasta tentativas", async () => {
  const { app } = buildApp(2);

  for (let i = 0; i < 6; i += 1) {
    assert.equal((await request(app).patch("/senha").send({ atual: "boom" })).status, 500);
  }

  assert.equal((await request(app).patch("/senha").send(wrong)).status, 400);
});
