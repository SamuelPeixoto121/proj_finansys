import type { Request, RequestHandler } from "express";
import {
  AttemptLimiter,
  type AttemptLimiterOptions,
} from "../domain/attempt-limiter.js";

const MINUTE_MS = 60 * 1000;

export interface LoginRateLimitOptions {
  perAccount?: Partial<AttemptLimiterOptions>;
  perIp?: Partial<AttemptLimiterOptions>;
}

function clientIp(request: Request): string {
  return request.ip ?? "desconhecido";
}

function emailFrom(request: Request): string {
  const email = request.body?.email;

  return typeof email === "string" ? email.trim().toLowerCase().slice(0, 255) : "";
}

function blockedMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

  return `Muitas tentativas. Tente novamente em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
}

export function createLoginRateLimit(
  options: LoginRateLimitOptions = {},
): RequestHandler {
  const perAccount = new AttemptLimiter({
    maxAttempts: 5,
    windowMs: 15 * MINUTE_MS,
    ...options.perAccount,
  });
  const perIp = new AttemptLimiter({
    maxAttempts: 20,
    windowMs: 15 * MINUTE_MS,
    ...options.perIp,
  });

  return (request, response, next) => {
    if (request.method !== "POST") {
      next();
      return;
    }

    const ip = clientIp(request);
    const accountKey = `${ip}|${emailFrom(request)}`;

    const account = perAccount.hit(accountKey);
    const byIp = perIp.hit(ip);

    if (!account.allowed || !byIp.allowed) {
      if (account.allowed) perAccount.release(accountKey);
      if (byIp.allowed) perIp.release(ip);

      const retryAfter = Math.max(
        account.retryAfterSeconds,
        byIp.retryAfterSeconds,
      );

      response.set("Retry-After", String(retryAfter));
      response.status(429).json({ error: blockedMessage(retryAfter) });
      return;
    }

    response.on("finish", () => {
      if (response.statusCode === 200) {
        perAccount.reset(accountKey);
        perIp.release(ip);
      } else if (response.statusCode >= 500) {
        perAccount.release(accountKey);
        perIp.release(ip);
      }
    });

    next();
  };
}

export function createRegisterRateLimit(
  options: Partial<AttemptLimiterOptions> = {},
): RequestHandler {
  const perIp = new AttemptLimiter({
    maxAttempts: 10,
    windowMs: 60 * MINUTE_MS,
    ...options,
  });

  return (request, response, next) => {
    if (request.method !== "POST") {
      next();
      return;
    }

    const ip = clientIp(request);
    const result = perIp.hit(ip);

    if (!result.allowed) {
      response.set("Retry-After", String(result.retryAfterSeconds));
      response.status(429).json({
        error: blockedMessage(result.retryAfterSeconds),
      });
      return;
    }

    response.on("finish", () => {
      if (response.statusCode >= 500) {
        perIp.release(ip);
      }
    });

    next();
  };
}

export function createPasswordChangeRateLimit(
  options: Partial<AttemptLimiterOptions> = {},
): RequestHandler {
  const perUser = new AttemptLimiter({
    maxAttempts: 5,
    windowMs: 15 * MINUTE_MS,
    ...options,
  });

  return (request, response, next) => {
    const auth = response.locals.auth as { userId?: number } | undefined;
    const key = `usuario:${auth?.userId ?? clientIp(request)}`;
    const result = perUser.hit(key);

    if (!result.allowed) {
      response.set("Retry-After", String(result.retryAfterSeconds));
      response.status(429).json({
        error: blockedMessage(result.retryAfterSeconds),
      });
      return;
    }

    response.on("finish", () => {
      if (response.statusCode === 200) {
        perUser.reset(key);
      } else if (response.statusCode >= 500) {
        perUser.release(key);
      }
    });

    next();
  };
}
