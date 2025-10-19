
// Versión segura de verificar-clave.js
// Valida la licencia contra la API de Gumroad, incluyendo chequeos de fraude y límite de usos.

const USAGE_LIMIT = 10; // Límite generoso de activaciones por clave para evitar abuso.

// --- FUNCIÓN AUXILIAR PARA LLAMAR A LA API DE GUMROAD ---
async function validateLicenseWithGumroad(licenseKey) {
  const GUMROAD_PRODUCT_PERMALINK = process.env.GUMROAD_PRODUCT_PERMALINK;
  const GUMROAD_API_KEY = process.env.GUMROAD_API_KEY;

  if (!GUMROAD_PRODUCT_PERMALINK || !GUMROAD_API_KEY) {
    console.error('Error: Variables de entorno de Gumroad no configuradas.');
    throw new Error('Configuración del servidor incompleta.');
  }

  const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GUMROAD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      product_permalink: GUMROAD_PRODUCT_PERMALINK,
      license_key: licenseKey.trim()
    })
  });

  return response.json();
}

// --- HANDLER PRINCIPAL DE LA API ---
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  const { clave } = req.body;

  if (!clave || typeof clave !== 'string' || clave.trim() === '') {
    return res.status(400).json({ success: false, error: 'La clave proporcionada es inválida.' });
  }

  try {
    const gumroadResponse = await validateLicenseWithGumroad(clave);

    // 1. Chequeo básico de validez de la clave
    if (!gumroadResponse.success) {
      console.warn(`Intento de clave inválida: ${clave}`);
      return res.status(404).json({ success: false, error: gumroadResponse.message || 'La clave de licencia no es válida.' });
    }

    // --- VALIDACIONES DE SEGURIDAD ADICIONALES ---
    const purchase = gumroadResponse.purchase;

    // 2. Chequeo de reembolsos y contracargos (chargebacks)
    if (purchase.refunded || purchase.chargebacked) {
      console.warn(`Acceso denegado (reembolso/contracargo) para clave: ${clave.substring(0, 8)}...`);
      return res.status(403).json({ success: false, error: 'Esta licencia ya no es válida.' });
    }

    // 3. Chequeo de estado de suscripción (si aplica)
    if (purchase.subscription_cancelled_at || purchase.subscription_failed_at) {
      console.warn(`Acceso denegado (suscripción inactiva) para clave: ${clave.substring(0, 8)}...`);
      return res.status(403).json({ success: false, error: 'La suscripción de esta licencia ya no está activa.' });
    }

    // 4. Chequeo de límite de usos para evitar abuso
    if (purchase.uses >= USAGE_LIMIT) {
      console.warn(`Acceso denegado (límite de usos) para clave: ${clave.substring(0, 8)}...`);
      return res.status(429).json({ success: false, error: `Límite de ${USAGE_LIMIT} activaciones excedido.` });
    }

    // --- ACCESO CONCEDIDO ---
    console.log(`Clave verificada exitosamente (usos: ${purchase.uses + 1}/${USAGE_LIMIT}): ${clave.substring(0, 8)}...`);
    return res.status(200).json({ success: true, message: 'Clave válida.' });

  } catch (error) {
    console.error(`Error del servidor al verificar clave:`, error);
    return res.status(500).json({ success: false, error: 'Error del servidor al contactar el servicio de licencias.' });
  }
}
