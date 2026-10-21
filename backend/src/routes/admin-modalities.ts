import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { pool } from "../database.js";
import type { AuthenticatedUser } from "../middleware/require-auth.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";

const router = Router();

interface ModalityRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  description: string | null;
  min_amount: string | number;
  max_amount: string | number;
  min_term: number;
  max_term: number;
  active: number | boolean;
  created_at: Date;
  updated_at: Date;
  rate_range_count?: number;
}

interface ModalityInput {
  name: string;
  description: string | null;
  minAmount: number;
  maxAmount: number;
  minTerm: number;
  maxTerm: number;
}

function parseInput(body: unknown): { value?: ModalityInput; error?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Envie os dados da modalidade." };
  }

  const data = body as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const description =
    data.description === undefined || data.description === null
      ? null
      : typeof data.description === "string"
        ? data.description.trim() || null
        : undefined;
  const { minAmount, maxAmount, minTerm, maxTerm } = data;

  if (name.length < 2 || name.length > 120) {
    return { error: "O nome deve ter entre 2 e 120 caracteres." };
  }
  if (description === undefined) {
    return { error: "A descrição deve ser um texto." };
  }
  if (description && description.length > 2000) {
    return { error: "A descrição deve ter no máximo 2000 caracteres." };
  }
  if (
    typeof minAmount !== "number" ||
    !Number.isFinite(minAmount) ||
    minAmount <= 0 ||
    typeof maxAmount !== "number" ||
    !Number.isFinite(maxAmount) ||
    maxAmount < minAmount
  ) {
    return { error: "Informe limites de valor válidos." };
  }
  if (
    !Number.isInteger(minTerm) ||
    (minTerm as number) < 1 ||
    !Number.isInteger(maxTerm) ||
    (maxTerm as number) < (minTerm as number)
  ) {
    return { error: "Informe limites de prazo inteiros e válidos." };
  }

  return {
    value: {
      name,
      description,
      minAmount,
      maxAmount,
      minTerm: minTerm as number,
      maxTerm: maxTerm as number,
    },
  };
}

