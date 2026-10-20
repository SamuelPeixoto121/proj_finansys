import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { pool } from "../database.js";
import {
  findOverlappingRange,
  isInsideLimits,
  parseRateRangeInput,
} from "../domain/rate-range-rules.js";
import { requireAdmin } from "../middleware/require-admin.js";
import type { AuthenticatedUser } from "../middleware/require-auth.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

interface ModalityRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  min_term: number;
  max_term: number;
}

interface RateRangeRow extends RowDataPacket {
  id: number;
  modality_id: number;
  min_term: number;
  max_term: number;
  monthly_rate: string | number;
  active: number | boolean;
  created_at: Date;
  updated_at: Date;
}

class RuleError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function normalizeCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function parseRateId(value: unknown): number | null {
  return typeof value === "string" && /^[1-9]\d*$/.test(value)
    ? Number(value)
    : null;
}

function mapRateRange(row: RateRangeRow) {
  return {
    id: row.id,
    minTerm: row.min_term,
    maxTerm: row.max_term,
    monthlyRatePercent: Number(row.monthly_rate),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function lockModality(
  connection: PoolConnection,
  code: string,
): Promise<ModalityRow> {
  const [rows] = await connection.execute<ModalityRow[]>(
    `SELECT id, code, name, min_term, max_term
     FROM credit_modalities
     WHERE code = ?
     LIMIT 1
     FOR UPDATE`,
    [code],
  );

  if (!rows[0]) {
    throw new RuleError(404, "Modalidade não encontrada.");
  }

  return rows[0];
}

async function loadRateRange(
  connection: PoolConnection,
  modalityId: number,
  rateId: number,
): Promise<RateRangeRow> {
  const [rows] = await connection.execute<RateRangeRow[]>(
    `SELECT id, modality_id, min_term, max_term, monthly_rate, active,
            created_at, updated_at
     FROM interest_rate_ranges
     WHERE id = ? AND modality_id = ?
     LIMIT 1`,
    [rateId, modalityId],
  );

  if (!rows[0]) {
    throw new RuleError(404, "Faixa de juros não encontrada.");
  }

  return rows[0];
}

async function assertNoOverlap(
  connection: PoolConnection,
  modalityId: number,
  candidate: { minTerm: number; maxTerm: number },
  ignoreId?: number,
): Promise<void> {
  const [rows] = await connection.execute<RateRangeRow[]>(
    `SELECT id, min_term, max_term
     FROM interest_rate_ranges
     WHERE modality_id = ? AND active = TRUE`,
    [modalityId],
  );

  const overlap = findOverlappingRange(
    rows.map((row) => ({
      id: row.id,
      minTerm: row.min_term,
      maxTerm: row.max_term,
    })),
    candidate,
    ignoreId,
  );

  if (overlap) {
    throw new RuleError(
      409,
      `O prazo se sobrepõe a uma faixa ativa existente (${overlap.minTerm} a ${overlap.maxTerm} meses).`,
    );
  }
}

async function writeAudit(
  connection: PoolConnection,
  userId: number,
  action: string,
  rateId: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  await connection.execute(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata)
     VALUES (?, ?, 'INTEREST_RATE_RANGE', ?, ?)`,
    [userId, action, rateId, JSON.stringify(metadata)],
  );
}

async function runInTransaction<T>(
  response: import("express").Response,
  failureMessage: string,
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T | undefined> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();

    if (error instanceof RuleError) {
      response.status(error.status).json({ error: error.message });
    } else {
      console.error(failureMessage, error);
      response.status(500).json({ error: failureMessage });
    }

    return undefined;
  } finally {
    connection.release();
  }
}

router.use("/api/v1/admin", requireAuth, requireAdmin);

router.get(
  "/api/v1/admin/modalities/:code/rates",
  async (request, response) => {
    const code = normalizeCode(request.params.code);

    try {
      const [modalities] = await pool.execute<ModalityRow[]>(
        `SELECT id, code, name, min_term, max_term
         FROM credit_modalities
         WHERE code = ?
         LIMIT 1`,
        [code],
      );

      const modality = modalities[0];

      if (!modality) {
        response.status(404).json({ error: "Modalidade não encontrada." });
        return;
      }

      const [rates] = await pool.execute<RateRangeRow[]>(
        `SELECT id, modality_id, min_term, max_term, monthly_rate, active,
                created_at, updated_at
         FROM interest_rate_ranges
         WHERE modality_id = ?
         ORDER BY min_term ASC, id ASC`,
        [modality.id],
      );

      response.status(200).json({
        modality: {
          code: modality.code,
          name: modality.name,
          limits: { minTerm: modality.min_term, maxTerm: modality.max_term },
        },
        rateRanges: rates.map(mapRateRange),
      });
    } catch (error) {
      console.error("Erro ao listar faixas de juros:", error);
      response
        .status(500)
        .json({ error: "Não foi possível listar as faixas de juros." });
    }
  },
);

router.post(
  "/api/v1/admin/modalities/:code/rates",
  async (request, response) => {
    const code = normalizeCode(request.params.code);
    const parsed = parseRateRangeInput(request.body);

    if (!parsed.value) {
      response.status(400).json({ error: parsed.error });
      return;
    }

    const input = parsed.value;
    const auth = response.locals.auth as AuthenticatedUser;

    const created = await runInTransaction(
      response,
      "Não foi possível criar a faixa de juros.",
      async (connection) => {
        const modality = await lockModality(connection, code);

        if (!isInsideLimits(input, {
          minTerm: modality.min_term,
          maxTerm: modality.max_term,
        })) {
          throw new RuleError(
            400,
            `O prazo da faixa deve ficar entre ${modality.min_term} e ${modality.max_term} meses, que são os limites da modalidade.`,
          );
        }

        await assertNoOverlap(connection, modality.id, input);

        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO interest_rate_ranges
             (modality_id, min_term, max_term, monthly_rate, active)
           VALUES (?, ?, ?, ?, TRUE)`,
          [modality.id, input.minTerm, input.maxTerm, input.monthlyRatePercent],
        );

        await writeAudit(connection, auth.userId, "CREATE", result.insertId, {
          code,
          ...input,
        });

        return result.insertId;
      },
    );

    if (created !== undefined) {
      response.status(201).json({
        message: "Faixa de juros criada com sucesso.",
        rateRange: { id: created, ...input, active: true },
      });
    }
  },
);

