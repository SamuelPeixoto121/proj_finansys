import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { pool } from "../database.js";
import {
  buildPaginationMeta,
  parseAuditFilters,
  parsePagination,
  parseStoredMetadata,
} from "../domain/admin-queries.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

interface CountRow extends RowDataPacket {
  total: number | string;
}

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  created_at: Date;
  simulation_count: number | string;
}

interface AuditRow extends RowDataPacket {
  id: number;
  action: string;
  entity: string;
  entity_id: number | null;
  metadata: unknown;
  created_at: Date;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
}

interface UsersSummaryRow extends RowDataPacket {
  total: number | string;
  admins: number | string | null;
}

interface SimulationsSummaryRow extends RowDataPacket {
  total: number | string;
  last7: number | string | null;
  last30: number | string | null;
  amount: number | string | null;
}

interface FlagSummaryRow extends RowDataPacket {
  total: number | string;
  active: number | string | null;
}

interface ByModalityRow extends RowDataPacket {
  code: string;
  name: string;
  simulations: number | string;
}

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

router.use("/api/v1/admin", requireAuth, requireAdmin);

router.get("/api/v1/admin/users", async (request, response) => {
  const pagination = parsePagination(request.query);

  if (!pagination.value) {
    response.status(400).json({ error: pagination.error });
    return;
  }

  const { pageSize, offset } = pagination.value;

  try {
    const [count] = await pool.query<CountRow[]>(
      "SELECT COUNT(*) AS total FROM users",
    );

    const [rows] = await pool.query<UserRow[]>(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              COUNT(s.id) AS simulation_count
       FROM users u
       LEFT JOIN simulations s ON s.user_id = u.id
       GROUP BY u.id, u.name, u.email, u.role, u.created_at
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset],
    );

    response.status(200).json({
      users: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
        simulationCount: toNumber(row.simulation_count),
      })),
      pagination: buildPaginationMeta(
        toNumber(count[0]?.total),
        pagination.value,
      ),
    });
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    response
      .status(500)
      .json({ error: "Não foi possível listar os usuários." });
  }
});

router.get("/api/v1/admin/metrics", async (_request, response) => {
  try {
    const [
      [users],
      [simulations],
      [modalities],
      [rateRanges],
      [byModality],
    ] = await Promise.all([
      pool.query<UsersSummaryRow[]>(
        `SELECT COUNT(*) AS total, SUM(role = 'ADMIN') AS admins FROM users`,
      ),
      pool.query<SimulationsSummaryRow[]>(
        `SELECT COUNT(*) AS total,
                SUM(created_at >= NOW() - INTERVAL 7 DAY) AS last7,
                SUM(created_at >= NOW() - INTERVAL 30 DAY) AS last30,
                SUM(requested_amount) AS amount
         FROM simulations`,
      ),
      pool.query<FlagSummaryRow[]>(
        `SELECT COUNT(*) AS total, SUM(active) AS active FROM credit_modalities`,
      ),
      pool.query<FlagSummaryRow[]>(
        `SELECT COUNT(*) AS total, SUM(active) AS active FROM interest_rate_ranges`,
      ),
      pool.query<ByModalityRow[]>(
        `SELECT m.code, m.name, COUNT(s.id) AS simulations
         FROM credit_modalities m
         LEFT JOIN simulations s ON s.modality_id = m.id
         GROUP BY m.id, m.code, m.name
         ORDER BY simulations DESC, m.name ASC`,
      ),
    ]);

    response.status(200).json({
      users: {
        total: toNumber(users[0]?.total),
        admins: toNumber(users[0]?.admins),
      },
      simulations: {
        total: toNumber(simulations[0]?.total),
        last7Days: toNumber(simulations[0]?.last7),
        last30Days: toNumber(simulations[0]?.last30),
        totalRequestedAmount: toNumber(simulations[0]?.amount),
      },
      modalities: {
        total: toNumber(modalities[0]?.total),
        active: toNumber(modalities[0]?.active),
      },
      rateRanges: {
        total: toNumber(rateRanges[0]?.total),
        active: toNumber(rateRanges[0]?.active),
      },
      simulationsByModality: byModality.map((row) => ({
        code: row.code,
        name: row.name,
        simulations: toNumber(row.simulations),
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao calcular métricas:", error);
    response
      .status(500)
      .json({ error: "Não foi possível calcular as métricas." });
  }
});

router.get("/api/v1/admin/audit-logs", async (request, response) => {
  const pagination = parsePagination(request.query);

  if (!pagination.value) {
    response.status(400).json({ error: pagination.error });
    return;
  }

  const filters = parseAuditFilters(request.query);

  if (!filters.value) {
    response.status(400).json({ error: filters.error });
    return;
  }

  const conditions: string[] = [];
  const params: string[] = [];

  if (filters.value.entity) {
    conditions.push("a.entity = ?");
    params.push(filters.value.entity);
  }

  if (filters.value.action) {
    conditions.push("a.action = ?");
    params.push(filters.value.action);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { pageSize, offset } = pagination.value;

  try {
    const [count] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total FROM audit_logs a ${where}`,
      params,
    );

    const [rows] = await pool.query<AuditRow[]>(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.metadata, a.created_at,
              a.user_id, u.name AS user_name, u.email AS user_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    response.status(200).json({
      auditLogs: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entity_id,
        metadata: parseStoredMetadata(row.metadata),
        createdAt: row.created_at,
        user:
          row.user_id === null
            ? null
            : { id: row.user_id, name: row.user_name, email: row.user_email },
      })),
      pagination: buildPaginationMeta(
        toNumber(count[0]?.total),
        pagination.value,
      ),
    });
  } catch (error) {
    console.error("Erro ao consultar a auditoria:", error);
    response
      .status(500)
      .json({ error: "Não foi possível consultar o histórico de auditoria." });
  }
});

export default router;
