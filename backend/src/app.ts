
import express from "express";
import authRouter from "./routes/auth.js";
import modalitiesRouter from "./routes/modalities.js";
import simulationsRouter from "./routes/simulations.js";
import adminModalitiesRouter from "./routes/admin-modalities.js";

const app = express();

app.use(express.json());

app.get("/api/v1/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "finansys-api",
  });
});

app.use(authRouter);
app.use(modalitiesRouter);
app.use(simulationsRouter);
app.use(adminModalitiesRouter);

export default app;

