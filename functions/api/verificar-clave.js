
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const clave = body.clave?.trim().toUpperCase();

    if (!clave) {
      return new Response(JSON.stringify({ success: false, error: 'La clave no puede estar vacía.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const jwt = new JWT({
      email: env.FIREBASE_CLIENT_EMAIL,
      key: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/datastore'],
    });

    await jwt.authorize();

    const projectId = env.FIREBASE_PROJECT_ID;
    const databaseId = '(default)';
    const firestoreApiBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
    const documentPath = `${firestoreApiBaseUrl}/claves/${clave}`;

    const getRes = await fetch(documentPath, {
      headers: {
        'Authorization': `Bearer ${jwt.credentials.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const getResJson = await getRes.json();
    const docData = getResJson.fields;

    if (!getRes.ok || !docData) {
      return new Response(JSON.stringify({ success: false, error: 'Clave inválida.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isUsed = docData.usada && docData.usada.booleanValue === true;
    if (isUsed) {
      return new Response(JSON.stringify({ success: false, error: 'Clave ya utilizada.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const patchUrl = `${documentPath}?updateMask.fieldPaths=usada&updateMask.fieldPaths=fechaUso`;
    await fetch(patchUrl, {
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

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
