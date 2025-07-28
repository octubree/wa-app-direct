import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';

export async function onRequestPost({ request, env }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  const { email } = body;

  if (!email) {
    return new Response(JSON.stringify({ success: false, message: 'Email requerido' }), {
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
      env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/datastore']
    );

    await jwt.authorize();

    const projectId = env.FIREBASE_PROJECT_ID;
    const databaseId = '(default)'; // Default Firestore database
    const firestoreApiBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

    // 1. Buscar la clave antigua asociada al email
    const queryUrl = `${firestoreApiBaseUrl}:runQuery`;

    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: 'claves' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'email' },
            op: 'EQUAL',
            value: { stringValue: email },
          },
        },
        limit: 1,
      },
    };

    const queryResponse = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt.credentials.access_token}`,
      },
      body: JSON.stringify(queryBody),
    });

    const queryResult = await queryResponse.json();

    let oldKeyDoc = null;
    let oldKeyId = null;

    if (queryResult && queryResult.length > 0) {
      for (const item of queryResult) {
        if (item.document) {
          oldKeyDoc = item.document;
          const nameParts = oldKeyDoc.name.split('/');
          oldKeyId = nameParts[nameParts.length - 1];
          break;
        }
      }
    }

    if (!oldKeyDoc) {
      return new Response(JSON.stringify({ success: false, message: 'No se encontró ninguna compra asociada a ese correo.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Generar una nueva clave única
    const nuevaClave = uuidv4().split('-')[0].toUpperCase();

    // 3. Marcar la clave antigua como "revocada"
    const oldKeyDocumentPath = `${firestoreApiBaseUrl}/claves/${oldKeyId}`;
    const patchOldKeyUrl = `${oldKeyDocumentPath}?updateMask.fieldPaths=revocada&updateMask.fieldPaths=reemplazadaPor`;

    await fetch(patchOldKeyUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${jwt.credentials.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          revocada: { booleanValue: true },
          reemplazadaPor: { stringValue: nuevaClave },
        },
      }),
    });

    // 4. Guardar la nueva clave en Firebase
    const createNewUrl = `${firestoreApiBaseUrl}/claves?documentId=${nuevaClave}`;
    await fetch(createNewUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt.credentials.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          usada: { booleanValue: false },
          email: { stringValue: email },
          recuperada: { booleanValue: true },
          generadaEn: { timestampValue: new Date().toISOString() },
        },
      }),
    });

    return new Response(JSON.stringify({ success: true, nuevaClave }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('ERROR al recuperar clave:', error.message);
    return new Response(JSON.stringify({ success: false, message: 'Error del servidor al intentar recuperar la clave.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}