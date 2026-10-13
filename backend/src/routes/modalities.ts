
import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { pool } from "../database.js";

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

interface InterestRateRow extends RowDataPacket {
  id: number;
  min_term: number;
  max_term: number;
  monthly_rate: string;
}

router.get("/api/v1/modalities", async (_request, response) => {
  try {
    const [modalities] = await pool.execute<ModalityRow[]>(
      `SELECT
         id,
         code,
         name,
         min_amount,
         max_amount,
         min_term,
         max_term
       FROM credit_modalities
       WHERE active = TRUE
       ORDER BY name ASC`,
    );

    response.status(200).json({
      modalities: modalities.map((modality) => ({
        code: modality.code,
        name: modality.name,
        limits: {
          minAmount: Number(modality.min_amount),
          maxAmount: Number(modality.max_amount),
          minTerm: modality.min_term,
          maxTerm: modality.max_term,
        },
      })),
    });
  } catch (error) {
    console.error("Erro ao listar modalidades:", error);

    response.status(500).json({
      error: "Não foi possível listar as modalidades de crédito.",
    });
  }
});

router.get("/api/v1/modalities/:code", async (request, response) => {
  const code = request.params.code;

  if (!code || code.trim().length === 0) {
    response.status(400).json({
      error: "Informe o código da modalidade.",
    });
    return;
  }

  try {
    const [modalities] = await pool.execute<ModalityRow[]>(
      `SELECT
         id,
         code,
         name,
         min_amount,
         max_amount,
         min_term,
         max_term
       FROM credit_modalities
       WHERE code = ? AND active = TRUE
       LIMIT 1`,
      [code.trim()],
    );

    const modality = modalities[0];

    if (!modality) {
      response.status(404).json({
        error: "Modalidade não encontrada ou inativa.",
      });
      return;
    }

    const [rates] = await pool.execute<InterestRateRow[]>(
      `SELECT id, min_term, max_term, monthly_rate
       FROM interest_rate_ranges
       WHERE modality_id = ? AND active = TRUE
       ORDER BY min_term ASC`,
      [modality.id],
    );

    response.status(200).json({
      modality: {
        code: modality.code,
        name: modality.name,
        limits: {
          minAmount: Number(modality.min_amount),
          maxAmount: Number(modality.max_amount),
          minTerm: modality.min_term,
          maxTerm: modality.max_term,
        },
        interestRateRanges: rates.map((rate) => ({
          minTerm: rate.min_term,
          maxTerm: rate.max_term,
          monthlyRatePercent: Number(rate.monthly_rate),
        })),
      },
    });
  } catch (error) {
    console.error("Erro ao consultar modalidade:", error);

    response.status(500).json({
      error: "Não foi possível consultar a modalidade de crédito.",
    });
  }
});

export default router;