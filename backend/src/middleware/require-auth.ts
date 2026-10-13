
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedUser {
  userId: number;
  role: "USER" | "ADMIN";
}

export interface AuthenticatedLocals {
  auth: AuthenticatedUser;
}

export function requireAuth(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  const authorization = _request.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    response.status(401).json({
      error: "Token de autenticação não informado.",
    });
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    response.status(401).json({
      error: "Token de autenticação inválido.",
    });
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret || jwtSecret.length < 32) {
    console.error("JWT_SECRET ausente ou muito curta.");

    response.status(500).json({
      error: "A autenticação não está configurada corretamente.",
    });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
    });

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      !/^[1-9]\d*$/.test(payload.sub) ||
      (payload.role !== "USER" && payload.role !== "ADMIN")
    ) {
      response.status(401).json({
        error: "Token de autenticação inválido.",
      });
      return;
    }

    response.locals.auth = {
      userId: Number(payload.sub),
      role: payload.role,
    } satisfies AuthenticatedUser;

    next();
  } catch {
    response.status(401).json({
      error: "Token inválido ou expirado.",
    });
  }
}