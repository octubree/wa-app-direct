import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Helper para inicializar Firebase solo una vez
function initializeFirebase(serviceAccount) {
  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
}

export async function onRequestPost({ request, env }) {
  // 1. Inicializar Firebase
  try {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    initializeFirebase(serviceAccount);
  } catch (e) {
    console.error('Error inicializando Firebase:', e);
    return new Response(JSON.stringify({ success: false, error: 'Configuración del servidor inválida.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 2. Obtener la clave del cuerpo de la petición
    const body = await request.json();
    const clave = body.clave?.trim().toUpperCase();

    if (!clave) {
      return new Response(JSON.stringify({ success: false, error: 'La clave no puede estar vacía.' }), {
        status: 400, // Bad Request
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Verificar la clave en Firestore
    const db = getFirestore();
    const claveRef = db.collection('claves').doc(clave);
    const doc = await claveRef.get();

    if (!doc.exists) {
      return new Response(JSON.stringify({ success: false, error: 'Clave inválida.' }), {
        status: 404, // Not Found
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = doc.data();
    if (data.usada === true) {
      return new Response(JSON.stringify({ success: false, error: 'La clave ya ha sido utilizada.' }), {
        status: 409, // Conflict
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Marcar la clave como usada
    await claveRef.update({
      usada: true,
      fechaUso: new Date().toISOString(),
    });

    // 5. Devolver éxito
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error procesando la clave:', error);
    return new Response(JSON.stringify({ success: false, error: 'Ocurrió un error en el servidor.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
