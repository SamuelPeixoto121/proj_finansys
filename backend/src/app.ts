import express from "express";

const app = express();

app.get("/api/v1/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "finansys-api",
  });
});

export default app;
