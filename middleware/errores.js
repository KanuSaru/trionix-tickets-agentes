import mongoose from "mongoose";

/** 404 uniforme para cualquier ruta /api que no exista. */
export function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

/**
 * Middleware de errores (4 parámetros). Express 5 envía aquí automáticamente
 * cualquier error lanzado dentro de una ruta async.
 * Todas las respuestas de error tienen la forma { error: "mensaje legible" }.
 */
// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, req, res, next) {
  // JSON mal formado en el body (lo lanza express.json())
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido" });
  }

  // Violación de índice único de MongoDB (ej: email repetido en agentes).
  // NO es un ValidationError de Mongoose: viene del motor con code 11000.
  if (err.code === 11000) {
    const campo = Object.keys(err.keyValue ?? err.keyPattern ?? {})[0];
    const valor = err.keyValue?.[campo];
    const mensaje =
      campo === "email"
        ? `Ya existe un agente registrado con el correo ${valor}`
        : `Ya existe un registro con ese valor en el campo ${campo ?? "único"}`;
    return res.status(400).json({ error: mensaje });
  }

  // Validaciones del esquema de Mongoose (minlength, enum, required...)
  if (err instanceof mongoose.Error.ValidationError) {
    const mensajes = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: mensajes.join(". ") });
  }

  // Valor que no se pudo convertir al tipo del esquema (ej: un id mal formado)
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: `Valor inválido para el campo ${err.path}` });
  }

  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
}
