import { createHmac, timingSafeEqual } from "crypto";

// 마케팅 사이트(Vite)의 "관리자/매니저로 로그인" → 실제 admin 앱으로 재로그인 없이
// 이동시키기 위한 1회용 서명 토큰. 원래는 admin-login이 크로스 오리진 fetch(credentials:
// include) 응답에서 곧바로 admin_session 쿠키를 심으려 했지만, 최신 브라우저의 서드파티
// 쿠키 차단 때문에 그 쿠키가 실제로는 저장되지 않아 "홈페이지관리" 클릭 시 다시 로그인
// 화면이 뜨는 문제가 있었다(sso.ts와 동일한 이유 — 쿠키는 admin 자신이 1st-party로 응답할
// 때만 확실히 저장된다). 이 토큰을 받은 /api/public/admin-bridge가 실제 페이지 이동
// (top-level navigation) 응답 안에서 쿠키를 심도록 한다. 짧은 만료시간(60초)을 둬서 URL이
// 유출되더라도 재사용 창을 최소화한다.
export interface AdminBridgePayload {
  adminUserId: number;
  iat: number;
}

const TOKEN_TTL_MS = 60_000;

function sign(data: string): string {
  const secret = process.env.SSO_SHARED_SECRET;
  if (!secret) throw new Error("SSO_SHARED_SECRET 환경변수가 설정되지 않았습니다.");
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function createAdminBridgeToken(adminUserId: number): string {
  const full: AdminBridgePayload = { adminUserId, iat: Date.now() };
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = sign(data);
  return `${data}.${sig}`;
}

export function verifyAdminBridgeToken(token: string): AdminBridgePayload | null {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;
  const data = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  let expected: string;
  try {
    expected = sign(data);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: AdminBridgePayload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.iat !== "number" || Date.now() - payload.iat > TOKEN_TTL_MS) return null;
  return payload;
}
