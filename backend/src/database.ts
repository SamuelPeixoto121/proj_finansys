import mysql from "mysql2/promise";
import { config } from "./config.js";
import { createPoolOptions, SESSION_TIME_ZONE_SQL } from "./database-options.js";

export const pool = mysql.createPool(createPoolOptions(config.database));

// Cada conexão nova trabalha em UTC. O comando entra na fila da conexão antes de
// qualquer consulta da aplicação. O evento é ouvido no pool interno (pool.pool),
// que é quem de fato entrega a conexão, com a interface de callbacks.
pool.pool.on("connection", (connection) => {
  connection.query(SESSION_TIME_ZONE_SQL, (error) => {
    if (error) console.error("Não foi possível definir o fuso UTC na conexão:", error);
  });
});
