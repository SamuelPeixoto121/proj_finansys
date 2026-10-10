import { Router } from "express";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../database.js";

const router = Router();

interface ExistingUser extends RowDataPacket {
  id: number;
}

router.post("/api/v1/auth/register", async (request, response) => {
  const { name, email, password } = request.body ?? {};

  if (
    typeof name !== "string" ||
    name.trim().length < 2 ||
    name.trim().length > 120
  ) {
    response.status(400).json({
      error: "O nome deve ter entre 2 e 120 caracteres.",
    });
    return;
  }

  if (typeof email !== "string") {
    response.status(400).json({
      error: "Informe um e-mail válido.",
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (
    normalizedEmail.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    response.status(400).json({
      error: "Informe um e-mail válido.",
    });
    return;
  }

  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    response.status(400).json({
      error: "A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.",
    });
    return;
  }

  try {
    const [existingUsers] = await pool.execute<ExistingUser[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail],
    );

    if (existingUsers.length > 0) {
      response.status(409).json({
        error: "Já existe uma conta cadastrada com esse e-mail.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO users (name, email, password_hash)
       VALUES (?, ?, ?)`,
      [name.trim(), normalizedEmail, passwordHash],
    );

    response.status(201).json({
      message: "Conta criada com sucesso.",
      user: {
        id: result.insertId,
        name: name.trim(),
        email: normalizedEmail,
        role: "USER",
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
    ) {
      response.status(409).json({
        error: "Já existe uma conta cadastrada com esse e-mail.",
      });
      return;
    }

    console.error("Erro ao cadastrar usuário:", error);

    response.status(500).json({
      error: "Não foi possível criar a conta.",
    });
  }
});

export default router;