function mapModality(row: ModalityRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    limits: {
      minAmount: Number(row.min_amount),
      maxAmount: Number(row.max_amount),
      minTerm: row.min_term,
      maxTerm: row.max_term,
    },
    active: Boolean(row.active),
    rateRangeCount: Number(row.rate_range_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function writeAudit(
  connection: PoolConnection,
  userId: number,
  action: string,
  modalityId: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  await connection.execute(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata)
     VALUES (?, ?, 'CREDIT_MODALITY', ?, ?)`,
    [userId, action, modalityId, JSON.stringify(metadata)],
  );
}

router.use("/api/v1/admin", requireAuth, requireAdmin);

router.get("/api/v1/admin/modalities", async (_request, response) => {
  try {
    const [rows] = await pool.query<ModalityRow[]>(
      `SELECT cm.id, cm.code, cm.name, cm.description,
              cm.min_amount, cm.max_amount, cm.min_term, cm.max_term,
              cm.active, cm.created_at, cm.updated_at,
              COUNT(irr.id) AS rate_range_count
       FROM credit_modalities cm
       LEFT JOIN interest_rate_ranges irr ON irr.modality_id = cm.id
       GROUP BY cm.id
       ORDER BY cm.created_at DESC, cm.id DESC`,
    );
    response.status(200).json({ modalities: rows.map(mapModality) });
  } catch {
    response.status(500).json({ error: "Não foi possível listar as modalidades." });
  }
});

router.post("/api/v1/admin/modalities", async (request, response) => {
  const code =
    typeof request.body?.code === "string"
      ? request.body.code.trim().toUpperCase()
      : "";
  const parsed = parseInput(request.body);

  if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(code)) {
    response.status(400).json({
      error: "O código deve começar com uma letra e conter de 2 a 50 letras, números ou sublinhados.",
    });
    return;
  }
  if (!parsed.value) {
    response.status(400).json({ error: parsed.error });
    return;
  }

  const auth = response.locals.auth as AuthenticatedUser;
  const input = parsed.value;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO credit_modalities
       (code, name, description, min_amount, max_amount, min_term, max_term, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        code,
        input.name,
        input.description,
        input.minAmount,
        input.maxAmount,
        input.minTerm,
        input.maxTerm,
      ],
    );
    await writeAudit(connection, auth.userId, "CREATE", result.insertId, {
      code,
      ...input,
    });
    await connection.commit();
    response.status(201).json({
      message: "Modalidade criada. Configure as faixas de juros antes de liberar simulações.",
      modality: {
        id: result.insertId,
        code,
        name: input.name,
        description: input.description,
        limits: {
          minAmount: input.minAmount,
          maxAmount: input.maxAmount,
          minTerm: input.minTerm,
          maxTerm: input.maxTerm,
        },
        active: true,
        rateRangeCount: 0,
      },
    });
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      response.status(409).json({ error: "Já existe uma modalidade com esse código." });
      return;
    }
    response.status(500).json({ error: "Não foi possível criar a modalidade." });
  } finally {
    connection.release();
  }
});

router.patch("/api/v1/admin/modalities/:code", async (request, response) => {
  const code =
    typeof request.params.code === "string"
      ? request.params.code.trim().toUpperCase()
      : "";
  const parsed = parseInput(request.body);

  if (!parsed.value) {
    response.status(400).json({ error: parsed.error });
    return;
  }

  const auth = response.locals.auth as AuthenticatedUser;
  const input = parsed.value;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute<ModalityRow[]>(
      `SELECT id, code, name, description, min_amount, max_amount,
              min_term, max_term, active, created_at, updated_at
       FROM credit_modalities WHERE code = ? LIMIT 1`,
      [code],
    );
    if (!existing[0]) {
      await connection.rollback();
      response.status(404).json({ error: "Modalidade não encontrada." });
      return;
    }

    await connection.execute(
      `UPDATE credit_modalities
       SET name = ?, description = ?, min_amount = ?, max_amount = ?,
           min_term = ?, max_term = ?
       WHERE id = ?`,
      [
        input.name,
        input.description,
        input.minAmount,
        input.maxAmount,
        input.minTerm,
        input.maxTerm,
        existing[0].id,
      ],
    );
    await writeAudit(connection, auth.userId, "UPDATE", existing[0].id, {
      code,
      ...input,
    });
    await connection.commit();
    response.status(200).json({ message: "Modalidade atualizada com sucesso." });
  } catch {
    await connection.rollback();
    response.status(500).json({ error: "Não foi possível atualizar a modalidade." });
  } finally {
    connection.release();
  }
});

router.patch("/api/v1/admin/modalities/:code/status", async (request, response) => {
  const code =
    typeof request.params.code === "string"
      ? request.params.code.trim().toUpperCase()
      : "";
  const active = request.body?.active;

  if (typeof active !== "boolean") {
    response.status(400).json({ error: "O campo active deve ser true ou false." });
    return;
  }

  const auth = response.locals.auth as AuthenticatedUser;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<ModalityRow[]>(
      `SELECT id, code, name, description, min_amount, max_amount,
              min_term, max_term, active, created_at, updated_at
       FROM credit_modalities WHERE code = ? LIMIT 1`,
      [code],
    );
    const modality = rows[0];
    if (!modality) {
      await connection.rollback();
      response.status(404).json({ error: "Modalidade não encontrada." });
      return;
    }

    await connection.execute(
      "UPDATE credit_modalities SET active = ? WHERE id = ?",
      [active, modality.id],
    );
    await writeAudit(
      connection,
      auth.userId,
      active ? "ACTIVATE" : "DEACTIVATE",
      modality.id,
      { code, active },
    );
    await connection.commit();
    response.status(200).json({
      message: active ? "Modalidade ativada." : "Modalidade desativada.",
    });
  } catch {
    await connection.rollback();
    response.status(500).json({ error: "Não foi possível alterar o status da modalidade." });
  } finally {
    connection.release();
  }
});

export default router;
