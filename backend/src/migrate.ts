
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RowDataPacket } from "mysql2";
import { pool } from "./database.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = resolve(
  currentDirectory,
  "../database/migrations",
);

interface AppliedMigration extends RowDataPacket {
  filename: string;
}

async function runMigrations() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [rows] = await pool.query<AppliedMigration[]>(
      "SELECT filename FROM schema_migrations",
    );

    const appliedMigrations = new Set(
      rows.map((migration) => migration.filename),
    );

    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (appliedMigrations.has(file)) {
        console.log(`Migration já aplicada: ${file}`);
        continue;
      }

      const filePath = resolve(migrationsDirectory, file);
      const sql = await readFile(filePath, "utf8");

      const statements = sql
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);

      for (const statement of statements) {
        await pool.query(statement);
      }

      await pool.execute(
        "INSERT INTO schema_migrations (filename) VALUES (?)",
        [file],
      );

      console.log(`Migration aplicada: ${file}`);
    }

    console.log("Verificação de migrations concluída.");
  } catch (error) {
    console.error("Falha ao executar migrations:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigrations();