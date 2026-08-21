// Shared CORS helper for every /api/public/* route — those are the only endpoints the
// main marketing site (a different origin/port) is allowed to call without the admin
// session cookie. proxy.ts already excludes "api/public" from the auth gate; this file
// is what actually lets the browser read the response cross-origin.
const ALLOWED_ORIGINS = (process.env.PUBLIC_SITE_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function corsOptionsResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}
