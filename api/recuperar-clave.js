
import admin from 'firebase-admin';
import { randomUUID } from 'crypto';

// --- INICIALIZACIÓN DE FIREBASE ADMIN ---
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) {
    console.error('Error al inicializar Firebase Admin:', error);
  }
}

// --- CONSTANTES ---
const GUMROAD_API_KEY = process.env.GUMROAD_API_KEY;
const GUMROAD_PRODUCT_PERMALINK = process.env.GUMROAD_PRODUCT_PERMALINK;

// --- FUNCIÓN AUXILIAR PARA LLAMADAS A LA API DE GUMROAD ---
async function gumroadRequest(endpoint) {
  const url = `https://api.gumroad.com/v2/${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GUMROAD_API_KEY}`,
      'Accept': 'application/json'
    }
  });
  if (!response.ok) {
    console.error(`Error en la API de Gumroad (${url}): ${response.statusText}`);
    throw new Error('No se pudo contactar con el servicio de licencias.');
  }
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, error: 'Email requerido' });
  }

  try {
    // 1. Validar que las variables de entorno de Gumroad estén configuradas
    if (!GUMROAD_API_KEY || !GUMROAD_PRODUCT_PERMALINK) {
      console.error('Las variables de entorno de Gumroad no están configuradas.');
      return res.status(500).json({ success: false, error: 'Configuración del servidor incompleta.' });
    }

    // 2. Consultar la API de Gumroad para verificar la compra
    const gumroadResponse = await gumroadRequest(`products/${GUMROAD_PRODUCT_PERMALINK}/subscribers?email=${encodeURIComponent(email)}`);

    // 3. Comprobar si la compra es válida y el suscriptor está activo
    if (!gumroadResponse.success || !gumroadResponse.subscriber || gumroadResponse.subscriber.subscription_ended_at) {
        return res.status(404).json({ success: false, error: 'No se encontró ninguna compra activa asociada a ese correo.' });
    }

    // 4. Generar una nueva clave de recuperación única y temporal
    const nuevaClave = randomUUID();
    const expiracion = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos desde ahora

    // 5. Guardar la nueva clave en Firestore con una fecha de expiración
    const claveRef = admin.firestore().collection('claves').doc(nuevaClave);
    await claveRef.set({
        activada: false, // Se marcará como activada cuando el usuario la use
        esRecuperacion: true,
        emailAsociado: email,
        fechaCreacion: admin.firestore.FieldValue.serverTimestamp(),
        fechaExpiracion: admin.firestore.Timestamp.fromDate(expiracion)
    });

    // 6. Devolver la nueva clave para que el usuario la use
    return res.status(200).json({ success: true, clave: nuevaClave });

  } catch (error) {
    console.error('Error al recuperar la clave:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error del servidor al intentar recuperar la clave.' });
  }
}
