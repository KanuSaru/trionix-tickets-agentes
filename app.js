import "dotenv/config"; // carga .env en local (en producción las variables vienen del servidor)
import express from "express";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { conectarDB } from "./db.js";
import Ticket from "./models/Ticket.js";
import Agente from "./models/Agente.js";
import ticketsRouter from "./routes/tickets.js";
import agentesRouter from "./routes/agentes.js";
import { rutaNoEncontrada, manejarErrores } from "./middleware/errores.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // frontend estático

// Estado del servicio (útil para verificar el despliegue)
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    baseDeDatos: mongoose.connection.readyState === 1 ? "conectada" : "desconectada",
  });
});

// Rutas de la API
app.use("/api/tickets", ticketsRouter);
app.use("/api/agentes", agentesRouter);

// 404 para rutas /api inexistentes y manejo uniforme de errores (siempre al final)
app.use("/api", rutaNoEncontrada);
app.use(manejarErrores);

// Arranque: primero MongoDB, después app.listen
const PORT = process.env.PORT || 3000;

try {
  await conectarDB();

  // Asegura que los índices del esquema existan en la base (incluido el unique de email),
  // también en producción (Atlas), antes de aceptar peticiones.
  await Agente.createIndexes();
  await Ticket.createIndexes();
  console.log("✔ Índices verificados (agentes.email único, tickets.agenteId+estado)");

  app.listen(PORT, () => {
    console.log(`✔ Servidor escuchando en http://localhost:${PORT}`);
  });
} catch (err) {
  console.error("✘ No se pudo iniciar la aplicación:", err.message);
  process.exit(1);
}
