import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedUser } from "./require-auth.js";

export function requireAdmin(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  const auth = response.locals.auth as AuthenticatedUser | undefined;

  if (!auth) {
    response.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  if (auth.role !== "ADMIN") {
    response.status(403).json({
      error: "Acesso restrito a administradores.",
    });
    return;
  }

  next();
}
