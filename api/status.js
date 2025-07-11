export default function handler(req, res) {
  // Se añade un log para depurar el valor de la variable de entorno en Vercel.
  const isMaintenance = process.env.MAINTENANCE_MODE;
  console.log(">>>>> VALOR DE MAINTENANCE_MODE:", isMaintenance);

  if (isMaintenance === 'true') {
    // Si la variable es exactamente "true", se simula la caída.
    return res.status(503).json({
      status: 'unavailable',
      message: 'El servicio está en modo de mantenimiento.',
      timestamp: new Date().toISOString(),
      source: 'Variable de Entorno'
    });
  }

  // Si no, se devuelve el estado normal.
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
}
