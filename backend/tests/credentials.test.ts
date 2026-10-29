import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import {
  DUMMY_PASSWORD_HASH,
  checkPassword,
} from "../src/domain/credentials.js";

test("aceita a senha certa", async () => {
  const hash = await bcrypt.hash("senha-correta", 4);

  assert.equal(await checkPassword(hash, "senha-correta"), true);
});

test("recusa a senha errada", async () => {
  const hash = await bcrypt.hash("senha-correta", 4);

  assert.equal(await checkPassword(hash, "senha-errada"), false);
});

test("sem usuário, recusa e mesmo assim faz uma comparação de senha", async () => {
  const calls: { password: string; hash: string }[] = [];

  const result = await checkPassword(undefined, "qualquer-senha", async (password, hash) => {
    calls.push({ password, hash });
    return false;
  });

  assert.equal(result, false);
  assert.deepEqual(calls, [
    { password: "qualquer-senha", hash: DUMMY_PASSWORD_HASH },
  ]);
});

test("com usuário, compara com o hash dele e não com o fictício", async () => {
  const calls: string[] = [];

  await checkPassword("hash-do-usuario", "senha", async (_password, hash) => {
    calls.push(hash);
    return true;
  });

  assert.deepEqual(calls, ["hash-do-usuario"]);
});

test("sem usuário, nunca aceita, nem se a comparação devolver verdadeiro", async () => {
  const result = await checkPassword(undefined, "senha", async () => true);

  assert.equal(result, false);
});

test("o hash fictício é um hash bcrypt válido com o mesmo custo das senhas reais", async () => {
  assert.match(DUMMY_PASSWORD_HASH, /^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
  assert.equal(await bcrypt.compare("qualquer-coisa", DUMMY_PASSWORD_HASH), false);
});
