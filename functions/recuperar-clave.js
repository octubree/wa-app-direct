
import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email requerido' });

  try {
    const clavesRef = db.collection('claves');
    // Busca si existe alguna clave comprada con ese email.
    const snapshot = await clavesRef.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      return res.status(404).json({ success: false, message: 'No se encontró ninguna compra asociada a ese correo.' });
    }

    // Generar una nueva clave única
    const nuevaClave = uuidv4().split('-')[0].toUpperCase();
    await clavesRef.doc(nuevaClave).set({
      usada: false,
      email: email, // Asocia la nueva clave al mismo email
      recuperada: true,
      generadaEn: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ success: true, nuevaClave });
  } catch (error) {
    console.error('Error al recuperar clave:', error);
    return res.status(500).json({ success: false, message: 'Error del servidor al intentar recuperar la clave.' });
  }
}
