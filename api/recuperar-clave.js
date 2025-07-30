import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

// FUNCIÓN AUXILIAR PARA VERIFICAR LA SUSCRIPCIÓN EN GUMROAD
async function verificarSuscripcionGumroad(email, productPermalink) {
  const GUMROAD_API_KEY = process.env.GUMROAD_API_KEY;
  if (!GUMROAD_API_KEY) {
    console.error('La variable de entorno GUMROAD_API_KEY no está configurada.');
    return { activa: false, error: 'Configuración del servidor incompleta.' };
  }

  try {
    const url = `https://api.gumroad.com/v2/products/${productPermalink}/subscribers?email=${encodeURIComponent(email)}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GUMROAD_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      console.error(`Error de Gumroad API: ${response.statusText}`);
      return { activa: false, error: 'No se pudo contactar con el servicio de licencias.' };
    }

    const data = await response.json();

    if (data.success && data.subscribers.length > 0) {
      const suscripcion = data.subscribers[0];
      // Comprueba si la suscripción fue cancelada y si la fecha de fin ya pasó.
      const haTerminado = suscripcion.subscription_ended_at && new Date(suscripcion.subscription_ended_at) < new Date();
      const estaCancelada = suscripcion.subscription_cancelled_at && new Date(suscripcion.subscription_cancelled_at) < new Date();
      
      if (haTerminado || estaCancelada) {
        return { activa: false, message: 'Tu suscripción ha caducado.' };
      }
      // Si no ha terminado o no ha sido cancelada (o la fecha de cancelación aún no llega), está activa.
      return { activa: true };
    } else {
      // No se encontró una suscripción para ese email y producto.
      return { activa: false, message: 'No se encontró una suscripción activa para este correo.' };
    }

  } catch (error) {
    console.error('Error al verificar la suscripción en Gumroad:', error);
    return { activa: false, error: 'Error interno al verificar la suscripción.' };
  }
}


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email requerido' });

  // --- PRODUCT PERMALINK DE GUMROAD ---
  const PRODUCT_PERMALINK = 'gffgvj'; 

  try {
    // 1. Verificar si el email existe en nuestra base de datos (como antes)
    const clavesRef = db.collection('claves');
    const snapshot = await clavesRef.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      return res.status(404).json({ success: false, message: 'No se encontró ninguna compra asociada a ese correo.' });
    }

    // 2. ¡NUEVO! Verificar el estado de la suscripción en Gumroad
    const estadoSuscripcion = await verificarSuscripcionGumroad(email, PRODUCT_PERMALINK);

    if (!estadoSuscripcion.activa) {
      // Si la suscripción no está activa, denegar la recuperación.
      const message = estadoSuscripcion.message || estadoSuscripcion.error || 'Tu suscripción no se encuentra activa.';
      return res.status(403).json({ success: false, message: message });
    }

    // 3. Si la suscripción está activa, generar una nueva clave (como antes)
    const nuevaClave = uuidv4().split('-')[0].toUpperCase();
    await clavesRef.doc(nuevaClave).set({
      usada: false,
      email: email,
      recuperada: true,
      generadaEn: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ success: true, nuevaClave });

  } catch (error) {
    console.error('Error al recuperar clave:', error);
    return res.status(500).json({ success: false, message: 'Error del servidor al intentar recuperar la clave.' });
  }
}