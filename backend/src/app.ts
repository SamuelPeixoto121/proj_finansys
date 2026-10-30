import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { securityHeaders } from "./middleware/security-headers.js";
import {
  createLoginRateLimit,
  createRegisterRateLimit,
} from "./middleware/auth-rate-limit.js";
import accountRouter from "./routes/account.js";
import authRouter from "./routes/auth.js";
import modalitiesRouter from "./routes/modalities.js";
import simulationsRouter from "./routes/simulations.js";
import adminModalitiesRouter from "./routes/admin-modalities.js";
import adminRateRangesRouter from "./routes/admin-rate-ranges.js";
import adminReportsRouter from "./routes/admin-reports.js";

const app = express();

app.disable("x-powered-by");

const trustProxyHops = Number(process.env.TRUST_PROXY);

if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

app.use("/api", securityHeaders);
app.use(express.json({ limit: "10kb" }));

app.get("/api/v1/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "finansys-api",
  });
});

app.use("/api/v1/auth/login", createLoginRateLimit());
app.use("/api/v1/auth/register", createRegisterRateLimit());
app.use(authRouter);
app.use(accountRouter);
app.use(modalitiesRouter);
app.use(simulationsRouter);
app.use(adminModalitiesRouter);
app.use(adminRateRangesRouter);
app.use(adminReportsRouter);

app.use((_request, response) => {
  response.status(404).json({ error: "Rota não encontrada." });
});

app.use(errorHandler);

export default app;
