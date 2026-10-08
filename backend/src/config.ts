import "dotenv/config";

const port = Number(process.env.PORT ?? 3000);

export const config = {
  port,
  database: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    name: process.env.DB_NAME ?? "finansys",
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
  },
};