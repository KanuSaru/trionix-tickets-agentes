// Middlewares reutilizables de validación con Joi y de formato de ObjectId.

export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

// Mensajes de Joi en español
const mensajes = {
  "any.required": "El campo {{#label}} es obligatorio",
  "any.only": "El campo {{#label}} debe ser uno de: {{#valids}}",
  "string.base": "El campo {{#label}} debe ser texto",
  "string.empty": "El campo {{#label}} no puede estar vacío",
  "string.min": "El campo {{#label}} debe tener al menos {{#limit}} caracteres",
  "string.max": "El campo {{#label}} no puede superar {{#limit}} caracteres",
  "string.email": "El campo {{#label}} debe ser un correo electrónico válido",
  "boolean.base": "El campo {{#label}} debe ser true o false",
  "object.base": "El cuerpo de la petición debe ser un objeto JSON",
  "object.min": "Debes enviar al menos un campo para actualizar",
};

const opcionesJoi = {
  abortEarly: false, // reporta todos los errores, no solo el primero
  stripUnknown: true, // descarta campos que no están en el esquema (ej: "estado" al crear)
  messages: mensajes,
  errors: { wrap: { label: false, array: false } },
};

function responderError(res, error) {
  const detalles = error.details.map((d) => ({ campo: d.path.join("."), mensaje: d.message }));
  return res.status(400).json({
    error: detalles.map((d) => d.mensaje).join(". "),
    detalles,
  });
}

/** Valida req.body contra un esquema Joi. Si es válido, reemplaza req.body por el valor limpio. */
export const validarBody = (schema) => (req, res, next) => {
  // En Express 5, req.body es undefined si no se envió JSON: lo tratamos como objeto vacío
  const { error, value } = schema.validate(req.body ?? {}, opcionesJoi);
  if (error) return responderError(res, error);
  req.body = value;
  next();
};

/** Valida los filtros de req.query. El resultado queda en req.filtros (req.query es de solo lectura en Express 5). */
export const validarQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, opcionesJoi);
  if (error) return responderError(res, error);
  req.filtros = value;
  next();
};

/** 400 si el parámetro :id no tiene formato de ObjectId (24 caracteres hexadecimales). */
export const validarId = (req, res, next) => {
  if (!OBJECT_ID_REGEX.test(req.params.id)) {
    return res
      .status(400)
      .json({ error: `El id "${req.params.id}" no tiene un formato de ObjectId válido` });
  }
  next();
};
