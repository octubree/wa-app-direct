import { google } from 'googleapis';

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const clave = body.clave?.trim().toUpperCase(); // Asegurarse de limpiar y poner en mayúsculas

  console.log('ENV PROJECT_ID:', env.FIREBASE_PROJECT_ID ? 'OK' : 'MISSING');
  console.log('ENV CLIENT_EMAIL:', env.FIREBASE_CLIENT_EMAIL ? 'OK' : 'MISSING');
  console.log('ENV PRIVATE_KEY:', env.FIREBASE_PRIVATE_KEY ? 'OK' : 'MISSING');

  if (!clave) {
    return new Response(JSON.stringify({ success: false, error: 'La clave no puede estar vacía.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Autenticación JWT manual para Firestore REST
    const jwt = new google.auth.JWT(
      env.FIREBASE_CLIENT_EMAIL,
      null,
      env.FIREBASE_PRIVATE_KEY.replace(/\n/g, '\n'),
      ['https://www.googleapis.com/auth/datastore']
    );

    await jwt.authorize();

    const firestore = google.firestore({
      version: 'v1',
      auth: jwt,
    });

    // La colección es 'claves' según tu configuración inicial
    const documentPath = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/claves/${clave}`;

    // Obtener el documento
    const getRes = await firestore.projects.databases.documents.get({ // Changed from firestore.projects.databases.documents.get
      name: documentPath,
    });

    const docData = getRes.data.fields;
    const isUsed = docData && docData.usada && docData.usada.booleanValue === true;

    if (!docData) { // El documento no existe
      return new Response(JSON.stringify({ success: false, error: 'Clave inválida.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (isUsed) { // La clave ya ha sido utilizada
      return new Response(JSON.stringify({ success: false, error: 'La clave ya ha sido utilizada.' }), {
        status: 409, // Conflict
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // La clave existe y no ha sido utilizada, marcarla como utilizada
    await firestore.projects.databases.documents.patch({
      name: documentPath,
      updateMask: { fieldPaths: ['usada', 'fechaUso'] },
      currentDocument: { exists: true },
      body: {
        fields: {
          usada: { booleanValue: true },
          fechaUso: { timestampValue: new Date().toISOString() },
        },
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('ERROR:', error.message); // Usar console.error para errores
    return new Response(JSON.stringify({ success: false, error: 'Ocurrió un error en el servidor.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}