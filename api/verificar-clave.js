
import admin from 'firebase-admin';

// --- CONFIGURACIÓN DE SEGURIDAD: LÍMITE DE INTENTOS (Rate Limiting) ---
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 5000; // Permitir 1 intento cada 5 segundos por IP.

// --- INICIALIZACIÓN DE FIREBASE ADMIN ---
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) {
    console.error('Error al inicializar Firebase Admin:', error);
  }
}
const db = admin.firestore();

// --- FUNCIÓN DE VERIFICACIÓN DE LICENCIA EN LEMON SQUEEZY ---
async function validateLicenseWithLemonSqueezy(licenseKey) {
  const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ license_key: licenseKey })
  });
  return response.json();
}

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

  const claveLimpia = clave.trim();

  try {
    // 1. Validar la clave con la API de Lemon Squeezy
    const lemonResponse = await validateLicenseWithLemonSqueezy(claveLimpia);

    if (!lemonResponse.valid) {
      console.warn(`Intento de uso de clave inválida según Lemon Squeezy: '${claveLimpia}'`);
      return res.status(404).json({ success: false, error: lemonResponse.error || 'Clave de licencia inválida.' });
    }

    // Si la clave es válida, procedemos a verificar si ya fue "reclamada" en nuestra DB
    const claveRef = db.collection('claves').doc(claveLimpia);
    const doc = await claveRef.get();

    if (doc.exists) {
      // La clave es válida pero ya fue activada aquí. Permitimos el acceso.
      // Esto permite que un usuario que ya activó la app pueda seguir usándola.
      console.log(`Clave '${claveLimpia}' verificada (ya existía en DB).`);
      rateLimitMap.delete(ip);
      return res.status(200).json({ success: true });
    } else {
      // La clave es válida y es la primera vez que se activa en nuestra app.
      // La guardamos en Firestore para marcarla como "reclamada".
      await claveRef.set({
        activada: true,
        fechaActivacion: admin.firestore.FieldValue.serverTimestamp(),
        meta: lemonResponse.meta // Guardamos metadatos de Lemon Squeezy
      });
      
      console.log(`Clave '${claveLimpia}' verificada y guardada en Firestore.`);
      rateLimitMap.delete(ip);
      return res.status(200).json({ success: true });
    }

  } catch (error) {
    console.error(`Error del servidor al verificar la clave '${claveLimpia}':`, error);
    return res.status(500).json({ success: false, error: 'Error del servidor al verificar la clave.' });
  }
}
