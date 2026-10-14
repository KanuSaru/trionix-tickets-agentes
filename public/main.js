// Frontend de Trionix Tickets: consume la API con fetch, sin recargar la página.

// ═══════════ Estado ═══════════
let tickets = [];
let agentes = [];
let agentesActivos = []; // para el <select> de asignación
let stats = {}; // { [agenteId]: { abiertos, resueltos } }
const comentariosAbiertos = new Set(); // tickets con la sección de comentarios desplegada

// ═══════════ Cliente de la API ═══════════
class ApiError extends Error {
  constructor(mensaje, status) {
    super(mensaje);
    this.status = status;
  }
}

/** Hace la petición y devuelve el JSON. Si la API responde con error, lanza ApiError con su mensaje. */
async function api(ruta, { method = "GET", body } = {}) {
  const opciones = { method, headers: {} };
  if (body !== undefined) {
    opciones.headers["Content-Type"] = "application/json";
    opciones.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(ruta, opciones);
  } catch {
    throw new ApiError("No se pudo conectar con el servidor.", 0);
  }

  if (res.status === 204) return null;
  const datos = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(datos?.error ?? `Error inesperado (${res.status})`, res.status);
  return datos;
}

// ═══════════ Utilidades de interfaz ═══════════
const $ = (sel) => document.querySelector(sel);

const esc = (texto) =>
  String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const iniciales = (nombre) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");

const formatoFecha = (iso) =>
  new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });

const TITULOS_ERROR = {
  0: "Sin conexión",
  400: "Datos no válidos",
  404: "No encontrado",
  409: "No se puede completar",
};

/** Muestra un aviso legible (nunca el JSON crudo). */
function avisar(mensaje, tipo = "ok", titulo) {
  const div = document.createElement("div");
  div.className = `aviso ${tipo}`;
  div.innerHTML = `${titulo ? `<strong>${esc(titulo)}</strong>` : ""}${esc(mensaje)}`;
  $("#avisos").append(div);
  setTimeout(() => div.remove(), tipo === "error" ? 6500 : 3500);
}

function avisarError(err) {
  avisar(err.message, "error", TITULOS_ERROR[err.status] ?? "Error del servidor");
}

/** Ejecuta una acción deshabilitando el botón mientras tanto y mostrando errores legibles. */
async function conBoton(boton, accion) {
  if (boton) boton.disabled = true;
  try {
    await accion();
  } catch (err) {
    avisarError(err);
  } finally {
    if (boton) boton.disabled = false;
  }
}

// ═══════════ Carga de datos ═══════════
async function cargarTickets() {
  const params = new URLSearchParams();
  const q = $("#filtro-q").value.trim();
  if (q) params.set("q", q);
  if ($("#filtro-estado").value) params.set("estado", $("#filtro-estado").value);
  if ($("#filtro-prioridad").value) params.set("prioridad", $("#filtro-prioridad").value);

  tickets = await api(`/api/tickets${params.size ? `?${params}` : ""}`);
  renderTickets();
}

async function cargarAgentes() {
  const params = new URLSearchParams();
  if ($("#filtro-especialidad").value) params.set("especialidad", $("#filtro-especialidad").value);
  if ($("#filtro-activo").value) params.set("activo", $("#filtro-activo").value);

  const [lista, listaStats, todos] = await Promise.all([
    api(`/api/agentes${params.size ? `?${params}` : ""}`),
    api("/api/agentes/stats"),
    api("/api/agentes?activo=true"), // para el <select> de asignación
  ]);

  agentes = lista;
  agentesActivos = todos;
  stats = Object.fromEntries(listaStats.map((s) => [s._id, s]));
  renderAgentes();
  renderTickets(); // el <select> de asignación depende de los agentes activos
}

async function refrescarTodo() {
  await Promise.all([cargarTickets(), cargarAgentes()]);
}

// ═══════════ Render: tickets ═══════════
function renderTickets() {
  const cont = $("#lista-tickets");
  $("#resumen-tickets").textContent =
    `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} · ` +
    `${tickets.filter((t) => t.estado === "abierto").length} abierto(s)`;

  if (!tickets.length) {
    cont.innerHTML = `<div class="vacio">No hay tickets que coincidan. Crea uno con el formulario.</div>`;
    return;
  }
  cont.innerHTML = tickets.map(tarjetaTicket).join("");
}

