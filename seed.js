// Datos de prueba. ¡OJO! Borra los tickets y agentes existentes en la base de MONGODB_URI.
// Uso: npm run seed
import "dotenv/config";
import mongoose from "mongoose";
import { conectarDB } from "./db.js";
import Agente from "./models/Agente.js";
import Ticket from "./models/Ticket.js";

try {
  await conectarDB();

  await Ticket.deleteMany({});
  await Agente.deleteMany({});
  await Agente.createIndexes();
  await Ticket.createIndexes();

  const [laura, carlos, sofia, andres] = await Agente.insertMany([
    { nombre: "Laura Gómez", email: "laura.gomez@trionixlabs.com", especialidad: "redes" },
    { nombre: "Carlos Martínez", email: "carlos.martinez@trionixlabs.com", especialidad: "software" },
    { nombre: "Sofía Herrera", email: "sofia.herrera@trionixlabs.com", especialidad: "hardware" },
    // Agente inactivo: sirve para probar el 400 de la asignación
    { nombre: "Andrés Pérez", email: "andres.perez@trionixlabs.com", especialidad: "general", activo: false },
  ]);

  await Ticket.insertMany([
    {
      cliente: "Distribuidora Caribe",
      asunto: "Sin conexión a internet en la sede norte",
      prioridad: "alta",
      agenteId: laura._id,
      comentarios: [{ autor: "Laura Gómez", texto: "Revisando el router principal de la sede." }],
    },
    {
      cliente: "Clínica del Prado",
      asunto: "Error al generar facturas en el sistema",
      prioridad: "alta",
      agenteId: carlos._id,
    },
    {
      cliente: "Colegio San Marcos",
      asunto: "Impresora del laboratorio no imprime",
      prioridad: "media",
      agenteId: sofia._id,
      estado: "resuelto",
      comentarios: [
        { autor: "Sofía Herrera", texto: "Se reemplazó el fusor de la impresora." },
        { autor: "Colegio San Marcos", texto: "Confirmado, ya funciona. ¡Gracias!" },
      ],
    },
    {
      cliente: "Ferretería El Puerto",
      asunto: "Solicitud de instalación de antivirus",
      prioridad: "baja",
    },
    {
      cliente: "Hotel Malecón",
      asunto: "Wifi de huéspedes muy lento en el piso 3",
      prioridad: "media",
      agenteId: laura._id,
    },
    {
      cliente: "Restaurante La Cayena",
      asunto: "Actualizar el software del punto de venta",
      prioridad: "baja",
      agenteId: carlos._id,
      estado: "resuelto",
    },
  ]);

  const [nAgentes, nTickets] = await Promise.all([Agente.countDocuments(), Ticket.countDocuments()]);
  console.log(`✔ Seed completado: ${nAgentes} agentes y ${nTickets} tickets`);
} catch (err) {
  console.error("✘ Error en el seed:", err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
