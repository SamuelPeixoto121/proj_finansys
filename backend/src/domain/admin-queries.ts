export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 1_000_000;

export interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuditFilters {
  entity?: string;
  action?: string;
}

type Query = Record<string, unknown>;

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parsePagination(query: Query): {
  value?: Pagination;
  error?: string;
} {
  let page = 1;
  let pageSize = DEFAULT_PAGE_SIZE;

  if (query.page !== undefined) {
    const parsed = parsePositiveInteger(query.page);

    if (parsed === null || parsed > MAX_PAGE) {
      return { error: "O parâmetro page deve ser um número inteiro positivo." };
    }

    page = parsed;
  }

  if (query.pageSize !== undefined) {
    const parsed = parsePositiveInteger(query.pageSize);

    if (parsed === null || parsed > MAX_PAGE_SIZE) {
      return {
        error: `O parâmetro pageSize deve ser um número inteiro entre 1 e ${MAX_PAGE_SIZE}.`,
      };
    }

    pageSize = parsed;
  }

  return { value: { page, pageSize, offset: (page - 1) * pageSize } };
}

export function buildPaginationMeta(
  total: number,
  pagination: Pagination,
): PaginationMeta {
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.ceil(total / pagination.pageSize),
  };
}

export function parseAuditFilters(query: Query): {
  value?: AuditFilters;
  error?: string;
} {
  const value: AuditFilters = {};

  for (const field of ["entity", "action"] as const) {
    const raw = query[field];

    if (raw === undefined || raw === "") {
      continue;
    }

    if (typeof raw !== "string" || !/^[A-Z_]{1,50}$/.test(raw)) {
      return {
        error: `O filtro ${field} deve conter apenas letras maiúsculas e sublinhado.`,
      };
    }

    value[field] = raw;
  }

  return { value };
}

export function parseStoredMetadata(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw ?? null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
