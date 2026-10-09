import test from "node:test";
import assert from "node:assert/strict";
import { calculateCredit } from "../src/domain/credit-calculator.js";

test("calcula uma simulação com juros pela Tabela Price", () => {
  const result = calculateCredit({
    principal: 1000,
    term: 12,
    monthlyRatePercent: 2,
  });

  assert.equal(result.installmentAmount, 94.56);
  assert.equal(result.totalAmount, 1134.72);
  assert.equal(result.totalInterest, 134.72);
});

test("calcula uma simulação sem juros", () => {
  const result = calculateCredit({
    principal: 1200,
    term: 12,
    monthlyRatePercent: 0,
  });

  assert.equal(result.installmentAmount, 100);
  assert.equal(result.totalAmount, 1200);
  assert.equal(result.totalInterest, 0);
});

test("rejeita um valor solicitado igual a zero", () => {
  assert.throws(
    () =>
      calculateCredit({
        principal: 0,
        term: 12,
        monthlyRatePercent: 2,
      }),
    /maior que zero/,
  );
});

test("rejeita um prazo que não seja inteiro positivo", () => {
  assert.throws(
    () =>
      calculateCredit({
        principal: 1000,
        term: 2.5,
        monthlyRatePercent: 2,
      }),
    /inteiro positivo/,
  );
});

test("rejeita uma taxa negativa", () => {
  assert.throws(
    () =>
      calculateCredit({
        principal: 1000,
        term: 12,
        monthlyRatePercent: -1,
      }),
    /taxa mensal/,
  );
});

test("rejeita valores não finitos", () => {
  assert.throws(
    () =>
      calculateCredit({
        principal: Infinity,
        term: 12,
        monthlyRatePercent: 2,
      }),
    /maior que zero/,
  );

  assert.throws(
    () =>
      calculateCredit({
        principal: 1000,
        term: 12,
        monthlyRatePercent: NaN,
      }),
    /taxa mensal/,
  );
});