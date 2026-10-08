import app from "./app.js";
import { config } from "./config.js";
import { pool } from "./database.js";

async function startServer() {
  try {
    await pool.query("SELECT 1");

    app.listen(config.port, () => {
      console.log(`FinanSys API rodando na porta ${config.port}`);
    });
  } catch (error) {
    console.error("Não foi possível conectar ao MySQL:", error);
    process.exit(1);
  }
}

startServer();