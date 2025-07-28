
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';

export async function onRequestPost({ request, env }) {
  try {
    const { email } = await request.json();

    const jwt = new JWT({
      email: env.FIREBASE_CLIENT_EMAIL,
      key: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/datastore'],
    });

    await jwt.authorize();

    const projectId = env.FIREBASE_PROJECT_ID;
    const databaseId = '(default)';
    const firestoreApiBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
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

    const queryRes = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt.credentials.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryBody),
    });

    const queryJson = await queryRes.json();
    const oldDoc = queryJson[0]?.document;
    const oldKeyId = oldDoc?.name?.split('/').pop();

    const nuevaClave = uuidv4().split('-')[0].toUpperCase();
    if (oldKeyId) {
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
    }

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
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
