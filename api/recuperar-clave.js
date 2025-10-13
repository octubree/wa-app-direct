
import admin from 'firebase-admin';

// --- INICIALIZACIÓN DE FIREBASE ADMIN ---
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) {
    console.error('Error al inicializar Firebase Admin:', error);
  }
}

// --- CONSTANTES ---
const LEMON_API_KEY = process.env.LEMON_API_KEY;
const VARIANT_ID = '660885'; // ID de la variante de tu producto en Lemon Squeezy

// --- FUNCIÓN AUXILIAR PARA LLAMADAS A LA API DE LEMON SQUEEZY ---
async function lemonSqueezyRequest(endpoint) {
  const url = `https://api.lemonsqueezy.com/v1/${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${LEMON_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    console.error(`Error en la API de Lemon Squeezy (${url}): ${response.statusText}`);
    throw new Error('No se pudo contactar con el servicio de licencias.');
  }
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, error: 'Email requerido' });
  }

  if (!LEMON_API_KEY) {
    console.error('La variable de entorno LEMON_API_KEY no está configurada.');
    return res.status(500).json({ success: false, error: 'Configuración del servidor incompleta.' });
  }

  try {
    // 1. Buscar al cliente por email
    const customers = await lemonSqueezyRequest(`customers?filter[email]=${encodeURIComponent(email)}`);
    if (!customers.data || customers.data.length === 0) {
      return res.status(404).json({ success: false, error: 'No se encontró ninguna compra asociada a ese correo.' });
    }
    const customerId = customers.data[0].id;

    // 2. Buscar las órdenes de ese cliente
    const orders = await lemonSqueezyRequest(`orders?filter[customer_id]=${customerId}`);
    if (!orders.data || orders.data.length === 0) {
      return res.status(404).json({ success: false, error: 'No se encontraron órdenes para este cliente.' });
    }

    // 3. Encontrar la orden pagada que contenga nuestro producto
    let orderId = null;
    for (const order of orders.data) {
      if (order.attributes.status === 'paid') {
        const orderItems = await lemonSqueezyRequest(`order-items?filter[order_id]=${order.id}`);
        const foundItem = orderItems.data.find(item => item.attributes.variant_id.toString() === VARIANT_ID);
        if (foundItem) {
          orderId = order.id;
          break;
        }
      }
    }

    if (!orderId) {
      return res.status(404).json({ success: false, error: 'No se encontró una compra válida y pagada para este producto.' });
    }

    // 4. Obtener la clave de licencia de esa orden
    const licenses = await lemonSqueezyRequest(`license-keys?filter[order_id]=${orderId}`);
    if (!licenses.data || licenses.data.length === 0) {
      return res.status(404).json({ success: false, error: 'No se encontró una clave de licencia para tu compra.' });
    }

    const licenseKey = licenses.data[0].attributes.key;

    // 5. Devolver la clave de licencia original
    return res.status(200).json({ success: true, clave: licenseKey });

  } catch (error) {
    console.error('Error al recuperar la clave:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error del servidor al intentar recuperar la clave.' });
  }
}
