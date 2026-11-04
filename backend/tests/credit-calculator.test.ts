import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PRINCIPAL,
  MAX_TERM_MONTHS,
  calculateCredit,
} from "../src/domain/credit-calculator.js";

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

// ---------------------------------------------------------------------------
// Precisão decimal: os valores de referência abaixo foram calculados à parte,
// em Python (Fractions, aritmética exata), e não pelo código do projeto.
// ---------------------------------------------------------------------------

const GOLDEN: { principal: number; term: number; rate: number; installment: number; total: number; interest: number }[] = [
  { principal: 1000, term: 12, rate: 2, installment: 94.56, total: 1134.72, interest: 134.72 },
  { principal: 1000, term: 12, rate: 4.5, installment: 109.67, total: 1316.04, interest: 316.04 },
  { principal: 2000, term: 24, rate: 3.8, installment: 128.5, total: 3084, interest: 1084 },
  { principal: 20000, term: 48, rate: 2, installment: 652.04, total: 31297.92, interest: 11297.92 },
  { principal: 100000, term: 120, rate: 1, installment: 1434.71, total: 172165.2, interest: 72165.2 },
  { principal: 500000, term: 240, rate: 0.95, installment: 5297.74, total: 1271457.6, interest: 771457.6 },
  { principal: 50000, term: 48, rate: 3.2, installment: 2052.55, total: 98522.4, interest: 48522.4 },
  { principal: 150000, term: 60, rate: 2.45, installment: 4797.87, total: 287872.2, interest: 137872.2 },
  { principal: 10000, term: 36, rate: 1.2345, installment: 345.74, total: 12446.64, interest: 2446.64 },
  { principal: 500, term: 3, rate: 5, installment: 183.6, total: 550.8, interest: 50.8 },
  { principal: 12345.67, term: 18, rate: 3.9, installment: 967.32, total: 17411.76, interest: 5066.09 },
  { principal: 500000, term: 240, rate: 14.9999, installment: 74999.5, total: 17999880, interest: 17499880 },
  { principal: 5000, term: 60, rate: 0.0001, installment: 83.34, total: 5000.4, interest: 0.4 },
  { principal: 999999.99, term: 1200, rate: 0.5, installment: 5012.61, total: 6015132, interest: 5015132.01 },
  { principal: 1, term: 1, rate: 1, installment: 1.01, total: 1.01, interest: 0.01 },
  { principal: 0.01, term: 1, rate: 0, installment: 0.01, total: 0.01, interest: 0 },
  { principal: 4.27, term: 2, rate: 0, installment: 2.14, total: 4.27, interest: 0 },
  { principal: 4.35, term: 2, rate: 0, installment: 2.18, total: 4.35, interest: 0 },
  { principal: 4.77, term: 2, rate: 0, installment: 2.39, total: 4.77, interest: 0 },
  { principal: 100.1, term: 4, rate: 0, installment: 25.03, total: 100.1, interest: 0 },
  { principal: 1000, term: 3, rate: 0, installment: 333.33, total: 1000, interest: 0 },
  { principal: 1000, term: 7, rate: 0, installment: 142.86, total: 1000, interest: 0 },
  { principal: 1000.005, term: 12, rate: 2, installment: 94.56, total: 1134.72, interest: 134.71 },
  { principal: 1000.004, term: 12, rate: 2, installment: 94.56, total: 1134.72, interest: 134.72 },
];

const toCents = (value: number) => Math.round(value * 100);

