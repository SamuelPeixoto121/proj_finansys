import assert from "node:assert/strict";
import test from "node:test";
import {
  NAME_ERROR,
  PASSWORD_ERROR,
  isValidPassword,
  parsePasswordChange,
  parseProfileUpdate,
  validateName,
} from "../src/domain/account-rules.js";

test("as mensagens de erro continuam as mesmas do cadastro", () => {
  assert.equal(NAME_ERROR, "O nome deve ter entre 2 e 120 caracteres.");
  assert.equal(
    PASSWORD_ERROR,
    "A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.",
  );
});

test("o nome é aparado e aceito entre 2 e 120 caracteres", () => {
  assert.equal(validateName("  Ana Souza  ").value, "Ana Souza");
  assert.equal(validateName("Jo").value, "Jo");
  assert.equal(validateName("a".repeat(120)).value, "a".repeat(120));
});

test("rejeita nomes inválidos", () => {
  const invalid = ["", " ", "A", "  A  ", "a".repeat(121), null, undefined, 42, ["Ana"]];

  for (const name of invalid) {
    const result = validateName(name);
    assert.equal(result.value, undefined, `deveria rejeitar ${JSON.stringify(name)}`);
    assert.equal(result.error, NAME_ERROR);
  }
});

test("senha: limites de tamanho em caracteres e em bytes", () => {
  assert.equal(isValidPassword("1234567"), false);
  assert.equal(isValidPassword("12345678"), true);
  assert.equal(isValidPassword("a".repeat(72)), true);
  assert.equal(isValidPassword("a".repeat(73)), false);
  assert.equal(isValidPassword("ç".repeat(36)), true);
  assert.equal(isValidPassword("ç".repeat(37)), false);
});

test("senha: rejeita o que não é texto", () => {
  for (const value of [undefined, null, 12345678, ["12345678"], {}]) {
    assert.equal(isValidPassword(value), false);
  }
});

test("atualização de perfil: aceita o nome e devolve aparado", () => {
  assert.deepEqual(parseProfileUpdate({ name: "  Maria  " }).value, { name: "Maria" });
});

test("atualização de perfil: rejeita corpo inválido ou nome ruim", () => {
  for (const body of [null, undefined, "texto", [], {}, { name: "A" }, { name: 5 }]) {
    const result = parseProfileUpdate(body);
    assert.ok(result.error, `deveria rejeitar ${JSON.stringify(body)}`);
    assert.equal(result.value, undefined);
  }
});

test("troca de senha: aceita senha atual e nova senha válida", () => {
  const result = parsePasswordChange({
    currentPassword: "senha-antiga",
    newPassword: "senha-nova-123",
  });

  assert.deepEqual(result.value, {
    currentPassword: "senha-antiga",
    newPassword: "senha-nova-123",
  });
});

test("troca de senha: exige a senha atual", () => {
  for (const currentPassword of [undefined, "", null, 123]) {
    const result = parsePasswordChange({ currentPassword, newPassword: "senha-nova-123" });
    assert.equal(result.error, "Informe a senha atual.");
  }
});

test("troca de senha: aplica as mesmas regras da senha do cadastro", () => {
  const result = parsePasswordChange({ currentPassword: "antiga", newPassword: "curta" });
  assert.equal(result.error, PASSWORD_ERROR);
});

test("troca de senha: a nova não pode ser igual à atual", () => {
  const result = parsePasswordChange({
    currentPassword: "mesma-senha-1",
    newPassword: "mesma-senha-1",
  });

  assert.equal(result.error, "A nova senha deve ser diferente da atual.");
});

test("troca de senha: rejeita corpo que não é objeto", () => {
  for (const body of [null, undefined, "x", []]) {
    assert.equal(
      parsePasswordChange(body).error,
      "Envie a senha atual e a nova senha.",
    );
  }
});
