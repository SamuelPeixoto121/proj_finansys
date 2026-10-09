import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { pool } from "../database.js";
import { calculateCredit } from "../domain/credit-calculator.js";

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

router.post("/api/v1/simulations/calculate", async (request, response) => {
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

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
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

    if (
      amount < Number(modality.min_amount) ||
      amount > Number(modality.max_amount)
    ) {
      response.status(400).json({
        error: "O valor está fora dos limites da modalidade.",
        limits: {
          minAmount: Number(modality.min_amount),
          maxAmount: Number(modality.max_amount),
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

    response.json({
      modality: {
        code: modality.code,
        name: modality.name,
      },
      requestedAmount: amount,
      term,
      monthlyRatePercent,
      ...calculation,
    });
  } catch (error) {
    console.error("Erro ao calcular simulação:", error);

    response.status(500).json({
      error: "Não foi possível calcular a simulação.",
    });
  }
});

export default router;