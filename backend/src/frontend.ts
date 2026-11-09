import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type RequestHandler, type Router } from "express";

// Tanto backend/src quanto backend/dist ficam dois níveis abaixo da raiz do projeto.
export const DEFAULT_FRONTEND_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../frontend/dist",
);

const LONG_CACHE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

const frontendHeaders: RequestHandler = (_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
};

function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

/**
 * Entrega o site compilado pelo Vite. Os arquivos de /assets têm hash no nome e
 * ganham cache longo; o index.html é sempre revalidado, para uma publicação nova
 * aparecer na hora. Rotas da página (sem extensão) recebem o index.html; rotas
 * /api e arquivos inexistentes seguem adiante (e terminam no 404 em JSON).
 */
export function createFrontendRouter(directory: string): Router {
  const indexFile = join(directory, "index.html");

  if (!existsSync(indexFile)) {
    throw new Error(
      `Site compilado não encontrado em ${directory}. Rode "npm run build" antes de iniciar em produção.`,
    );
  }

  const router = express.Router();

  router.use((request, response, next) => {
    if (isApiPath(request.path)) return next();
    frontendHeaders(request, response, next);
  });

  router.use(
    express.static(directory, {
      index: "index.html",
      setHeaders(response, filePath) {
        const isAsset = filePath.startsWith(join(directory, "assets"));
        response.setHeader("Cache-Control", isAsset ? LONG_CACHE : REVALIDATE);
      },
    }),
  );

  router.use((request, response, next) => {
    const isPageRequest =
      (request.method === "GET" || request.method === "HEAD") &&
      !isApiPath(request.path) &&
      extname(request.path) === "";

    if (!isPageRequest) return next();

    response.setHeader("Cache-Control", REVALIDATE);
    response.sendFile(indexFile);
  });

  return router;
}
