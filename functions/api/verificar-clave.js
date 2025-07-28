import { google } from 'googleapis';

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const clave = body.clave?.trim().toUpperCase(); // Asegurarse de limpiar y poner en mayúsculas

  if (!clave) {
    return new Response(JSON.stringify({ success: false, error: 'La clave no puede estar vacía.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Asegurarse de que googleapis no intente cargar credenciales automáticamente
  process.env.GCP_PROJECT = undefined;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = undefined;

  try {
    // Autenticación JWT manual para Firestore REST
    const jwt = new google.auth.JWT(
      env.FIREBASE_CLIENT_EMAIL,
      null,
      env.FIREBASE_PRIVATE_KEY.replace(/\n/g, '\n'),
      ['https://www.googleapis.com/auth/datastore']
    );

    await jwt.authorize();

    const projectId = env.FIREBASE_PROJECT_ID;
    const databaseId = '(default)'; // Default Firestore database

    // Construir la URL de la API de Firestore manualmente
    const firestoreApiBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

    // La colección es 'claves' según tu configuración inicial
    const documentPath = `${firestoreApiBaseUrl}/claves/${clave}`;

    // Obtener el documento
    const getRes = await fetch(documentPath, {
      headers: {
        'Authorization': `Bearer ${jwt.credentials.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const getResJson = await getRes.json();

    const docData = getResJson.fields;
    const isUsed = docData && docData.usada && docData.usada.booleanValue === true;

    if (!getRes.ok || !docData) { // El documento no existe o hubo un error
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
    const patchUrl = `${documentPath}?updateMask.fieldPaths=usada&updateMask.fieldPaths=fechaUso`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${jwt.credentials.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          usada: { booleanValue: true },
          fechaUso: { timestampValue: new Date().toISOString() },
        },
      }),
    });

    if (!patchRes.ok) {
      console.error('ERROR al actualizar clave:', await patchRes.text());
      return new Response(JSON.stringify({ success: false, error: 'Error al actualizar la clave.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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