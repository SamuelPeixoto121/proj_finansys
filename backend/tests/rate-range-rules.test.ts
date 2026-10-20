import assert from "node:assert/strict";
import test from "node:test";
import {
  findOverlappingRange,
  isInsideLimits,
  parseRateRangeInput,
  rangesOverlap,
} from "../src/domain/rate-range-rules.js";

test("aceita uma faixa de juros válida", () => {
  const result = parseRateRangeInput({
    minTerm: 3,
    maxTerm: 12,
    monthlyRatePercent: 4.5,
  });

  assert.deepEqual(result.value, {
    minTerm: 3,
    maxTerm: 12,
    monthlyRatePercent: 4.5,
  });
  assert.equal(result.error, undefined);
});

test("aceita taxa zero e faixa de um único mês", () => {
  const result = parseRateRangeInput({
    minTerm: 6,
    maxTerm: 6,
    monthlyRatePercent: 0,
  });

  assert.ok(result.value);
});

test("rejeita corpo que não é um objeto", () => {
  assert.ok(parseRateRangeInput(null).error);
  assert.ok(parseRateRangeInput("texto").error);
  assert.ok(parseRateRangeInput([]).error);
});

test("rejeita prazos inválidos", () => {
  const invalid = [
    { minTerm: 0, maxTerm: 12 },
    { minTerm: 12, maxTerm: 3 },
    { minTerm: 2.5, maxTerm: 12 },
    { minTerm: "3", maxTerm: 12 },
    { minTerm: 3 },
  ];

  for (const prazo of invalid) {
    const result = parseRateRangeInput({ ...prazo, monthlyRatePercent: 2 });
    assert.ok(result.error, `deveria rejeitar ${JSON.stringify(prazo)}`);
  }
});

test("rejeita taxas inválidas", () => {
  const invalid = [-1, 100.01, Number.NaN, Infinity, "2", null, undefined];

  for (const taxa of invalid) {
    const result = parseRateRangeInput({
      minTerm: 3,
      maxTerm: 12,
      monthlyRatePercent: taxa,
    });
    assert.ok(result.error, `deveria rejeitar a taxa ${String(taxa)}`);
  }
});

test("rejeita taxa com mais de 4 casas decimais", () => {
  const result = parseRateRangeInput({
    minTerm: 3,
    maxTerm: 12,
    monthlyRatePercent: 2.12345,
  });

  assert.match(result.error ?? "", /4 casas/);
});

test("aceita taxa com 4 casas decimais", () => {
  const result = parseRateRangeInput({
    minTerm: 3,
    maxTerm: 12,
    monthlyRatePercent: 0.9505,
  });

  assert.ok(result.value);
});

test("detecta sobreposição entre faixas", () => {
  const base = { minTerm: 13, maxTerm: 24 };

  assert.equal(rangesOverlap(base, { minTerm: 3, maxTerm: 12 }), false);
  assert.equal(rangesOverlap(base, { minTerm: 25, maxTerm: 48 }), false);
  assert.equal(rangesOverlap(base, { minTerm: 12, maxTerm: 13 }), true);
  assert.equal(rangesOverlap(base, { minTerm: 24, maxTerm: 30 }), true);
  assert.equal(rangesOverlap(base, { minTerm: 15, maxTerm: 18 }), true);
  assert.equal(rangesOverlap(base, { minTerm: 1, maxTerm: 100 }), true);
});

test("findOverlappingRange ignora a própria faixa ao editar", () => {
  const existing = [
    { id: 1, minTerm: 3, maxTerm: 12 },
    { id: 2, minTerm: 13, maxTerm: 24 },
  ];

  assert.equal(
    findOverlappingRange(existing, { minTerm: 13, maxTerm: 20 }, 2),
    undefined,
  );
  assert.equal(
    findOverlappingRange(existing, { minTerm: 13, maxTerm: 20 }, 1)?.id,
    2,
  );
  assert.equal(
    findOverlappingRange(existing, { minTerm: 25, maxTerm: 48 }),
    undefined,
  );
});

test("verifica se a faixa cabe nos limites da modalidade", () => {
  const limits = { minTerm: 3, maxTerm: 48 };

  assert.equal(isInsideLimits({ minTerm: 3, maxTerm: 48 }, limits), true);
  assert.equal(isInsideLimits({ minTerm: 13, maxTerm: 24 }, limits), true);
  assert.equal(isInsideLimits({ minTerm: 2, maxTerm: 24 }, limits), false);
  assert.equal(isInsideLimits({ minTerm: 25, maxTerm: 49 }, limits), false);
});