function createRandom(seed: number) {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("confere com os valores de referência calculados em aritmética exata", () => {
  for (const item of GOLDEN) {
    const result = calculateCredit({
      principal: item.principal,
      term: item.term,
      monthlyRatePercent: item.rate,
    });

    assert.deepEqual(
      result,
      {
        installmentAmount: item.installment,
        totalAmount: item.total,
        totalInterest: item.interest,
      },
      `valor ${item.principal} em ${item.term} meses a ${item.rate}%`,
    );
  }
});

test("o meio centavo arredonda para cima, inclusive sem juros", () => {
  assert.equal(
    calculateCredit({ principal: 4.27, term: 2, monthlyRatePercent: 0 }).installmentAmount,
    2.14,
  );
  assert.equal(
    calculateCredit({ principal: 4.35, term: 2, monthlyRatePercent: 0 }).installmentAmount,
    2.18,
  );
  assert.equal(
    calculateCredit({ principal: 1.005, term: 1, monthlyRatePercent: 0 }).totalAmount,
    1.01,
  );
});

test("com juros, o total é sempre a parcela vezes o prazo", () => {
  const random = createRandom(1);

  for (let i = 0; i < 3000; i += 1) {
    const principal = (50_000 + Math.floor(random() * 49_950_000)) / 100;
    const term = 1 + Math.floor(random() * 240);
    const rate = (1 + Math.floor(random() * 150_000)) / 10_000;

    const result = calculateCredit({ principal, term, monthlyRatePercent: rate });
    const expectedTotal = toCents(result.installmentAmount) * term;

    assert.equal(
      toCents(result.totalAmount),
      Math.max(expectedTotal, toCents(principal)),
      `valor ${principal} em ${term} meses a ${rate}%`,
    );
    assert.equal(
      toCents(result.totalInterest),
      toCents(result.totalAmount) - toCents(principal),
    );
  }
});

test("sem juros, o total é o valor pedido e os juros são zero", () => {
  const random = createRandom(2);

  for (let i = 0; i < 2000; i += 1) {
    const principal = (100 + Math.floor(random() * 4_000_000)) / 100;
    const term = 1 + Math.floor(random() * 240);

    const result = calculateCredit({ principal, term, monthlyRatePercent: 0 });

    assert.equal(result.totalAmount, principal, `valor ${principal} em ${term} meses`);
    assert.equal(result.totalInterest, 0);
  }
});

test("os juros nunca ficam negativos, nem com taxas muito baixas", () => {
  for (const principal of [0.01, 0.5, 1, 99.99, 1000, 10_000]) {
    for (const term of [1, 2, 3, 7, 12, 60, 240, 1200]) {
      for (const rate of [0, 0.0001, 0.001, 0.01, 0.1]) {
        const result = calculateCredit({ principal, term, monthlyRatePercent: rate });

        assert.ok(result.totalInterest >= 0, `juros negativos: ${principal}, ${term}, ${rate}`);
        assert.ok(toCents(result.totalAmount) >= toCents(principal));
      }
    }
  }
});

test("a parcela fica a menos de meio centavo da fórmula em ponto flutuante", () => {
  // Conferência por um caminho independente e aproximado: pega erros grosseiros.
  const random = createRandom(3);

  for (let i = 0; i < 3000; i += 1) {
    const principal = (50_000 + Math.floor(random() * 49_950_000)) / 100;
    const term = 1 + Math.floor(random() * 240);
    const rate = Math.floor(random() * 150_000) / 10_000;
    const i2 = rate / 100;
    const approx = i2 === 0 ? principal / term : (principal * i2) / (1 - Math.pow(1 + i2, -term));

    const result = calculateCredit({ principal, term, monthlyRatePercent: rate });

    assert.ok(
      Math.abs(result.installmentAmount - approx) <= 0.0051,
      `valor ${principal} em ${term} meses a ${rate}%: ${result.installmentAmount} x ${approx}`,
    );
  }
});

test("os resultados têm no máximo duas casas decimais", () => {
  const random = createRandom(4);

  for (let i = 0; i < 1000; i += 1) {
    const principal = (50_000 + Math.floor(random() * 49_950_000)) / 100;
    const term = 1 + Math.floor(random() * 240);
    const rate = Math.floor(random() * 150_000) / 10_000;
    const result = calculateCredit({ principal, term, monthlyRatePercent: rate });

    for (const value of Object.values(result)) {
      assert.equal(Number(value.toFixed(2)), value);
    }
  }
});

test("rejeita prazos longos demais, mas aceita o limite", () => {
  assert.throws(
    () => calculateCredit({ principal: 1000, term: MAX_TERM_MONTHS + 1, monthlyRatePercent: 2 }),
    /não pode passar de/,
  );
  assert.doesNotThrow(() =>
    calculateCredit({ principal: 1000, term: MAX_TERM_MONTHS, monthlyRatePercent: 2 }),
  );
});

test("rejeita valores e taxas fora dos limites", () => {
  assert.throws(
    () => calculateCredit({ principal: MAX_PRINCIPAL + 1, term: 12, monthlyRatePercent: 2 }),
    /grande demais/,
  );
  assert.throws(
    () => calculateCredit({ principal: 0.004, term: 12, monthlyRatePercent: 2 }),
    /maior que zero/,
  );
  assert.throws(
    () => calculateCredit({ principal: 1000, term: 12, monthlyRatePercent: 1001 }),
    /taxa mensal/,
  );
});

test("aceita números escritos em notação científica", () => {
  const result = calculateCredit({ principal: 1000, term: 12, monthlyRatePercent: 1e-7 });

  assert.equal(result.installmentAmount, 83.33);
  assert.ok(result.totalInterest >= 0);
});

test("o prazo máximo com taxa de 4 casas decimais calcula depressa", () => {
  const start = Date.now();

  calculateCredit({ principal: 500_000, term: MAX_TERM_MONTHS, monthlyRatePercent: 14.9999 });

  assert.ok(Date.now() - start < 500, "demorou demais");
});
