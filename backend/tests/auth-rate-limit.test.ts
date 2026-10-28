import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import {
  createLoginRateLimit,
  createRegisterRateLimit,
  type LoginRateLimitOptions,
} from "../src/middleware/auth-rate-limit.js";

function buildLoginApp(options: LoginRateLimitOptions = {}, trustProxy = false) {
  const app = express();
  const state = { calls: 0 };

  if (trustProxy) {
    app.set("trust proxy", 1);
  }

  app.use(express.json());
  app.use("/login", createLoginRateLimit(options));
  app.get("/login", (_request, response) => {
    response.status(200).json({ ok: true });
  });
  app.post("/login", (req, res) => {
    state.calls += 1;

    if (req.body.password === "certa") {
      res.status(200).json({ ok: true });
    } else if (req.body.password === "boom") {
      res.status(500).json({ error: "falha interna" });
    } else {
      res.status(401).json({ error: "E-mail ou senha inválidos." });
    }
  });

  return { app, state };
}

const wrong = (email = "a@teste.com") => ({ email, password: "errada" });

test("bloqueia a sexta tentativa errada da mesma conta com 429", async () => {
  const { app } = buildLoginApp();

  for (let i = 0; i < 5; i += 1) {
    const response = await request(app).post("/login").send(wrong());
    assert.equal(response.status, 401);
  }

  const blocked = await request(app).post("/login").send(wrong());
  assert.equal(blocked.status, 429);
  assert.equal(
    blocked.body.error,
    "Muitas tentativas. Tente novamente em 15 minutos.",
  );
  assert.ok(Number(blocked.headers["retry-after"]) > 0);
  assert.ok(Number(blocked.headers["retry-after"]) <= 900);
});

test("depois do limite, nem a senha certa passa e o servidor nem é consultado", async () => {
  const { app, state } = buildLoginApp();

  for (let i = 0; i < 5; i += 1) {
    await request(app).post("/login").send(wrong());
  }

  const response = await request(app)
    .post("/login")
    .send({ email: "a@teste.com", password: "certa" });

  assert.equal(response.status, 429);
  assert.equal(state.calls, 5);
});

test("outra conta no mesmo IP continua liberada", async () => {
  const { app } = buildLoginApp();

  for (let i = 0; i < 6; i += 1) {
    await request(app).post("/login").send(wrong("a@teste.com"));
  }

  const response = await request(app).post("/login").send(wrong("b@teste.com"));
  assert.equal(response.status, 401);
});

test("o e-mail é normalizado: maiúsculas e espaços contam como a mesma conta", async () => {
  const { app } = buildLoginApp();

  for (let i = 0; i < 5; i += 1) {
    const email = i % 2 === 0 ? "  A@Teste.com " : "a@teste.com";
    await request(app).post("/login").send(wrong(email));
  }

  const response = await request(app).post("/login").send(wrong("A@TESTE.COM"));
  assert.equal(response.status, 429);
});

test("testar muitos e-mails diferentes do mesmo IP também é bloqueado", async () => {
  const { app } = buildLoginApp({ perIp: { maxAttempts: 3 } });

  for (let i = 0; i < 3; i += 1) {
    const response = await request(app)
      .post("/login")
      .send(wrong(`pessoa${i}@teste.com`));
    assert.equal(response.status, 401);
  }

  const blocked = await request(app).post("/login").send(wrong("outra@teste.com"));
  assert.equal(blocked.status, 429);
});

test("um login correto zera o contador da conta", async () => {
  const { app } = buildLoginApp();

  for (let i = 0; i < 4; i += 1) {
    await request(app).post("/login").send(wrong());
  }

  const ok = await request(app)
    .post("/login")
    .send({ email: "a@teste.com", password: "certa" });
  assert.equal(ok.status, 200);

  for (let i = 0; i < 5; i += 1) {
    const response = await request(app).post("/login").send(wrong());
    assert.equal(response.status, 401);
  }

  const blocked = await request(app).post("/login").send(wrong());
  assert.equal(blocked.status, 429);
});

