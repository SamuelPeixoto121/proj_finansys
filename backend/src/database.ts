import mysql from "mysql2/promise";
import { config } from "./config.js";
import { createPoolOptions } from "./database-options.js";

export const pool = mysql.createPool(createPoolOptions(config.database));
