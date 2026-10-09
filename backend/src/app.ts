import express from "express";
import simulationsRouter from "./routes/simulations.js";

const app = express();

app.use(express.json());

app.get("/api/v1/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "finansys-api",
  });
});

app.use(simulationsRouter);

export default app;