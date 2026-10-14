import { Router } from "express";
import Joi from "joi";
import Agente, { ESPECIALIDADES } from "../models/Agente.js";
import Ticket, { CAMPOS_AGENTE } from "../models/Ticket.js";
import { validarBody, validarQuery, validarId } from "../middleware/validar.js";

const router = Router();

// ───────────── Esquemas Joi ─────────────

const crearAgenteSchema = Joi.object({
  nombre: Joi.string().trim().min(3).max(100).required(),
  email: Joi.string().trim().lowercase().email().required(),
  especialidad: Joi.string().valid(...ESPECIALIDADES).required(),
  activo: Joi.boolean(),
});

const actualizarAgenteSchema = Joi.object({
  nombre: Joi.string().trim().min(3).max(100),
  email: Joi.string().trim().lowercase().email(),
  especialidad: Joi.string().valid(...ESPECIALIDADES),
  activo: Joi.boolean(),
}).min(1);

// ?activo=true llega como texto: Joi.boolean() lo convierte a true/false
const filtrosSchema = Joi.object({
  especialidad: Joi.string().valid(...ESPECIALIDADES),
  activo: Joi.boolean(),
});

// ───────────── Rutas ─────────────
// OJO con el orden: /stats debe ir ANTES de /:id, o Express tomaría "stats" como un :id.

// 7. GET /api/agentes?especialidad=&activo=
router.get("/", validarQuery(filtrosSchema), async (req, res) => {
  const filtro = {};
  if (req.filtros.especialidad) filtro.especialidad = req.filtros.especialidad;
  if (req.filtros.activo !== undefined) filtro.activo = req.filtros.activo;

  const agentes = await Agente.find(filtro).sort({ nombre: 1 });
  res.json(agentes);
});

// BONUS 21. GET /api/agentes/stats — tickets abiertos/resueltos por agente con $lookup
router.get("/stats", async (_req, res) => {
  const stats = await Agente.aggregate([
    {
      $lookup: {
        from: "tickets", // colección de tickets
        localField: "_id", // _id del agente...
        foreignField: "agenteId", // ...contra agenteId del ticket
        as: "tickets",
      },
    },
    {
      $project: {
        nombre: 1,
        email: 1,
        especialidad: 1,
        activo: 1,
        abiertos: {
          $size: { $filter: { input: "$tickets", cond: { $eq: ["$$this.estado", "abierto"] } } },
        },
        resueltos: {
          $size: { $filter: { input: "$tickets", cond: { $eq: ["$$this.estado", "resuelto"] } } },
        },
        total: { $size: "$tickets" },
      },
    },
    { $sort: { abiertos: -1, nombre: 1 } },
  ]);

  res.json(stats);
});

// 8. GET /api/agentes/:id
router.get("/:id", validarId, async (req, res) => {
  const agente = await Agente.findById(req.params.id);
  if (!agente) return res.status(404).json({ error: "Agente no encontrado" });
  res.json(agente);
});

// 14. GET /api/agentes/:id/tickets — tickets asignados a ese agente
router.get("/:id/tickets", validarId, async (req, res) => {
  const agente = await Agente.findById(req.params.id);
  if (!agente) return res.status(404).json({ error: "Agente no encontrado" });

  const tickets = await Ticket.find({ agenteId: agente._id })
    .sort({ createdAt: -1 })
    .populate("agenteId", CAMPOS_AGENTE);

  res.json(tickets);
});

// 9. POST /api/agentes — correo repetido → error 11000 → 400 en middleware/errores.js
router.post("/", validarBody(crearAgenteSchema), async (req, res) => {
  const agente = await Agente.create(req.body);
  res.status(201).json(agente);
});

// 10. PUT /api/agentes/:id — mismo manejo de correo duplicado
router.put("/:id", validarId, validarBody(actualizarAgenteSchema), async (req, res) => {
  const agente = await Agente.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!agente) return res.status(404).json({ error: "Agente no encontrado" });
  res.json(agente);
});

// 11. DELETE /api/agentes/:id — 409 si tiene tickets ABIERTOS asignados
router.delete("/:id", validarId, async (req, res) => {
  const agente = await Agente.findById(req.params.id);
  if (!agente) return res.status(404).json({ error: "Agente no encontrado" });

  const abiertos = await Ticket.countDocuments({ agenteId: agente._id, estado: "abierto" });
  if (abiertos > 0) {
    return res.status(409).json({
      error:
        `No se puede eliminar a ${agente.nombre}: tiene ${abiertos} ticket(s) abierto(s) asignado(s). ` +
        "Resuélvelos o reasígnalos a otro agente primero.",
    });
  }

  await agente.deleteOne();
  // Los tickets resueltos que tenía quedan "Sin asignar" para no dejar referencias rotas
  await Ticket.updateMany({ agenteId: agente._id }, { $set: { agenteId: null } });

  res.status(204).end();
});

export default router;
