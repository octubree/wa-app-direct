export async function onRequestGet(context) {
  return new Response(JSON.stringify({
    success: true,
    message: "API funcionando en Cloudflare Workers"
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}