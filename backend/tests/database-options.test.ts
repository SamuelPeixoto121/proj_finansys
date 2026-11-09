import assert from "node:assert/strict";
import test from "node:test";
import {
  POOL_CONNECTION_LIMIT,
  createPoolOptions,
  parseDatabaseSsl,
  type DatabaseSettings,
} from "../src/database-options.js";

const settings: DatabaseSettings = {
  host: "banco.exemplo.com",
  port: 4000,
  name: "finansys",
  user: "usuario",
  password: "senha",
  ssl: false,
};

test("DB_SSL ausente ou vazio deixa o TLS desligado", () => {
  assert.equal(parseDatabaseSsl(undefined), false);
  assert.equal(parseDatabaseSsl(""), false);
  assert.equal(parseDatabaseSsl("   "), false);
});

test("DB_SSL aceita true/false e 1/0, sem diferenciar maiúsculas", () => {
  assert.equal(parseDatabaseSsl("true"), true);
  assert.equal(parseDatabaseSsl(" TRUE "), true);
  assert.equal(parseDatabaseSsl("1"), true);
  assert.equal(parseDatabaseSsl("false"), false);
  assert.equal(parseDatabaseSsl("False"), false);
  assert.equal(parseDatabaseSsl("0"), false);
});

test("DB_SSL com valor desconhecido é recusado em vez de desligar o TLS em silêncio", () => {
  for (const value of ["sim", "yes", "on", "verdadeiro", "tru"]) {
    assert.throws(() => parseDatabaseSsl(value), /DB_SSL/);
  }
});

test("sem TLS, as opções do pool não têm ssl", () => {
  const options = createPoolOptions(settings);

  assert.equal(options.ssl, undefined);
  assert.equal(options.host, "banco.exemplo.com");
  assert.equal(options.port, 4000);
  assert.equal(options.database, "finansys");
  assert.equal(options.user, "usuario");
  assert.equal(options.password, "senha");
});

test("com TLS, o certificado do servidor é sempre conferido", () => {
  const options = createPoolOptions({ ...settings, ssl: true });

  assert.deepEqual(options.ssl, {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  });
});

test("o pool fecha conexões paradas bem antes dos 340 segundos do TiDB", () => {
  const options = createPoolOptions(settings);

  assert.equal(options.connectionLimit, POOL_CONNECTION_LIMIT);
  // O mysql2 só faz a limpeza de conexões paradas quando maxIdle < connectionLimit.
  assert.ok((options.maxIdle ?? Infinity) < POOL_CONNECTION_LIMIT);
  assert.ok((options.idleTimeout ?? Infinity) <= 120_000);
  assert.equal(options.enableKeepAlive, true);
});
