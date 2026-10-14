import mongoose from "mongoose";

export const PRIORIDADES = ["baja", "media", "alta"];
export const ESTADOS = ["abierto", "resuelto"];

// Campos del agente que se devuelven al resolver la referencia con populate
export const CAMPOS_AGENTE = "nombre especialidad";

const ticketSchema = new mongoose.Schema(
  {
    cliente: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    asunto: { type: String, required: true, trim: true, minlength: 5, maxlength: 200 },
    prioridad: { type: String, enum: PRIORIDADES, required: true },
    estado: { type: String, enum: ESTADOS, default: "abierto" },
    // Comentarios EMBEBIDOS: viven dentro del documento del ticket
    comentarios: [
      { autor: String, texto: String, fecha: { type: Date, default: Date.now } },
    ],
    // REFERENCIA a la colección agentes. Sin `ref: "Agente"`, populate() no funcionaría.
    agenteId: { type: mongoose.Schema.Types.ObjectId, ref: "Agente", default: null },
  },
  { timestamps: true }
);

// BONUS 23 — Índice compuesto { agenteId, estado }.
// Sirve para las consultas que filtran tickets por agente (y opcionalmente por estado):
//   - GET /api/agentes/:id/tickets            → find({ agenteId })
//   - DELETE /api/agentes/:id (regla del 409) → countDocuments({ agenteId, estado: "abierto" })
//   - $lookup de GET /api/agentes/stats       → busca tickets por agenteId
ticketSchema.index({ agenteId: 1, estado: 1 });

// Al convertir a JSON: si agenteId fue resuelto con populate, lo exponemos como `agente`
// (objeto con nombre y especialidad) y dejamos `agenteId` como el id plano.
// Si no hay agente asignado, `agente` es null.
ticketSchema.set("toJSON", {
  transform(_doc, ret) {
    if (!Object.hasOwn(ret, "agenteId")) return ret; // no tocar subdocumentos (comentarios)
    const ref = ret.agenteId;

    if (ref instanceof mongoose.Types.ObjectId) {
      // Referencia sin poblar: se deja como está (todas nuestras rutas hacen populate)
    } else if (ref) {
      ret.agente = ref; // { _id, nombre, especialidad }
      ret.agenteId = ref._id;
    } else {
      ret.agente = null; // sin asignar (o el agente ya no existe)
      ret.agenteId = null;
    }

    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("Ticket", ticketSchema, "tickets");
