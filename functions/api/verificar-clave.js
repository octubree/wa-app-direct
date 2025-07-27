import { createJwt } from '../utils/firebase-jwt.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const clave = body.clave?.trim().toUpperCase();
    if (!clave) {
      return new Response(JSON.stringify({ success: false, error: 'Clave inválida' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generar token de acceso usando la cuenta de servicio
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const token = await createJwt(serviceAccount);

    const projectId = serviceAccount.project_id;
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/claves/${clave}`;

    // Leer el documento
    const getDoc = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (getDoc.status === 404) {
      return new Response(JSON.stringify({ success: false, error: 'Clave inválida o ya usada.' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await getDoc.json();
    const fields = data.fields || {};
    const usada = fields.usada?.booleanValue === true;

    if (usada) {
      return new Response(JSON.stringify({ success: false, error: 'Clave inválida o ya usada.' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Marcar como usada
    const updateBody = {
      fields: {
        usada: { booleanValue: true },
        fechaUso: { timestampValue: new Date().toISOString() }
      }
    };

    const updateUrl = `${docUrl}?updateMask.fieldPaths=usada&updateMask.fieldPaths=fechaUso`;

    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateBody)
    });

    const updateText = await updateResponse.text();
    console.log("UPDATE STATUS:", updateResponse.status);
    console.log("UPDATE RESPONSE:", updateText);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Error en servidor.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}