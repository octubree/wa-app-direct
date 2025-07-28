import * as admin from 'firebase-admin';

let app;
let db;

export async function onRequestPost({ request, env }) {
  try {
    // Logs para verificar que Cloudflare pasa las variables
    console.log("ENV PROJECT_ID:", env.FIREBASE_PROJECT_ID ? "OK" : "MISSING");
    console.log("ENV CLIENT_EMAIL:", env.FIREBASE_CLIENT_EMAIL ? "OK" : "MISSING");
    console.log("ENV PRIVATE_KEY:", env.FIREBASE_PRIVATE_KEY ? "OK" : "MISSING");

    // Inicializar Firebase Admin si no está inicializado
    if (!app) {
      app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
      db = admin.firestore();
    }

    // Leer la clave enviada desde el frontend
    const body = await request.json();
    const clave = body.clave?.trim().toUpperCase();
    if (!clave) {
      return new Response(JSON.stringify({ success: false, error: 'Clave inválida' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Buscar la clave en Firestore
    const claveRef = db.collection('claves').doc(clave);
    const doc = await claveRef.get();

    if (doc.exists && doc.data().usada !== true) {
      await claveRef.update({
        usada: true,
        fechaUso: admin.firestore.FieldValue.serverTimestamp(),
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Clave inválida o ya usada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    console.log("ERROR:", err.message);
    return new Response(JSON.stringify({ success: false, error: 'Auth or server error' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}