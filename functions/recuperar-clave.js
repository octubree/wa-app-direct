import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';

export async function onRequestPost({ request, env }) {
  console.log('ENV PROJECT_ID:', env.FIREBASE_PROJECT_ID ? 'OK' : 'MISSING');
  console.log('ENV CLIENT_EMAIL:', env.FIREBASE_CLIENT_EMAIL ? 'OK' : 'MISSING');
  console.log('ENV PRIVATE_KEY:', env.FIREBASE_PRIVATE_KEY ? 'OK' : 'MISSING');

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

    const projectId = env.FIREBASE_PROJECT_ID;
    const databaseId = '(default)'; // Default Firestore database

    // 1. Buscar la clave antigua asociada al email
    // Firestore REST API does not directly support 'where' clauses like the Admin SDK.
    // We need to use a structured query.
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:runQuery`;

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

    // Parse the query result to find the old key
    if (queryResult && queryResult.length > 0) {
      // The result is an array, and each item might be a document or a "readTime" object
      for (const item of queryResult) {
        if (item.document) {
          oldKeyDoc = item.document;
          // Extract the document ID from the name field
          const nameParts = oldKeyDoc.name.split('/');
          oldKeyId = nameParts[nameParts.length - 1];
          break; // Found the first document, we only limited to 1
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
    const newKeyDocumentPath = `projects/${projectId}/databases/${databaseId}/documents/claves/${nuevaClave}`;

    // 3. Marcar la clave antigua como "revocada"
    const oldKeyDocumentPath = `projects/${projectId}/databases/${databaseId}/documents/claves/${oldKeyId}`;
    await firestore.projects.databases.documents.patch({
      name: oldKeyDocumentPath,
      updateMask: { fieldPaths: ['revocada', 'reemplazadaPor'] },
      currentDocument: { exists: true },
      body: {
        fields: {
          revocada: { booleanValue: true },
          reemplazadaPor: { stringValue: nuevaClave },
        },
      },
    });

    // 4. Guardar la nueva clave en Firebase
    await firestore.projects.databases.documents.create({
      parent: `projects/${projectId}/databases/${databaseId}/documents`,
      collectionId: 'claves',
      documentId: nuevaClave,
      body: {
        fields: {
          usada: { booleanValue: false },
          email: { stringValue: email },
          recuperada: { booleanValue: true },
          generadaEn: { timestampValue: new Date().toISOString() },
        },
      },
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