router.patch(
  "/api/v1/admin/modalities/:code/rates/:rateId",
  async (request, response) => {
    const code = normalizeCode(request.params.code);
    const rateId = parseRateId(request.params.rateId);

    if (rateId === null) {
      response.status(400).json({ error: "Identificador de faixa inválido." });
      return;
    }

    const parsed = parseRateRangeInput(request.body);

    if (!parsed.value) {
      response.status(400).json({ error: parsed.error });
      return;
    }

    const input = parsed.value;
    const auth = response.locals.auth as AuthenticatedUser;

    const updated = await runInTransaction(
      response,
      "Não foi possível atualizar a faixa de juros.",
      async (connection) => {
        const modality = await lockModality(connection, code);
        const current = await loadRateRange(connection, modality.id, rateId);

        if (!isInsideLimits(input, {
          minTerm: modality.min_term,
          maxTerm: modality.max_term,
        })) {
          throw new RuleError(
            400,
            `O prazo da faixa deve ficar entre ${modality.min_term} e ${modality.max_term} meses, que são os limites da modalidade.`,
          );
        }

        if (current.active) {
          await assertNoOverlap(connection, modality.id, input, rateId);
        }

        await connection.execute(
          `UPDATE interest_rate_ranges
           SET min_term = ?, max_term = ?, monthly_rate = ?
           WHERE id = ?`,
          [input.minTerm, input.maxTerm, input.monthlyRatePercent, rateId],
        );

        await writeAudit(connection, auth.userId, "UPDATE", rateId, {
          code,
          before: {
            minTerm: current.min_term,
            maxTerm: current.max_term,
            monthlyRatePercent: Number(current.monthly_rate),
          },
          after: input,
        });

        return true;
      },
    );

    if (updated) {
      response
        .status(200)
        .json({ message: "Faixa de juros atualizada com sucesso." });
    }
  },
);

router.patch(
  "/api/v1/admin/modalities/:code/rates/:rateId/status",
  async (request, response) => {
    const code = normalizeCode(request.params.code);
    const rateId = parseRateId(request.params.rateId);
    const active = request.body?.active;

    if (rateId === null) {
      response.status(400).json({ error: "Identificador de faixa inválido." });
      return;
    }

    if (typeof active !== "boolean") {
      response
        .status(400)
        .json({ error: "O campo active deve ser true ou false." });
      return;
    }

    const auth = response.locals.auth as AuthenticatedUser;

    const changed = await runInTransaction(
      response,
      "Não foi possível alterar o status da faixa de juros.",
      async (connection) => {
        const modality = await lockModality(connection, code);
        const current = await loadRateRange(connection, modality.id, rateId);

        if (active) {
          await assertNoOverlap(
            connection,
            modality.id,
            { minTerm: current.min_term, maxTerm: current.max_term },
            rateId,
          );
        }

        await connection.execute(
          "UPDATE interest_rate_ranges SET active = ? WHERE id = ?",
          [active, rateId],
        );

        await writeAudit(
          connection,
          auth.userId,
          active ? "ACTIVATE" : "DEACTIVATE",
          rateId,
          { code, active },
        );

        return true;
      },
    );

    if (changed) {
      response.status(200).json({
        message: active ? "Faixa ativada." : "Faixa desativada.",
      });
    }
  },
);

export default router;
