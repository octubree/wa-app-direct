import admin from 'firebase-admin';

// --- CONFIGURACIÓN DE SEGURIDAD: LÍMITE DE INTENTOS (Rate Limiting) ---
// Mapa en memoria para rastrear los intentos por IP. Se reinicia con la función.
const rateLimitMap = new Map();
// Límite: Permitir 1 intento cada 5 segundos por IP.
const RATE_LIMIT_WINDOW_MS = 5000; 

// Inicialización de Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) {
    console.error('Error al inicializar Firebase Admin:', error);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  // --- APLICACIÓN DEL LÍMITE DE INTENTOS ---
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const now = Date.now();
  const lastAttempt = rateLimitMap.get(ip);

  if (lastAttempt && (now - lastAttempt) < RATE_LIMIT_WINDOW_MS) {
    console.warn(`Rate limit excedido para la IP: ${ip}`);
    return res.status(429).json({ success: false, error: 'Demasiados intentos. Por favor, espera unos segundos.' });
  }
  rateLimitMap.set(ip, now);

  // --- LÓGICA DE VERIFICACIÓN DE CLAVE ---
  const { clave } = req.body;

  if (!clave || typeof clave !== 'string' || clave.trim() === '') {
    return res.status(400).json({ success: false, error: 'La clave proporcionada es inválida.' });
  }

  const claveLimpia = clave.trim().toUpperCase();

  try {
    const claveRef = db.collection('claves').doc(claveLimpia);
    const doc = await claveRef.get();

    if (doc.exists && doc.data().usada !== true) {
      await claveRef.update({ 
        usada: true,
        fechaUso: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`Clave '${claveLimpia}' verificada y marcada como usada.`);
      // Limpiar el registro de intentos para esta IP tras un éxito
      rateLimitMap.delete(ip);
      return res.status(200).json({ success: true });
    } else {
      console.warn(`Intento de uso de clave inválida o ya usada: '${claveLimpia}'`);
      return res.status(404).json({ success: false, error: 'Clave inválida o ya utilizada.' });
    }
  } catch (error) {
    console.error(`Error del servidor al verificar la clave '${claveLimpia}':`, error);
    return res.status(500).json({ success: false, error: 'Error del servidor al verificar la clave.' });
  }
}