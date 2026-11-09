import type { PoolOptions } from "mysql2";

export interface DatabaseSettings {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean;
}

export const POOL_CONNECTION_LIMIT = 10;

// O TiDB Cloud derruba conexões paradas depois de cerca de 340 segundos. O mysql2
// confere o pool a cada segundo e fecha as conexões paradas há mais de 60 segundos,
// então nenhuma conexão velha chega a ser reaproveitada. Essa limpeza só roda quando
// maxIdle é menor que connectionLimit.
export const POOL_IDLE_TIMEOUT_MS = 60_000;
export const POOL_MAX_IDLE = 5;

export function parseDatabaseSsl(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();

  if (normalized === "" || normalized === "false" || normalized === "0") return false;
  if (normalized === "true" || normalized === "1") return true;

  throw new Error('DB_SSL deve ser "true" ou "false".');
}

export function createPoolOptions(settings: DatabaseSettings): PoolOptions {
  return {
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    database: settings.name,
    waitForConnections: true,
    connectionLimit: POOL_CONNECTION_LIMIT,
    maxIdle: POOL_MAX_IDLE,
    idleTimeout: POOL_IDLE_TIMEOUT_MS,
    enableKeepAlive: true,
    // Com TLS, o certificado do servidor é sempre conferido contra as autoridades
    // conhecidas do Node; nenhum arquivo de certificado é necessário.
    ...(settings.ssl
      ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } }
      : {}),
  };
}
