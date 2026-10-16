import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { requireAuth } from "../src/middleware/require-auth.js";
import { requireAdmin } from "../src/middleware/require-admin.js";

const secret = "finansys-admin-test-secret-32-characters-minimum";
const app = express();

app.get("/protected", requireAuth, requireAdmin, (_request, response) => {
  response.status(200).json({ ok: true });
});

let userToken = "";
let adminToken = "";

before(() => {
  process.env.JWT_SECRET = secret;
  userToken = jwt.sign({ role: "USER" }, secret, {
    subject: "11",
    algorithm: "HS256",
  });
  adminToken = jwt.sign({ role: "ADMIN" }, secret, {
    subject: "1",
    algorithm: "HS256",
  });
});

after(() => {
  delete process.env.JWT_SECRET;
});

test("nega acesso administrativo sem token", async () => {
  const response = await request(app).get("/protected");
  assert.equal(response.status, 401);
});

test("nega acesso administrativo para usuário comum", async () => {
  const response = await request(app)
    .get("/protected")
    .set("Authorization", `Bearer ${userToken}`);
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "Acesso restrito a administradores.");
});

test("permite acesso administrativo para ADMIN", async () => {
  const response = await request(app)
    .get("/protected")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});
