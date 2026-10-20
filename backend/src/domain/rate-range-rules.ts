export interface RateRangeInput {
  minTerm: number;
  maxTerm: number;
  monthlyRatePercent: number;
}

export interface TermRange {
  id?: number;
  minTerm: number;
  maxTerm: number;
}

export interface TermLimits {
  minTerm: number;
  maxTerm: number;
}

export const MAX_MONTHLY_RATE_PERCENT = 100;

export function parseRateRangeInput(body: unknown): {
  value?: RateRangeInput;
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Envie os dados da faixa de juros." };
  }

  const { minTerm, maxTerm, monthlyRatePercent } = body as Record<
    string,
    unknown
  >;

  if (
    typeof minTerm !== "number" ||
    typeof maxTerm !== "number" ||
    !Number.isInteger(minTerm) ||
    !Number.isInteger(maxTerm) ||
    minTerm < 1 ||
    maxTerm < minTerm
  ) {
    return {
      error:
        "Informe prazos inteiros e válidos: o mínimo deve ser 1 ou mais e o máximo não pode ser menor que o mínimo.",
    };
  }

  if (
    typeof monthlyRatePercent !== "number" ||
    !Number.isFinite(monthlyRatePercent) ||
    monthlyRatePercent < 0 ||
    monthlyRatePercent > MAX_MONTHLY_RATE_PERCENT
  ) {
    return {
      error: `A taxa mensal deve ser um número entre 0 e ${MAX_MONTHLY_RATE_PERCENT}.`,
    };
  }

  const scaled = monthlyRatePercent * 10000;

  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    return { error: "A taxa mensal pode ter no máximo 4 casas decimais." };
  }

  return { value: { minTerm, maxTerm, monthlyRatePercent } };
}

export function rangesOverlap(a: TermRange, b: TermRange): boolean {
  return a.minTerm <= b.maxTerm && a.maxTerm >= b.minTerm;
}

export function findOverlappingRange(
  existing: TermRange[],
  candidate: TermRange,
  ignoreId?: number,
): TermRange | undefined {
  return existing.find(
    (range) =>
      (ignoreId === undefined || range.id !== ignoreId) &&
      rangesOverlap(range, candidate),
  );
}

export function isInsideLimits(range: TermRange, limits: TermLimits): boolean {
  return range.minTerm >= limits.minTerm && range.maxTerm <= limits.maxTerm;
}
