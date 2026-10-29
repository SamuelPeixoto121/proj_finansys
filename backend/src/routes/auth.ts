import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../database.js";
import { checkPassword } from "../domain/credentials.js";
import {
  requireAuth,
  type AuthenticatedUser,
} from "../middleware/require-auth.js";

const router = Router();

interface ExistingUser extends RowDataPacket {
  id: number;
}

interface LoginUser extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: "USER" | "ADMIN";
}

interface PublicUser extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
}

function getJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    return null;
  }

  return secret;
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

router.post("/api/v1/auth/login", async (request, response) => {
  const { email, password } = request.body ?? {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim().length === 0 ||
    password.length === 0
  ) {
    response.status(400).json({
      error: "Informe o e-mail e a senha.",
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const [users] = await pool.execute<LoginUser[]>(
      `SELECT id, name, email, password_hash, role
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [normalizedEmail],
    );

    const user = users[0];

    const passwordMatches = await checkPassword(user?.password_hash, password);

    if (!user || !passwordMatches) {
      response.status(401).json({
        error: "E-mail ou senha inválidos.",
      });
      return;
    }

    const jwtSecret = getJwtSecret();

    if (!jwtSecret) {
      console.error("JWT_SECRET ausente ou muito curta.");

      response.status(500).json({
        error: "A autenticação não está configurada corretamente.",
      });
      return;
    }

    const accessToken = jwt.sign(
      { role: user.role },
      jwtSecret,
      {
        subject: String(user.id),
        expiresIn: "15m",
        algorithm: "HS256",
      },
    );

    response.status(200).json({
      message: "Login realizado com sucesso.",
      accessToken,
      tokenType: "Bearer",
      expiresIn: 900,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Erro ao realizar login:", error);

    response.status(500).json({
      error: "Não foi possível realizar o login.",
    });
  }
});

router.get("/api/v1/auth/me", requireAuth, async (_request, response) => {
  const auth = response.locals.auth as AuthenticatedUser;

  try {
    const [users] = await pool.execute<PublicUser[]>(
      `SELECT id, name, email, role
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [auth.userId],
    );

    const user = users[0];

    if (!user) {
      response.status(401).json({
        error: "Usuário não encontrado.",
      });
      return;
    }

    response.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Erro ao consultar usuário autenticado:", error);

    response.status(500).json({
      error: "Não foi possível consultar o usuário.",
    });
  }
});

export default router;
