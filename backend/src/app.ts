import express from "express";
import {
  createLoginRateLimit,
  createRegisterRateLimit,
} from "./middleware/auth-rate-limit.js";
import authRouter from "./routes/auth.js";
import modalitiesRouter from "./routes/modalities.js";
import simulationsRouter from "./routes/simulations.js";
import adminModalitiesRouter from "./routes/admin-modalities.js";
import adminRateRangesRouter from "./routes/admin-rate-ranges.js";
import adminReportsRouter from "./routes/admin-reports.js";

const app = express();

const trustProxyHops = Number(process.env.TRUST_PROXY);

if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

app.use(express.json());

app.get("/api/v1/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "finansys-api",
  });
});

app.use("/api/v1/auth/login", createLoginRateLimit());
app.use("/api/v1/auth/register", createRegisterRateLimit());
app.use(authRouter);
app.use(modalitiesRouter);
app.use(simulationsRouter);
app.use(adminModalitiesRouter);
app.use(adminRateRangesRouter);
app.use(adminReportsRouter);

app.use((_request, response) => {
  response.status(404).json({ error: "Rota não encontrada." });
});

export default app;
