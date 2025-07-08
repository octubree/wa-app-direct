const admin = require('firebase-admin');
const fetch = require('node-fetch');

// --- RATE LIMIT EN MEMORIA ---
const rateLimitMap = new Map(); // IP → [timestamps]

const RATE_LIMIT_MAX = 5; // Máximo intentos
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto

// --- FIREBASE INIT ---
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// --- FUNCIÓN ---
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
    const now = Date.now();

    const attempts = rateLimitMap.get(ip) || [];
    const recent = attempts.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

    if (recent.length >= RATE_LIMIT_MAX) {
      return res.status(429).json({ error: 'Demasiados intentos. Intenta nuevamente en un minuto.' });
    }

    recent.push(now);
    rateLimitMap.set(ip, recent);

    const { clave } = req.body;
    const product_id = process.env.GUMROAD_PRODUCT_ID;

    if (!clave) {
      return res.status(400).json({ error: 'Clave no proporcionada' });
    }

    // Verificación con Gumroad
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

    if (gumroad.purchase.subscription_cancelled_at || gumroad.purchase.subscription_ended_at) {
      return res.status(403).json({ error: 'Suscripción vencida o cancelada' });
    }

    const email = gumroad.purchase.email;
    const ref = db.collection('claves').doc(clave);
    const docSnap = await ref.get();

    if (docSnap.exists) {
      const data = docSnap.data();
      if (data.usada) {
        return res.status(403).json({ error: 'Clave ya fue utilizada' });
      }

      await ref.update({
        usada: true,
        email,
        verificado: true,
        verificadoEn: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await ref.set({
        usada: true,
        email,
        verificado: true,
        verificadoEn: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[ERROR verificar-clave]', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
