import type { ErrorRequestHandler } from "express";

interface HttpLikeError {
  type?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const details = (error ?? {}) as HttpLikeError;

  if (details.type === "entity.parse.failed") {
    response
      .status(400)
      .json({ error: "O corpo da requisição não é um JSON válido." });
    return;
  }

  if (details.type === "entity.too.large") {
    response
      .status(413)
      .json({ error: "O corpo da requisição é grande demais." });
    return;
  }

  const status = Number(details.status ?? details.statusCode);

  if (Number.isInteger(status) && status >= 400 && status < 500) {
    response.status(status).json({ error: "Requisição inválida." });
    return;
  }

  console.error("Erro inesperado:", error);
  response.status(500).json({ error: "Erro interno do servidor." });
};
