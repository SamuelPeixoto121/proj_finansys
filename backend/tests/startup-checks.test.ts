import assert from "node:assert/strict";
import test from "node:test";
import { findStartupProblems } from "../src/startup-checks.js";

const secret = "a".repeat(32);

test("configuração de desenvolvimento válida não tem problemas", () => {
  assert.deepEqual(findStartupProblems({ JWT_SECRET: secret }), []);
});

test("JWT_SECRET ausente ou curta impede o início", () => {
  for (const value of [undefined, "", "a".repeat(31)]) {
    const problems = findStartupProblems({ JWT_SECRET: value });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /JWT_SECRET/);
  }
});

test("em produção, DB_HOST é obrigatório", () => {
  for (const value of [undefined, "", "   "]) {
    const problems = findStartupProblems({
      NODE_ENV: "production",
      JWT_SECRET: secret,
      DB_HOST: value,
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /DB_HOST/);
  }
});

test("produção com JWT_SECRET e DB_HOST não tem problemas", () => {
  assert.deepEqual(
    findStartupProblems({
      NODE_ENV: "production",
      JWT_SECRET: secret,
      DB_HOST: "gateway.exemplo.com",
    }),
    [],
  );
});

test("todos os problemas aparecem juntos", () => {
  assert.equal(findStartupProblems({ NODE_ENV: "production" }).length, 2);
});
