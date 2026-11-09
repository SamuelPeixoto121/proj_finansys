import "dotenv/config";
import { parseDatabaseSsl, type DatabaseSettings } from "./database-options.js";

const port = Number(process.env.PORT ?? 3000);

const database: DatabaseSettings = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  name: process.env.DB_NAME ?? "finansys",
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  ssl: parseDatabaseSsl(process.env.DB_SSL),
};

export const config = {
  port,
  database,
};
