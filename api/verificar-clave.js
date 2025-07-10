import admin from 'firebase-admin';

// Inicialización de Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) {
    console.error('Error al inicializar Firebase Admin:', error);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  const { clave } = req.body;

  if (!clave || typeof clave !== 'string' || clave.trim() === '') {
    return res.status(400).json({ success: false, error: 'La clave proporcionada es inválida.' });
  }

  const claveLimpia = clave.trim().toUpperCase();

  try {
    const claveRef = db.collection('claves').doc(claveLimpia);
    const doc = await claveRef.get();

    // La única fuente de verdad es la base de datos de Firebase.
    // Si la clave existe y no ha sido usada, es válida.
    if (doc.exists && doc.data().usada === false) {
      // Marcar la clave como usada para que no pueda volver a utilizarse.
      await claveRef.update({ 
        usada: true,
        fechaUso: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`Clave '${claveLimpia}' verificada y marcada como usada.`);
      return res.status(200).json({ success: true });
    } else {
      // Si el documento no existe o si 'usada' es true.
      console.warn(`Intento de uso de clave inválida o ya usada: '${claveLimpia}'`);
      return res.status(404).json({ success: false, error: 'Clave inválida o ya utilizada.' });
    }
  } catch (error) {
    console.error(`Error del servidor al verificar la clave '${claveLimpia}':`, error);
    return res.status(500).json({ success: false, error: 'Error del servidor al verificar la clave.' });
  }
}