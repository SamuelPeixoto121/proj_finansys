import { Router } from "express";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { pool } from "../database.js";
import {
  parsePasswordChange,
  parseProfileUpdate,
} from "../domain/account-rules.js";
import { checkPassword } from "../domain/credentials.js";
import { createPasswordChangeRateLimit } from "../middleware/auth-rate-limit.js";
import {
  requireAuth,
  type AuthenticatedUser,
} from "../middleware/require-auth.js";

const router = Router();

interface PublicUser extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
}

interface PasswordRow extends RowDataPacket {
  password_hash: string;
}

router.patch("/api/v1/auth/me", requireAuth, async (request, response) => {
  const auth = response.locals.auth as AuthenticatedUser;
  const parsed = parseProfileUpdate(request.body);

  if (!parsed.value) {
    response.status(400).json({ error: parsed.error });
    return;
  }

  try {
    await pool.execute("UPDATE users SET name = ? WHERE id = ?", [
      parsed.value.name,
      auth.userId,
    ]);

    const [users] = await pool.execute<PublicUser[]>(
      "SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1",
      [auth.userId],
    );

    const user = users[0];

    if (!user) {
      response.status(401).json({ error: "Usuário não encontrado." });
      return;
    }

    response.status(200).json({
      message: "Nome atualizado com sucesso.",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("Erro ao atualizar o perfil:", error);
    response.status(500).json({ error: "Não foi possível atualizar o nome." });
  }
});

router.patch(
  "/api/v1/auth/me/password",
  requireAuth,
  createPasswordChangeRateLimit(),
  async (request, response) => {
    const auth = response.locals.auth as AuthenticatedUser;
    const parsed = parsePasswordChange(request.body);

    if (!parsed.value) {
      response.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const [rows] = await pool.execute<PasswordRow[]>(
        "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
        [auth.userId],
      );

      const stored = rows[0];

      if (!stored) {
        response.status(401).json({ error: "Usuário não encontrado." });
        return;
      }

      const matches = await checkPassword(
        stored.password_hash,
        parsed.value.currentPassword,
      );

      // 400 e não 401: o site trata 401 como "sessão expirada" e deslogaria a pessoa.
      if (!matches) {
        response.status(400).json({ error: "A senha atual está incorreta." });
        return;
      }

      const newHash = await bcrypt.hash(parsed.value.newPassword, 12);

      await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [
        newHash,
        auth.userId,
      ]);

      response.status(200).json({ message: "Senha alterada com sucesso." });
    } catch (error) {
      console.error("Erro ao alterar a senha:", error);
      response.status(500).json({ error: "Não foi possível alterar a senha." });
    }
  },
);

export default router;
