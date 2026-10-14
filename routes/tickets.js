import { Router } from "express";
import Joi from "joi";
import Ticket, { PRIORIDADES, ESTADOS, CAMPOS_AGENTE } from "../models/Ticket.js";
import Agente from "../models/Agente.js";
import { validarBody, validarQuery, validarId, OBJECT_ID_REGEX } from "../middleware/validar.js";

const router = Router();

// ───────────── Esquemas Joi ─────────────

// Al crear NO se acepta "estado" ni "agenteId": stripUnknown los descarta.
const crearTicketSchema = Joi.object({
  cliente: Joi.string().trim().min(2).max(100).required(),
  asunto: Joi.string().trim().min(5).max(200).required(),
  prioridad: Joi.string().valid(...PRIORIDADES).required(),
});

// Actualización parcial: todos opcionales, pero al menos uno.
// El agente se cambia solo con POST /:id/asignar.
const actualizarTicketSchema = Joi.object({
  cliente: Joi.string().trim().min(2).max(100),
  asunto: Joi.string().trim().min(5).max(200),
  prioridad: Joi.string().valid(...PRIORIDADES),
  estado: Joi.string().valid(...ESTADOS),
}).min(1);

const comentarioSchema = Joi.object({
  autor: Joi.string().trim().min(2).max(100).required(),
  texto: Joi.string().trim().min(3).max(1000).required(),
});

const asignarSchema = Joi.object({
  agenteId: Joi.string()
    .pattern(OBJECT_ID_REGEX)
    .required()
    .messages({ "string.pattern.base": "El agenteId no tiene un formato de ObjectId válido" }),
});

const filtrosSchema = Joi.object({
  estado: Joi.string().valid(...ESTADOS),
  prioridad: Joi.string().valid(...PRIORIDADES),
  q: Joi.string().trim().max(100).allow(""), // BONUS 22: búsqueda de texto
});

// Escapa caracteres especiales para que el texto del usuario se busque literal en el $regex
const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ───────────── Rutas ─────────────

// 1. GET /api/tickets?estado=&prioridad=&q=
router.get("/", validarQuery(filtrosSchema), async (req, res) => {
  const { estado, prioridad, q } = req.filtros;
  const filtro = {};
  if (estado) filtro.estado = estado;
  if (prioridad) filtro.prioridad = prioridad;
  if (q) {
    const regex = new RegExp(escaparRegex(q), "i");
    filtro.$or = [{ asunto: regex }, { cliente: regex }];
  }

  const tickets = await Ticket.find(filtro)
    .sort({ createdAt: -1 })
    .populate("agenteId", CAMPOS_AGENTE); // 13. agente resuelto, no solo el id

  res.json(tickets);
});

// 2. GET /api/tickets/:id
router.get("/:id", validarId, async (req, res) => {
  const ticket = await Ticket.findById(req.params.id).populate("agenteId", CAMPOS_AGENTE);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });
  res.json(ticket);
});

// 3. POST /api/tickets — el estado siempre nace "abierto"
router.post("/", validarBody(crearTicketSchema), async (req, res) => {
  const ticket = await Ticket.create({ ...req.body, estado: "abierto", agenteId: null });
  res.status(201).json(ticket);
});

// 4. PUT /api/tickets/:id
router.put("/:id", validarId, validarBody(actualizarTicketSchema), async (req, res) => {
  const ticket = await Ticket.findByIdAndUpdate(req.params.id, req.body, {
    new: true, // devuelve el documento ya actualizado
    runValidators: true, // aplica las validaciones del esquema también al actualizar
  }).populate("agenteId", CAMPOS_AGENTE);

  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });
  res.json(ticket);
});

// 5. DELETE /api/tickets/:id
router.delete("/:id", validarId, async (req, res) => {
  const ticket = await Ticket.findByIdAndDelete(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });
  res.status(204).end();
});

// 6. POST /api/tickets/:id/comentarios — comentario embebido
router.post("/:id/comentarios", validarId, validarBody(comentarioSchema), async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });

  ticket.comentarios.push({ autor: req.body.autor, texto: req.body.texto }); // fecha: default Date.now
  await ticket.save();
  await ticket.populate("agenteId", CAMPOS_AGENTE);

  res.status(201).json(ticket);
});

// 12. POST /api/tickets/:id/asignar — { "agenteId": "<id>" }
router.post("/:id/asignar", validarId, validarBody(asignarSchema), async (req, res) => {
  // (validarId y asignarSchema ya garantizaron el formato ObjectId de ambos ids → 400)

  // a) El ticket debe existir
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });

  // b) El agente debe existir...
  const agente = await Agente.findById(req.body.agenteId);
  if (!agente) {
    return res.status(404).json({ error: "El agente indicado no existe" });
  }

  // c) ...y estar activo
  if (!agente.activo) {
    return res.status(400).json({
      error: `El agente ${agente.nombre} está inactivo y no puede recibir tickets`,
    });
  }

  // d) Todo válido: se escribe la asignación
  ticket.agenteId = agente._id;
  await ticket.save();
  await ticket.populate("agenteId", CAMPOS_AGENTE);

  res.json(ticket); // 200 con el agente ya resuelto
});

export default router;
