const admin = require('firebase-admin');
const fetch = require('node-fetch'); // Asegurate que esté disponible (Vercel ya lo soporta)

// Inicializar Firebase Admin solo si aún no está iniciado
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { clave } = req.body;
  const product_id = process.env.GUMROAD_PRODUCT_ID;

  if (!clave) {
    return res.status(400).json({ error: 'Clave no proporcionada' });
  }

  // 1. Verificar con Gumroad
  const gumroadResp = await fetch('https://api.gumroad.com/v2/licenses/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      product_id,
      license_key: clave,
      increment_uses_count: 'false'
    })
  });

  const gumroad = await gumroadResp.json();

  if (!gumroad.success || !gumroad.purchase) {
    return res.status(401).json({ error: 'Clave inválida o no verificada por Gumroad' });
  }

  // 2. (Opcional futuro) revisar si está cancelada o expirada
  if (gumroad.purchase.subscription_cancelled_at || gumroad.purchase.subscription_ended_at) {
    return res.status(403).json({ error: 'Suscripción vencida o cancelada' });
  }

  const email = gumroad.purchase.email;

  // 3. Verificar en Firebase si ya fue usada o registrarla
  const ref = db.collection('claves').doc(clave);
  const docSnap = await ref.get();

  if (docSnap.exists) {
    const data = docSnap.data();
    if (data.usada) {
      return res.status(403).json({ error: 'Clave ya fue utilizada' });
    }
    // Si existe pero no está usada, la marcamos como usada
    await ref.update({
      usada: true,
      email: email,
      verificado: true,
      verificadoEn: admin.firestore.FieldValue.serverTimestamp()
    });
  } else {
    // Si no existe, la creamos y la marcamos como usada
    await ref.set({
      usada: true,
      email: email,
      verificado: true,
      verificadoEn: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return res.status(200).json({ success: true });
};
