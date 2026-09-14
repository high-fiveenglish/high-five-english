// Shared CORS helper for every /api/public/* route — those are the only endpoints the
// main marketing site (a different origin/port) is allowed to call without the admin
// session cookie. proxy.ts already excludes "api/public" from the auth gate; this file
// is what actually lets the browser read the response cross-origin.
const ALLOWED_ORIGINS = (process.env.PUBLIC_SITE_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// `credentials: true`는 브라우저가 이 응답의 Set-Cookie를 실제로 저장하고, 이후
// 요청에도 쿠키를 실어 보내게 한다(예: 학생이 Vite에서 직접 로그인할 때 admin 도메인에
// 진짜 student_session 쿠키를 심어주는 student-login 라우트). Allow-Credentials는
// origin이 허용목록과 정확히 일치했을 때만 넣는다 — 매칭 안 된 요청에 대한 폴백
// 응답(ALLOWED_ORIGINS[0])에는 절대 붙이지 않는다(그 폴백은 실제 요청 origin과
// 어차피 안 맞아 브라우저가 거부하지만, 자격증명 플래그까지 얹을 이유는 없다).
export function corsHeaders(origin: string | null, opts?: { credentials?: boolean }): HeadersInit {
  const matched = !!origin && ALLOWED_ORIGINS.includes(origin);
  const allow = matched ? origin! : ALLOWED_ORIGINS[0];
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
  if (opts?.credentials && matched) headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}

export function corsOptionsResponse(request: Request, opts?: { credentials?: boolean }): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin"), opts) });
}
