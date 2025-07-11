export default function handler(req, res) {
  // Comprueba si el modo de mantenimiento está activado a través de una variable de entorno.
  // Esto permite simular una caída para probar servicios de monitoreo como UptimeRobot.
  if (process.env.MAINTENANCE_MODE === 'true') {
    // Devuelve un error 503 (Servicio no disponible), que UptimeRobot interpretará como una caída.
    res.status(503).json({ 
      status: 'unavailable',
      message: 'El servicio está en modo de mantenimiento.',
      timestamp: new Date().toISOString()
    });
  } else {
    // Si no está en mantenimiento, responde con el estado normal 'ok'.
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString() 
    });
  }
}