function tarjetaTicket(t) {
  const agenteHtml = t.agente
    ? `<span class="avatar">${esc(iniciales(t.agente.nombre))}</span>
       <span>Atiende <b>${esc(t.agente.nombre)}</b> · ${esc(t.agente.especialidad)}</span>`
    : `<span class="sin">Sin asignar</span>`;

  const opciones = agentesActivos
    .map(
      (a) =>
        `<option value="${a._id}" ${t.agente && t.agente._id === a._id ? "selected" : ""}>
          ${esc(a.nombre)} (${esc(a.especialidad)})
        </option>`
    )
    .join("");

  const comentarios = t.comentarios.length
    ? `<ul>${t.comentarios
        .map(
          (c) => `<li><div class="meta">${esc(c.autor)} · ${formatoFecha(c.fecha)}</div>${esc(c.texto)}</li>`
        )
        .join("")}</ul>`
    : `<p class="resumen">Aún no hay comentarios.</p>`;

  return `
  <article class="ticket ${t.estado}" data-id="${t._id}">
    <div class="ticket-cabecera">
      <div>
        <h3>${esc(t.asunto)}</h3>
        <p class="cliente">${esc(t.cliente)} · ${formatoFecha(t.createdAt)}</p>
      </div>
      <div class="badges">
        <span class="badge ${t.prioridad}">${t.prioridad}</span>
        <span class="badge ${t.estado}">${t.estado}</span>
      </div>
    </div>

    <div class="agente-asignado">${agenteHtml}</div>

    <details class="comentarios" ${comentariosAbiertos.has(t._id) ? "open" : ""}>
      <summary>Comentarios (${t.comentarios.length})</summary>
      ${comentarios}
      <form class="form-comentario" data-id="${t._id}">
        <input name="autor" placeholder="Autor" required minlength="2" />
        <input name="texto" placeholder="Escribe un comentario…" required minlength="3" />
        <button class="btn" type="submit">Comentar</button>
      </form>
    </details>

    <div class="acciones">
      <div class="asignar">
        <select aria-label="Agente a asignar" ${agentesActivos.length ? "" : "disabled"}>
          <option value="">${agentesActivos.length ? "Elegir agente activo…" : "No hay agentes activos"}</option>
          ${opciones}
        </select>
        <button class="btn" data-accion="asignar">Asignar</button>
      </div>
      ${
        t.estado === "abierto"
          ? `<button class="btn primario" data-accion="resolver">Marcar resuelto</button>`
          : `<button class="btn" data-accion="reabrir">Reabrir</button>`
      }
      <button class="btn peligro" data-accion="eliminar">Eliminar</button>
    </div>
  </article>`;
}

// ═══════════ Render: agentes ═══════════
function renderAgentes() {
  const cont = $("#lista-agentes");
  $("#resumen-agentes").textContent = `${agentes.length} agente${agentes.length === 1 ? "" : "s"}`;

  if (!agentes.length) {
    cont.innerHTML = `<div class="vacio">No hay agentes. Registra uno con el formulario.</div>`;
    return;
  }

  cont.innerHTML = agentes
    .map((a) => {
      const s = stats[a._id] ?? { abiertos: 0, resueltos: 0 };
      return `
      <article class="agente ${a.activo ? "" : "inactivo"}" data-id="${a._id}">
        <span class="avatar">${esc(iniciales(a.nombre))}</span>
        <div>
          <h3>${esc(a.nombre)}
            <span class="badge esp">${esc(a.especialidad)}</span>
            ${a.activo ? "" : `<span class="badge inactivo">inactivo</span>`}
          </h3>
          <p class="email">${esc(a.email)}</p>
          <p class="conteo"><b>${s.abiertos}</b> abierto(s) · <b>${s.resueltos}</b> resuelto(s)</p>
        </div>
        <div class="botones">
          <button class="btn" data-accion="ver-tickets">Ver tickets</button>
          <button class="btn" data-accion="activar">${a.activo ? "Desactivar" : "Activar"}</button>
          <button class="btn peligro" data-accion="eliminar-agente">Eliminar</button>
        </div>
      </article>`;
    })
    .join("");
}

async function mostrarTicketsDeAgente(id) {
  const agente = agentes.find((a) => a._id === id);
  const lista = await api(`/api/agentes/${id}/tickets`);
  const panel = $("#tickets-de-agente");
  panel.hidden = false;
  panel.innerHTML = `
    <div class="cabecera">
      <h2>Tickets de ${esc(agente?.nombre ?? "agente")}</h2>
      <button class="btn enlace" data-accion="cerrar-detalle">Cerrar</button>
    </div>
    ${
      lista.length
        ? `<ul>${lista
            .map(
              (t) => `<li><b>${esc(t.asunto)}</b> — ${esc(t.cliente)}
                <span class="badge ${t.prioridad}">${t.prioridad}</span>
                <span class="badge ${t.estado}">${t.estado}</span></li>`
            )
            .join("")}</ul>`
        : `<p class="resumen">No tiene tickets asignados.</p>`
    }`;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ═══════════ Eventos: formularios de creación ═══════════
$("#form-ticket").addEventListener("submit", async (e) => {
  e.preventDefault(); // evita recargar la página
  const form = e.currentTarget;
  const msg = form.querySelector(".form-msg");
  const datos = Object.fromEntries(new FormData(form));

  await conBoton(form.querySelector("button"), async () => {
    msg.className = "form-msg";
    msg.textContent = "";
    try {
      const nuevo = await api("/api/tickets", { method: "POST", body: datos });
      form.reset();
      avisar(`Ticket "${nuevo.asunto}" creado.`);
      await cargarTickets();
    } catch (err) {
      msg.textContent = err.message; // error legible junto al formulario
    }
  });
});

$("#form-agente").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = form.querySelector(".form-msg");
  const fd = new FormData(form);
  const datos = {
    nombre: fd.get("nombre"),
    email: fd.get("email"),
    especialidad: fd.get("especialidad"),
    activo: fd.get("activo") === "on",
  };

  await conBoton(form.querySelector("button"), async () => {
    msg.textContent = "";
    try {
      const nuevo = await api("/api/agentes", { method: "POST", body: datos });
      form.reset();
      avisar(`Agente ${nuevo.nombre} registrado.`);
      await cargarAgentes();
    } catch (err) {
      msg.textContent = err.message; // ej: "Ya existe un agente registrado con el correo …"
    }
  });
});

