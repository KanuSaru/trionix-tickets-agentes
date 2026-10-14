# Trionix Tickets — Sistema de soporte con agentes

**Estudiante:** Erick Fabián Donado Fonseca
**Asignatura:** Desarrollo Web Backend · Node.js — Parcial segundo corte
**Docente:** Rafael Pérez Meriño

Aplicación para gestionar los tickets de soporte técnico de Trionix Labs y los agentes que los atienden.
Una API REST en **Express** (validada con **Joi**) guarda los datos en **MongoDB** con **Mongoose** en dos
colecciones relacionadas: `tickets` y `agentes`. Cada ticket puede tener un agente asignado (referencia
`ObjectId`), que la API devuelve ya resuelto con `populate`. Un frontend estático en HTML/CSS/JS consume la API
con `fetch` sin recargar la página.

## 🌐 URL pública

**https://trionix-tickets-kanusaru.onrender.com**

## Tecnologías

Node.js (≥ 20) · Express 5 · Joi · MongoDB Atlas + Mongoose · HTML/CSS/JS · dotenv

## Correrlo localmente

```bash
git clone <url-del-repo>
cd trionix-tickets-agentes
npm install
cp .env.example .env        # y pon tu MONGODB_URI (local o Atlas)
npm run seed                # (opcional) carga 4 agentes y 6 tickets de prueba — BORRA los datos existentes
npm run dev                 # http://localhost:3000
```

Con el servidor corriendo, en otra terminal:

```bash
npm run probar                                         # prueba todos los endpoints contra localhost
BASE_URL=https://tu-app.onrender.com npm run probar    # lo mismo contra producción
```

El script crea sus propios datos, verifica cada código de estado (200/201/204/400/404/409) y los borra al final.

## Variables de entorno

| Variable      | Obligatoria | Descripción                                                                 |
|---------------|-------------|-----------------------------------------------------------------------------|
| `MONGODB_URI` | Sí          | Cadena de conexión a MongoDB. En producción, la de MongoDB Atlas (`mongodb+srv://…/trionix`). |
| `PORT`        | No          | Puerto HTTP. Por defecto `3000`; Render/Railway lo asignan solos.           |

Los valores reales van en `.env` (local) o en el panel del servidor (producción). `.env` y `node_modules/` están en `.gitignore`.

## Estructura

```
├── public/            index.html, styles.css, main.js (frontend)
├── models/            Ticket.js, Agente.js (esquemas de Mongoose)
├── routes/            tickets.js, agentes.js (rutas + esquemas Joi)
├── middleware/        validar.js (Joi y ObjectId), errores.js (manejo uniforme de errores)
├── pruebas/           probar-api.js (prueba automática de la API)
├── db.js              conexión a MongoDB
├── seed.js            datos de prueba
└── app.js             arranque de Express
```

## Endpoints

Todos los errores responden con el mismo formato: `{ "error": "mensaje legible" }`.

### Tickets

| Método | Ruta | Respuestas |
|---|---|---|
| GET | `/api/tickets?estado=&prioridad=&q=` | 200 (con `agente` resuelto) · 400 filtro inválido |
| GET | `/api/tickets/:id` | 200 · 400 id mal formado · 404 |
| POST | `/api/tickets` | 201 (estado siempre `abierto`) · 400 |
| PUT | `/api/tickets/:id` | 200 · 400 · 404 |
| DELETE | `/api/tickets/:id` | 204 · 400 · 404 |
| POST | `/api/tickets/:id/comentarios` | 201 · 400 · 404 |
| POST | `/api/tickets/:id/asignar` `{ "agenteId": "…" }` | 200 · 400 (ids mal formados o agente inactivo) · 404 (ticket o agente no existe) |

### Agentes

| Método | Ruta | Respuestas |
|---|---|---|
| GET | `/api/agentes?especialidad=&activo=` | 200 · 400 filtro inválido |
| GET | `/api/agentes/stats` | 200 (bonus) |
| GET | `/api/agentes/:id` | 200 · 400 · 404 |
| GET | `/api/agentes/:id/tickets` | 200 · 400 · 404 |
| POST | `/api/agentes` | 201 · 400 (Joi o correo duplicado) |
| PUT | `/api/agentes/:id` | 200 · 400 (Joi o correo duplicado) · 404 |
| DELETE | `/api/agentes/:id` | 204 · 404 · **409** si tiene tickets abiertos asignados |

Ejemplo de ticket con el agente resuelto:

```json
{
  "_id": "6710…",
  "cliente": "Distribuidora Caribe",
  "asunto": "Sin conexión a internet en la sede norte",
  "prioridad": "alta",
  "estado": "abierto",
  "comentarios": [{ "autor": "Laura Gómez", "texto": "Revisando el router…", "fecha": "…" }],
  "agenteId": "670f…",
  "agente": { "_id": "670f…", "nombre": "Laura Gómez", "especialidad": "redes" },
  "createdAt": "…",
  "updatedAt": "…"
}
```

## Decisiones de diseño

- **Correo duplicado:** `unique: true` crea un índice único en MongoDB. Al repetirse, el motor lanza un error
  `code: 11000` (no un `ValidationError`); `middleware/errores.js` lo captura y responde **400** con un mensaje legible.
- **Agente resuelto:** las rutas usan `.populate("agenteId", "nombre especialidad")`. La transformación `toJSON`
  del modelo `Ticket` expone ese objeto como `agente` (o `null` si no hay asignado) y deja `agenteId` como id plano.
- **Orden de rutas:** `/api/agentes/stats` está declarada antes de `/api/agentes/:id`.
- **Eliminar agente:** si tiene tickets *abiertos* → 409. Si solo tiene tickets resueltos, se elimina y esos
  tickets quedan sin asignar (para no dejar referencias rotas).
- **Índices en producción:** al arrancar, `app.js` ejecuta `createIndexes()` en ambos modelos antes de `app.listen`,
  así el índice único de `email` existe también en Atlas.

## Bonus implementados

1. **`GET /api/agentes/stats`** — agregación con `$lookup` de `agentes` → `tickets` que cuenta, por agente, los tickets `abierto` y `resuelto`.
2. **`GET /api/tickets?q=texto`** — búsqueda con `$regex` (insensible a mayúsculas, con el texto escapado) sobre `asunto` y `cliente`.
3. **Índice compuesto `{ agenteId: 1, estado: 1 }` en `tickets`** — siguiendo el criterio de indexar lo que se
   filtra con frecuencia: lo usan `GET /api/agentes/:id/tickets` (filtra por `agenteId`), la regla del 409 al
   eliminar un agente (`{ agenteId, estado: "abierto" }`, que usa ambos campos del índice) y el `$lookup` de las
   estadísticas (busca tickets por `agenteId`). Como `agenteId` es el primer campo, el índice sirve tanto para
   consultas por agente como por agente + estado.

## Despliegue

- **Base de datos:** MongoDB Atlas (cluster M0 gratuito), base `trionix`.
- **Servidor:** Railway (servicio desplegado desde este repositorio): build `npm install`, start `npm start`.
- **Variables:** `MONGODB_URI` configurada en *Environment* del panel de Railway; nunca en el código.

Verificación rápida en producción: `GET /api/health` → `{ "ok": true, "baseDeDatos": "conectada" }`.
