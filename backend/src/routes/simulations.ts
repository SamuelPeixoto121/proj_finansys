
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../database.js";
import { calculateCredit } from "../domain/credit-calculator.js";
import {
  requireAuth,
  type AuthenticatedUser,
} from "../middleware/require-auth.js";

const router = Router();

interface ModalityRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  min_amount: string;
  max_amount: string;
  min_term: number;
  max_term: number;
}

interface RateRow extends RowDataPacket {
  id: number;
  min_term: number;
  max_term: number;
  monthly_rate: string;
}

interface SimulationHistoryRow extends RowDataPacket {
  id: number;
  modality_code: string;
  modality_name: string;
  requested_amount: string;
  term: number;
  monthly_rate: string;
  installment_amount: string;
  total_amount: string;
  total_interest: string;
  created_at: Date;
}

router.post(
  "/api/v1/simulations/calculate",
  requireAuth,
  async (request, response) => {
    const auth = response.locals.auth as AuthenticatedUser;
    const { modalityCode, amount, term } = request.body ?? {};

    if (
      typeof modalityCode !== "string" ||
      modalityCode.trim().length === 0
    ) {
      response.status(400).json({
        error: "Informe o código da modalidade.",
      });
      return;
    }

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      response.status(400).json({
        error: "O valor solicitado deve ser um número maior que zero.",
      });
      return;
    }

    if (!Number.isInteger(term) || term <= 0) {
      response.status(400).json({
        error: "O prazo deve ser um número inteiro positivo.",
      });
      return;
    }

    try {
      const [modalities] = await pool.execute<ModalityRow[]>(
        `SELECT id, code, name, min_amount, max_amount, min_term, max_term
         FROM credit_modalities
         WHERE code = ? AND active = TRUE
         LIMIT 1`,
        [modalityCode.trim()],
      );

      const modality = modalities[0];

      if (!modality) {
        response.status(404).json({
          error: "Modalidade não encontrada ou inativa.",
        });
        return;
      }

      const minAmount = Number(modality.min_amount);
      const maxAmount = Number(modality.max_amount);

      if (amount < minAmount || amount > maxAmount) {
        response.status(400).json({
          error: "O valor está fora dos limites da modalidade.",
          limits: {
            minAmount,
            maxAmount,
          },
        });
        return;
      }

      if (term < modality.min_term || term > modality.max_term) {
        response.status(400).json({
          error: "O prazo está fora dos limites da modalidade.",
          limits: {
            minTerm: modality.min_term,
            maxTerm: modality.max_term,
          },
        });
        return;
      }

      const [rates] = await pool.execute<RateRow[]>(
        `SELECT id, min_term, max_term, monthly_rate
         FROM interest_rate_ranges
         WHERE modality_id = ?
           AND active = TRUE
           AND min_term <= ?
           AND max_term >= ?
         LIMIT 2`,
        [modality.id, term, term],
      );

      if (rates.length === 0) {
        response.status(422).json({
          error: "Não existe uma taxa ativa configurada para esse prazo.",
        });
        return;
      }

      if (rates.length > 1) {
        response.status(500).json({
          error: "Existem faixas de taxas sobrepostas para esse prazo.",
        });
        return;
      }

      const monthlyRatePercent = Number(rates[0].monthly_rate);

      const calculation = calculateCredit({
        principal: amount,
        term,
        monthlyRatePercent,
      });

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO simulations (
           user_id,
           modality_id,
           requested_amount,
           term,
           monthly_rate,
           installment_amount,
           total_amount,
           total_interest
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          auth.userId,
          modality.id,
          amount,
          term,
          monthlyRatePercent,
          calculation.installmentAmount,
          calculation.totalAmount,
          calculation.totalInterest,
        ],
      );

      response.status(201).json({
        message: "Simulação calculada e salva com sucesso.",
        simulation: {
          id: result.insertId,
          modality: {
            code: modality.code,
            name: modality.name,
          },
          requestedAmount: amount,
          term,
          monthlyRatePercent,
          ...calculation,
        },
      });
    } catch (error) {
      console.error("Erro ao calcular e salvar simulação:", error);

      response.status(500).json({
        error: "Não foi possível calcular e salvar a simulação.",
      });
    }
  },
);

router.get(
  "/api/v1/simulations",
  requireAuth,
  async (_request, response) => {
    const auth = response.locals.auth as AuthenticatedUser;

    try {
      const [simulations] = await pool.execute<SimulationHistoryRow[]>(
        `SELECT
           s.id,
           m.code AS modality_code,
           m.name AS modality_name,
           s.requested_amount,
           s.term,
           s.monthly_rate,
           s.installment_amount,
           s.total_amount,
           s.total_interest,
           s.created_at
         FROM simulations AS s
         INNER JOIN credit_modalities AS m
           ON m.id = s.modality_id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT 50`,
        [auth.userId],
      );

      response.status(200).json({
        simulations: simulations.map((simulation) => ({
          id: simulation.id,
          modality: {
            code: simulation.modality_code,
            name: simulation.modality_name,
          },
          requestedAmount: Number(simulation.requested_amount),
          term: simulation.term,
          monthlyRatePercent: Number(simulation.monthly_rate),
          installmentAmount: Number(simulation.installment_amount),
          totalAmount: Number(simulation.total_amount),
          totalInterest: Number(simulation.total_interest),
          createdAt: simulation.created_at,
        })),
      });
    } catch (error) {
      console.error("Erro ao consultar histórico de simulações:", error);

      response.status(500).json({
        error: "Não foi possível consultar o histórico de simulações.",
      });
    }
  },
);

export default router;
