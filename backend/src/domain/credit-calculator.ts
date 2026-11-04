export interface CreditCalculationInput {
  principal: number;
  term: number;
  monthlyRatePercent: number;
}

export interface CreditCalculationResult {
  installmentAmount: number;
  totalAmount: number;
  totalInterest: number;
}

// Limites que protegem o servidor de contas gigantes e acompanham o banco
// (as colunas de valor são DECIMAL(15, 2)).
export const MAX_TERM_MONTHS = 1200;
export const MAX_PRINCIPAL = 9_999_999_999_999.99;
const MAX_MONTHLY_RATE_PERCENT = 1000;

interface ScaledDecimal {
  digits: bigint;
  scale: number;
}

// Lê um número como texto decimal exato (por exemplo 4.5 vira 45 com escala 1),
// sem passar por contas em ponto flutuante.
function toScaledDecimal(value: number): ScaledDecimal {
  let text = value.toString();

  if (/e/i.test(text)) {
    text = value.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
  }

  const [integerPart, fractionPart = ""] = text.split(".");

  return {
    digits: BigInt(integerPart + fractionPart),
    scale: fractionPart.length,
  };
}

// Divide e arredonda para o inteiro mais próximo, com o meio indo para cima.
function roundHalfUpDivide(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

function centsToReais(cents: bigint): number {
  return Number(cents) / 100;
}

export function calculateCredit(
  input: CreditCalculationInput,
): CreditCalculationResult {
  const { principal, term, monthlyRatePercent } = input;

  if (!Number.isFinite(principal) || principal <= 0) {
    throw new Error("O valor solicitado deve ser maior que zero.");
  }

  if (principal > MAX_PRINCIPAL) {
    throw new Error("O valor solicitado é grande demais.");
  }

  if (!Number.isInteger(term) || term <= 0) {
    throw new Error("O prazo deve ser um número inteiro positivo.");
  }

  if (term > MAX_TERM_MONTHS) {
    throw new Error(`O prazo não pode passar de ${MAX_TERM_MONTHS} meses.`);
  }

  if (!Number.isFinite(monthlyRatePercent) || monthlyRatePercent < 0) {
    throw new Error("A taxa mensal não pode ser negativa ou inválida.");
  }

  if (monthlyRatePercent > MAX_MONTHLY_RATE_PERCENT) {
    throw new Error("A taxa mensal é alta demais.");
  }

  const amount = toScaledDecimal(principal);
  const principalCents = roundHalfUpDivide(
    amount.digits * 100n,
    10n ** BigInt(amount.scale),
  );

  if (principalCents === 0n) {
    throw new Error("O valor solicitado deve ser maior que zero.");
  }

  const months = BigInt(term);
  const rate = toScaledDecimal(monthlyRatePercent);

  let installmentCents: bigint;

  if (rate.digits === 0n) {
    installmentCents = roundHalfUpDivide(principalCents, months);
  } else {
    // Tabela Price: parcela = P * i * (1 + i)^n / ((1 + i)^n - 1), com i = taxa / 100.
    // Escrevendo i = r / D (inteiros), tudo vira uma fração exata de inteiros.
    const divisor = 10n ** BigInt(rate.scale + 2);
    const grown = (divisor + rate.digits) ** months;
    const base = divisor ** months;

    installmentCents = roundHalfUpDivide(
      principalCents * rate.digits * grown,
      divisor * (grown - base),
    );
  }

  // Com juros, o total é o que a pessoa paga de fato: a parcela (em centavos)
  // vezes o prazo, e assim a conta fecha na tela. Sem juros, o total é o próprio
  // valor pedido e os juros são zero, mesmo que a divisão em parcelas
  // arredondadas sobre ou falte alguns centavos. Em taxas muito baixas, se o
  // arredondamento deixasse o total abaixo do valor pedido, o total também
  // fica igual ao valor pedido, porque os juros nunca podem ser negativos.
  let totalCents = rate.digits === 0n ? principalCents : installmentCents * months;

  if (totalCents < principalCents) {
    totalCents = principalCents;
  }

  return {
    installmentAmount: centsToReais(installmentCents),
    totalAmount: centsToReais(totalCents),
    totalInterest: centsToReais(totalCents - principalCents),
  };
}
