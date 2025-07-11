export default function handler(req, res) {
  // Este endpoint es para servicios de monitoreo como UptimeRobot.
  // Responde con un estado 'ok' para confirmar que la aplicación está en línea.
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
