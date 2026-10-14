import mongoose from "mongoose";

/**
 * Conecta a MongoDB usando la cadena de conexión de la variable de entorno MONGODB_URI.
 * - En local viene del archivo .env (cargado con dotenv en app.js / seed.js).
 * - En producción se configura en el panel del servidor (Render, Railway...), nunca en el código.
 */
export async function conectarDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "Falta la variable de entorno MONGODB_URI. Crea un archivo .env (copia .env.example) " +
        "o configúrala en el panel de tu servidor."
    );
  }

  await mongoose.connect(uri);
  console.log(`✔ MongoDB conectado → base "${mongoose.connection.name}" en ${mongoose.connection.host}`);
}
