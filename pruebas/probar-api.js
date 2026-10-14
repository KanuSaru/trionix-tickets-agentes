// Prueba automática de todos los endpoints y códigos de estado.
// Uso:  npm run probar                          (contra http://localhost:3000)
//       BASE_URL=https://tu-app.onrender.com npm run probar   (contra producción)
// Crea sus propios datos de prueba y los borra al final.

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const sufijo = Date.now();
let ok = 0;
let fallos = 0;

async function pedir(metodo, ruta, body) {
  const res = await fetch(BASE + ruta, {
    method: metodo,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const texto = await res.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { status: res.status, datos };
}

function revisar(nombre, condicion, detalle = "") {
  if (condicion) { ok++; console.log(`  ✔ ${nombre}`); }
  else { fallos++; console.log(`  ✘ ${nombre} ${detalle}`); }
}

async function esperar(nombre, metodo, ruta, body, statusEsperado, extra) {
  const r = await pedir(metodo, ruta, body);
  const pasa = r.status === statusEsperado && (!extra || extra(r.datos));
  revisar(`${metodo} ${ruta} → ${statusEsperado}  (${nombre})`, pasa,
    `\n      recibido ${r.status}: ${JSON.stringify(r.datos)?.slice(0, 200)}`);
  return r.datos;
}

const ID_FALSO = "0123456789abcdef01234567";
const tieneError = (d) => typeof d?.error === "string" && d.error.length > 0;

console.log(`\nProbando ${BASE}\n`);

try {
  console.log("Salud");
  await esperar("servidor y BD", "GET", "/api/health", undefined, 200, (d) => d.baseDeDatos === "conectada");

  // ───── Agentes ─────
  console.log("\nAgentes");
  const ana = await esperar("crear", "POST", "/api/agentes",
    { nombre: "Ana Prueba", email: `Ana.${sufijo}@Prueba.com`, especialidad: "redes" }, 201,
    (d) => d.activo === true && d.email === `ana.${sufijo}@prueba.com`);
  const beto = await esperar("crear inactivo", "POST", "/api/agentes",
    { nombre: "Beto Prueba", email: `beto.${sufijo}@prueba.com`, especialidad: "software", activo: false }, 201);

  await esperar("correo duplicado (11000)", "POST", "/api/agentes",
    { nombre: "Otra Ana", email: `ana.${sufijo}@prueba.com`, especialidad: "general" }, 400,
    (d) => tieneError(d) && d.error.includes("correo"));
  await esperar("nombre corto + especialidad inválida", "POST", "/api/agentes",
    { nombre: "Al", email: "no-es-correo", especialidad: "cocina" }, 400, tieneError);
  await esperar("PUT con correo duplicado", "PUT", `/api/agentes/${beto._id}`,
    { email: `ana.${sufijo}@prueba.com` }, 400, (d) => d.error.includes("correo"));
  await esperar("PUT válido", "PUT", `/api/agentes/${beto._id}`, { nombre: "Beto Actualizado" }, 200,
    (d) => d.nombre === "Beto Actualizado");
  await esperar("PUT inexistente", "PUT", `/api/agentes/${ID_FALSO}`, { nombre: "Nadie Nadie" }, 404, tieneError);
  await esperar("PUT body vacío", "PUT", `/api/agentes/${beto._id}`, {}, 400, tieneError);
  await esperar("listar", "GET", "/api/agentes", undefined, 200, Array.isArray);
  await esperar("filtro especialidad+activo", "GET", "/api/agentes?especialidad=software&activo=false", undefined, 200,
    (d) => d.every((a) => a.especialidad === "software" && a.activo === false));
  await esperar("filtro inválido", "GET", "/api/agentes?especialidad=cocina", undefined, 400, tieneError);
  await esperar("por id", "GET", `/api/agentes/${ana._id}`, undefined, 200, (d) => d._id === ana._id);
  await esperar("id mal formado", "GET", "/api/agentes/abc", undefined, 400, tieneError);
  await esperar("id inexistente", "GET", `/api/agentes/${ID_FALSO}`, undefined, 404, tieneError);
  await esperar("stats (bonus, no confunde con :id)", "GET", "/api/agentes/stats", undefined, 200,
    (d) => Array.isArray(d) && d.some((s) => s._id === ana._id && "abiertos" in s && "resueltos" in s));

  // ───── Tickets ─────
  console.log("\nTickets");
  const t1 = await esperar("crear (estado forzado a abierto)", "POST", "/api/tickets",
    { cliente: "Cliente Prueba", asunto: `Prueba automática ${sufijo}`, prioridad: "alta", estado: "resuelto" }, 201,
    (d) => d.estado === "abierto" && d.agente === null);
  await esperar("datos inválidos", "POST", "/api/tickets", { cliente: "X", asunto: "abc", prioridad: "urgente" }, 400, tieneError);
  await esperar("sin body", "POST", "/api/tickets", undefined, 400, tieneError);
  await esperar("JSON mal formado", "POST", "/api/tickets", "{malo", 400, tieneError);
  await esperar("listar", "GET", "/api/tickets", undefined, 200, Array.isArray);
  await esperar("filtro prioridad", "GET", "/api/tickets?prioridad=alta&estado=abierto", undefined, 200,
    (d) => d.every((t) => t.prioridad === "alta" && t.estado === "abierto"));
  await esperar("filtro inválido", "GET", "/api/tickets?estado=cerrado", undefined, 400, tieneError);
  await esperar("búsqueda ?q (bonus)", "GET", `/api/tickets?q=${sufijo}`, undefined, 200,
    (d) => d.length === 1 && d[0]._id === t1._id);
  await esperar("por id", "GET", `/api/tickets/${t1._id}`, undefined, 200, (d) => d._id === t1._id);
  await esperar("id mal formado", "GET", "/api/tickets/123", undefined, 400, tieneError);
  await esperar("id inexistente", "GET", `/api/tickets/${ID_FALSO}`, undefined, 404, tieneError);
  await esperar("PUT inválido (runValidators/Joi)", "PUT", `/api/tickets/${t1._id}`, { prioridad: "urgente" }, 400, tieneError);
  await esperar("PUT inexistente", "PUT", `/api/tickets/${ID_FALSO}`, { prioridad: "baja" }, 404, tieneError);
  await esperar("comentario", "POST", `/api/tickets/${t1._id}/comentarios`, { autor: "Ana", texto: "Revisando" }, 201,
    (d) => d.comentarios.length === 1 && d.comentarios[0].fecha);
  await esperar("comentario inválido", "POST", `/api/tickets/${t1._id}/comentarios`, { autor: "A", texto: "no" }, 400, tieneError);
  await esperar("comentario a ticket inexistente", "POST", `/api/tickets/${ID_FALSO}/comentarios`, { autor: "Ana", texto: "Hola hola" }, 404, tieneError);

  // ───── Asignación ─────
  console.log("\nAsignación");
  await esperar("agenteId mal formado", "POST", `/api/tickets/${t1._id}/asignar`, { agenteId: "xyz" }, 400, tieneError);
  await esperar("sin agenteId", "POST", `/api/tickets/${t1._id}/asignar`, {}, 400, tieneError);
  await esperar("ticket id mal formado", "POST", "/api/tickets/123/asignar", { agenteId: ana._id }, 400, tieneError);
  await esperar("ticket inexistente", "POST", `/api/tickets/${ID_FALSO}/asignar`, { agenteId: ana._id }, 404, tieneError);
  await esperar("agente inexistente", "POST", `/api/tickets/${t1._id}/asignar`, { agenteId: ID_FALSO }, 404, tieneError);
  await esperar("agente inactivo", "POST", `/api/tickets/${t1._id}/asignar`, { agenteId: beto._id }, 400,
    (d) => d.error.includes("inactivo"));
  await esperar("asignación válida", "POST", `/api/tickets/${t1._id}/asignar`, { agenteId: ana._id }, 200,
    (d) => d.agente?.nombre === "Ana Prueba" && d.agente?.especialidad === "redes" && d.agenteId === ana._id);
  await esperar("GET :id con agente resuelto (populate)", "GET", `/api/tickets/${t1._id}`, undefined, 200,
    (d) => d.agente?.nombre === "Ana Prueba");
  await esperar("GET lista con agente resuelto", "GET", `/api/tickets?q=${sufijo}`, undefined, 200,
    (d) => d[0].agente?.nombre === "Ana Prueba");
  await esperar("tickets del agente", "GET", `/api/agentes/${ana._id}/tickets`, undefined, 200,
    (d) => d.length === 1 && d[0]._id === t1._id);
  await esperar("tickets de agente inexistente", "GET", `/api/agentes/${ID_FALSO}/tickets`, undefined, 404, tieneError);
  await esperar("stats cuenta 1 abierto", "GET", "/api/agentes/stats", undefined, 200,
    (d) => d.find((s) => s._id === ana._id)?.abiertos === 1);

  // ───── Eliminación de agente con regla 409 ─────
  console.log("\nEliminar agente");
  await esperar("con ticket abierto → 409", "DELETE", `/api/agentes/${ana._id}`, undefined, 409, tieneError);
  await esperar("resolver ticket", "PUT", `/api/tickets/${t1._id}`, { estado: "resuelto" }, 200, (d) => d.estado === "resuelto");
  await esperar("ahora sí se elimina", "DELETE", `/api/agentes/${ana._id}`, undefined, 204);
  await esperar("ticket queda sin asignar", "GET", `/api/tickets/${t1._id}`, undefined, 200, (d) => d.agente === null);
  await esperar("eliminar inexistente", "DELETE", `/api/agentes/${ana._id}`, undefined, 404, tieneError);
  await esperar("eliminar inactivo", "DELETE", `/api/agentes/${beto._id}`, undefined, 204);

  // ───── Limpieza ─────
  console.log("\nLimpieza");
  await esperar("eliminar ticket", "DELETE", `/api/tickets/${t1._id}`, undefined, 204);
  await esperar("eliminar ticket inexistente", "DELETE", `/api/tickets/${t1._id}`, undefined, 404, tieneError);
  await esperar("ruta inexistente", "GET", "/api/nada", undefined, 404, tieneError);
} catch (err) {
  fallos++;
  console.error(`\n✘ No se pudo completar la prueba: ${err.message}`);
  console.error("  ¿Está corriendo el servidor? (npm run dev)");
}

console.log(`\nResultado: ${ok} correctas, ${fallos} fallidas\n`);
process.exitCode = fallos ? 1 : 0;
