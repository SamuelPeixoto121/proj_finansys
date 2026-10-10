import express from "express";
import authRouter from "./routes/auth.js";
import simulationsRouter from "./routes/simulations.js";

const app = express();

app.use(express.json());

app.get("/api/v1/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "finansys-api",
  });
});

app.use(authRouter);
app.use(simulationsRouter);

export default app;