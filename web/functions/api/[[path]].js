// Cloudflare Pages Function: forwards /api/* to the Render API, so the browser stays same-origin (no CORS).
// API_ORIGIN is set in the Pages project settings, e.g. https://rangefinder-api.onrender.com
export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  const target = env.API_ORIGIN.replace(/\/$/, '') + url.pathname.replace(/^\/api/, '') + url.search
  return fetch(new Request(target, request))
}
