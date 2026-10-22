import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PAGE_SIZE,
  buildPaginationMeta,
  parseAuditFilters,
  parsePagination,
  parseStoredMetadata,
} from "../src/domain/admin-queries.js";

test("usa página 1 e 20 itens quando nada é informado", () => {
  const result = parsePagination({});
  assert.deepEqual(result.value, { page: 1, pageSize: 20, offset: 0 });
});

test("calcula o deslocamento a partir de page e pageSize", () => {
  const result = parsePagination({ page: "3", pageSize: "10" });
  assert.deepEqual(result.value, { page: 3, pageSize: 10, offset: 20 });
});

test("aceita o tamanho máximo de página", () => {
  const result = parsePagination({ pageSize: String(MAX_PAGE_SIZE) });
  assert.equal(result.value?.pageSize, MAX_PAGE_SIZE);
});

test("rejeita page inválido", () => {
  const invalid = ["0", "-1", "1.5", "abc", "", "1e3", " 2", ["1", "2"], 5];

  for (const page of invalid) {
    const result = parsePagination({ page });
    assert.ok(result.error, `deveria rejeitar page=${JSON.stringify(page)}`);
    assert.equal(result.value, undefined);
  }
});

test("rejeita pageSize inválido ou acima do máximo", () => {
  const invalid = ["0", "-5", "2.5", "x", String(MAX_PAGE_SIZE + 1), "99999999999999999999"];

  for (const pageSize of invalid) {
    const result = parsePagination({ pageSize });
    assert.ok(
      result.error,
      `deveria rejeitar pageSize=${JSON.stringify(pageSize)}`,
    );
  }
});

test("monta os dados de paginação", () => {
  const pagination = { page: 2, pageSize: 10, offset: 10 };

  assert.deepEqual(buildPaginationMeta(25, pagination), {
    page: 2,
    pageSize: 10,
    total: 25,
    totalPages: 3,
  });
  assert.equal(buildPaginationMeta(20, pagination).totalPages, 2);
  assert.equal(buildPaginationMeta(0, pagination).totalPages, 0);
});

test("aceita consulta de auditoria sem filtros", () => {
  assert.deepEqual(parseAuditFilters({}).value, {});
  assert.deepEqual(parseAuditFilters({ entity: "", action: "" }).value, {});
});

test("aceita filtros de auditoria válidos", () => {
  const result = parseAuditFilters({
    entity: "INTEREST_RATE_RANGE",
    action: "CREATE",
  });

  assert.deepEqual(result.value, {
    entity: "INTEREST_RATE_RANGE",
    action: "CREATE",
  });
});

test("rejeita filtros de auditoria com caracteres inesperados", () => {
  const invalid = [
    { entity: "credit_modality" },
    { entity: "CREDIT MODALITY" },
    { action: "CREATE'; DROP TABLE users;--" },
    { action: ["CREATE", "UPDATE"] },
    { entity: "A".repeat(51) },
  ];

  for (const query of invalid) {
    const result = parseAuditFilters(query);
    assert.ok(result.error, `deveria rejeitar ${JSON.stringify(query)}`);
    assert.equal(result.value, undefined);
  }
});

test("interpreta o metadata guardado, seja objeto ou texto JSON", () => {
  assert.deepEqual(parseStoredMetadata({ code: "TESTE" }), { code: "TESTE" });
  assert.deepEqual(parseStoredMetadata('{"code":"TESTE"}'), { code: "TESTE" });
  assert.equal(parseStoredMetadata("{quebrado"), null);
  assert.equal(parseStoredMetadata(null), null);
  assert.equal(parseStoredMetadata(undefined), null);
});
