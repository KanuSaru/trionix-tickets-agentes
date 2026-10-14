import mongoose from "mongoose";

export const ESPECIALIDADES = ["redes", "software", "hardware", "general"];

const agenteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    // unique: true crea un ÍNDICE ÚNICO en MongoDB (no es un validador de Mongoose).
    // Si se repite el correo, el motor rechaza la escritura con un error de código 11000,
    // que se traduce a 400 en middleware/errores.js.
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    especialidad: { type: String, enum: ESPECIALIDADES, required: true },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Ocultamos __v en las respuestas JSON
agenteSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

// Tercer argumento: nombre explícito de la colección en MongoDB
export default mongoose.model("Agente", agenteSchema, "agentes");