test("tentativas simultâneas não furam o limite", async () => {
  const { app, state } = buildLoginApp();

  const responses = await Promise.all(
    Array.from({ length: 20 }, () => request(app).post("/login").send(wrong())),
  );

  const blocked = responses.filter((response) => response.status === 429).length;

  assert.equal(state.calls, 5);
  assert.equal(blocked, 15);
});

test("erros do servidor (500) não gastam tentativas do usuário", async () => {
  const { app } = buildLoginApp();

  for (let i = 0; i < 10; i += 1) {
    const response = await request(app)
      .post("/login")
      .send({ email: "a@teste.com", password: "boom" });
    assert.equal(response.status, 500);
  }

  const response = await request(app).post("/login").send(wrong());
  assert.equal(response.status, 401);
});

test("requisições que não são POST não são limitadas", async () => {
  const { app } = buildLoginApp({ perAccount: { maxAttempts: 1 }, perIp: { maxAttempts: 1 } });

  for (let i = 0; i < 5; i += 1) {
    const response = await request(app).get("/login");
    assert.equal(response.status, 200);
  }
});

test("sem proxy confiável, o cabeçalho X-Forwarded-For é ignorado", async () => {
  const { app } = buildLoginApp();

  for (let i = 0; i < 5; i += 1) {
    await request(app)
      .post("/login")
      .set("X-Forwarded-For", `10.0.0.${i}`)
      .send(wrong());
  }

  const blocked = await request(app)
    .post("/login")
    .set("X-Forwarded-For", "10.0.0.99")
    .send(wrong());
  assert.equal(blocked.status, 429);
});

test("com proxy confiável, cada IP real tem o seu próprio limite", async () => {
  const { app } = buildLoginApp({}, true);

  for (let i = 0; i < 5; i += 1) {
    await request(app)
      .post("/login")
      .set("X-Forwarded-For", "203.0.113.10")
      .send(wrong());
  }

  const sameIp = await request(app)
    .post("/login")
    .set("X-Forwarded-For", "203.0.113.10")
    .send(wrong());
  const otherIp = await request(app)
    .post("/login")
    .set("X-Forwarded-For", "203.0.113.20")
    .send(wrong());

  assert.equal(sameIp.status, 429);
  assert.equal(otherIp.status, 401);
});

function buildRegisterApp(maxAttempts: number) {
  const app = express();

  app.use(express.json());
  app.use("/register", createRegisterRateLimit({ maxAttempts }));
  app.post("/register", (req, res) => {
    if (req.body.email === "existe@teste.com") {
      res.status(409).json({ error: "Já existe uma conta." });
    } else if (req.body.email === "boom@teste.com") {
      res.status(500).json({ error: "falha interna" });
    } else {
      res.status(201).json({ ok: true });
    }
  });

  return app;
}

test("limita cadastros por IP, contando sucessos e conflitos", async () => {
  const app = buildRegisterApp(3);

  assert.equal((await request(app).post("/register").send({ email: "1@teste.com" })).status, 201);
  assert.equal((await request(app).post("/register").send({ email: "existe@teste.com" })).status, 409);
  assert.equal((await request(app).post("/register").send({ email: "2@teste.com" })).status, 201);

  const blocked = await request(app).post("/register").send({ email: "3@teste.com" });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Muitas tentativas/);
  assert.ok(Number(blocked.headers["retry-after"]) > 0);
});

test("erro do servidor no cadastro não gasta tentativas", async () => {
  const app = buildRegisterApp(2);

  for (let i = 0; i < 6; i += 1) {
    const response = await request(app).post("/register").send({ email: "boom@teste.com" });
    assert.equal(response.status, 500);
  }

  const response = await request(app).post("/register").send({ email: "ok@teste.com" });
  assert.equal(response.status, 201);
});
