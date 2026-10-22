import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../src/app.js";

const secret = "finansys-routes-test-secret-32-characters-minimum";

let userToken = "";

before(() => {
  process.env.JWT_SECRET = secret;
  userToken = jwt.sign({ role: "USER" }, secret, {
    subject: "11",
    algorithm: "HS256",
  });
});

after(() => {
  delete process.env.JWT_SECRET;
});

test("a rota de saúde responde sem autenticação", async () => {
  const response = await request(app).get("/api/v1/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("rota inexistente responde 404 em JSON, mesmo sem token", async () => {
  const response = await request(app).get("/api/v1/rota-que-nao-existe");
  assert.equal(response.status, 404);
  assert.equal(response.body.error, "Rota não encontrada.");
});

test("rota inexistente com outro método também responde 404", async () => {
  const response = await request(app).post("/api/v1/rota-que-nao-existe");
  assert.equal(response.status, 404);
});

test("rotas administrativas de modalidades exigem token", async () => {
  const response = await request(app).get("/api/v1/admin/modalities");
  assert.equal(response.status, 401);
});

test("rotas administrativas de modalidades negam usuário comum", async () => {
  const response = await request(app)
    .get("/api/v1/admin/modalities")
    .set("Authorization", `Bearer ${userToken}`);
  assert.equal(response.status, 403);
});

test("rotas administrativas de faixas de juros exigem token", async () => {
  const response = await request(app).get(
    "/api/v1/admin/modalities/PERSONAL/rates",
  );
  assert.equal(response.status, 401);
});

test("rotas administrativas de faixas de juros negam usuário comum", async () => {
  const response = await request(app)
    .post("/api/v1/admin/modalities/PERSONAL/rates")
    .set("Authorization", `Bearer ${userToken}`)
    .send({ minTerm: 3, maxTerm: 12, monthlyRatePercent: 2 });
  assert.equal(response.status, 403);
});

for (const rota of [
  "/api/v1/admin/users",
  "/api/v1/admin/metrics",
  "/api/v1/admin/audit-logs",
]) {
  test(`${rota} exige token`, async () => {
    const response = await request(app).get(rota);
    assert.equal(response.status, 401);
  });

  test(`${rota} nega usuário comum`, async () => {
    const response = await request(app)
      .get(rota)
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(response.status, 403);
  });
}
