import app from "./app.js";
import { config } from "./config.js";
import { pool } from "./database.js";
import { findStartupProblems } from "./startup-checks.js";

async function startServer() {
  const problems = findStartupProblems(process.env);

  if (problems.length > 0) {
    console.error(`Configuração inválida:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }

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
