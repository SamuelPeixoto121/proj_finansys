
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { requireAuth } from "../src/middleware/require-auth.js";

const jwtSecret = "chave-de-teste-finansys-com-mais-de-32-caracteres";

let app: express.Express;
let originalJwtSecret: string | undefined;

before(() => {
  originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = jwtSecret;

  app = express();

  app.get("/private", requireAuth, (_request, response) => {
    response.status(200).json({
      auth: response.locals.auth,
    });
  });
});

after(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("recusa requisição sem token", async () => {
  const response = await request(app).get("/private");

  assert.equal(response.status, 401);
  assert.equal(
    response.body.error,
    "Token de autenticação não informado.",
  );
});

test("recusa token inválido", async () => {
  const response = await request(app)
    .get("/private")
    .set("Authorization", "Bearer token-invalido");

  assert.equal(response.status, 401);
  assert.equal(
    response.body.error,
    "Token inválido ou expirado.",
  );
});

test("aceita token válido e identifica o usuário", async () => {
  const token = jwt.sign(
    { role: "USER" },
    jwtSecret,
    {
      subject: "123",
      expiresIn: "15m",
      algorithm: "HS256",
    },
  );

  const response = await request(app)
    .get("/private")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.auth, {
    userId: 123,
    role: "USER",
  });
});

test("recusa token assinado com outra chave", async () => {
  const token = jwt.sign(
    { role: "USER" },
    "outra-chave-de-teste-com-tamanho-suficiente",
    {
      subject: "123",
      expiresIn: "15m",
      algorithm: "HS256",
    },
  );

  const response = await request(app)
    .get("/private")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 401);
  assert.equal(
    response.body.error,
    "Token inválido ou expirado.",
  );
});

test("recusa token com papel inválido", async () => {
  const token = jwt.sign(
    { role: "SUPERADMIN" },
    jwtSecret,
    {
      subject: "123",
      expiresIn: "15m",
      algorithm: "HS256",
    },
  );

  const response = await request(app)
    .get("/private")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 401);
  assert.equal(
    response.body.error,
    "Token de autenticação inválido.",
  );
});