// ═══════════ Eventos: acciones sobre tickets (delegación) ═══════════
$("#lista-tickets").addEventListener("click", async (e) => {
  const boton = e.target.closest("button[data-accion]");
  if (!boton) return;
  const tarjeta = boton.closest(".ticket");
  const id = tarjeta.dataset.id;
  const ticket = tickets.find((t) => t._id === id);

  await conBoton(boton, async () => {
    switch (boton.dataset.accion) {
      case "asignar": {
        const agenteId = tarjeta.querySelector(".asignar select").value;
        if (!agenteId) return avisar("Elige un agente de la lista.", "error", "Falta el agente");
        const actualizado = await api(`/api/tickets/${id}/asignar`, { method: "POST", body: { agenteId } });
        avisar(`Asignado a ${actualizado.agente.nombre}.`);
        break;
      }
      case "resolver":
        await api(`/api/tickets/${id}`, { method: "PUT", body: { estado: "resuelto" } });
        avisar("Ticket marcado como resuelto.");
        break;
      case "reabrir":
        await api(`/api/tickets/${id}`, { method: "PUT", body: { estado: "abierto" } });
        avisar("Ticket reabierto.");
        break;
      case "eliminar":
        if (!confirm(`¿Eliminar el ticket "${ticket?.asunto}"?`)) return;
        await api(`/api/tickets/${id}`, { method: "DELETE" });
        avisar("Ticket eliminado.");
        break;
    }
    await refrescarTodo();
  });
});

// Agregar comentario
$("#lista-tickets").addEventListener("submit", async (e) => {
  const form = e.target.closest(".form-comentario");
  if (!form) return;
  e.preventDefault();
  const id = form.dataset.id;
  const datos = Object.fromEntries(new FormData(form));

  await conBoton(form.querySelector("button"), async () => {
    const actualizado = await api(`/api/tickets/${id}/comentarios`, { method: "POST", body: datos });
    comentariosAbiertos.add(id);
    tickets = tickets.map((t) => (t._id === id ? actualizado : t));
    renderTickets();
    avisar("Comentario agregado.");
  });
});

// Recordar qué secciones de comentarios están abiertas entre renders
$("#lista-tickets").addEventListener(
  "toggle",
  (e) => {
    if (!e.target.matches("details.comentarios")) return;
    const id = e.target.closest(".ticket").dataset.id;
    e.target.open ? comentariosAbiertos.add(id) : comentariosAbiertos.delete(id);
  },
  true
);

// ═══════════ Eventos: acciones sobre agentes ═══════════
$("#lista-agentes").addEventListener("click", async (e) => {
  const boton = e.target.closest("button[data-accion]");
  if (!boton) return;
  const id = boton.closest(".agente").dataset.id;
  const agente = agentes.find((a) => a._id === id);

  await conBoton(boton, async () => {
    switch (boton.dataset.accion) {
      case "ver-tickets":
        await mostrarTicketsDeAgente(id);
        return;
      case "activar":
        await api(`/api/agentes/${id}`, { method: "PUT", body: { activo: !agente.activo } });
        avisar(`${agente.nombre} ahora está ${agente.activo ? "inactivo" : "activo"}.`);
        break;
      case "eliminar-agente":
        if (!confirm(`¿Eliminar al agente ${agente.nombre}?`)) return;
        await api(`/api/agentes/${id}`, { method: "DELETE" }); // puede responder 409
        avisar(`Agente ${agente.nombre} eliminado.`);
        $("#tickets-de-agente").hidden = true;
        break;
    }
    await refrescarTodo();
  });
});

$("#tickets-de-agente").addEventListener("click", (e) => {
  if (e.target.closest('[data-accion="cerrar-detalle"]')) $("#tickets-de-agente").hidden = true;
});

// ═══════════ Filtros ═══════════
let temporizadorBusqueda;
$("#filtro-q").addEventListener("input", () => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(() => cargarTickets().catch(avisarError), 300);
});
for (const sel of ["#filtro-estado", "#filtro-prioridad"]) {
  $(sel).addEventListener("change", () => cargarTickets().catch(avisarError));
}
for (const sel of ["#filtro-especialidad", "#filtro-activo"]) {
  $(sel).addEventListener("change", () => cargarAgentes().catch(avisarError));
}

// ═══════════ Pestañas ═══════════
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      const activa = t === tab;
      t.classList.toggle("activo", activa);
      t.setAttribute("aria-selected", activa);
      $(`#vista-${t.dataset.vista}`).hidden = !activa;
    });
  });
});

// ═══════════ Inicio ═══════════
refrescarTodo().catch(avisarError);
