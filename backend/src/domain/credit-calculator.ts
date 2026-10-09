
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

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCredit(
  input: CreditCalculationInput,
): CreditCalculationResult {
  const { principal, term, monthlyRatePercent } = input;

  if (!Number.isFinite(principal) || principal <= 0) {
    throw new Error("O valor solicitado deve ser maior que zero.");
  }

  if (!Number.isInteger(term) || term <= 0) {
    throw new Error("O prazo deve ser um número inteiro positivo.");
  }

  if (
    !Number.isFinite(monthlyRatePercent) ||
    monthlyRatePercent < 0
  ) {
    throw new Error("A taxa mensal não pode ser negativa ou inválida.");
  }

  const roundedPrincipal = roundToCents(principal);
  const monthlyRate = monthlyRatePercent / 100;

  const rawInstallment =
    monthlyRate === 0
      ? roundedPrincipal / term
      : (roundedPrincipal * monthlyRate) /
        (1 - Math.pow(1 + monthlyRate, -term));

  const installmentAmount = roundToCents(rawInstallment);
  const totalAmount = roundToCents(rawInstallment * term);
  const totalInterest = roundToCents(
    totalAmount - roundedPrincipal,
  );

  return {
    installmentAmount,
    totalAmount,
    totalInterest,
  };
}