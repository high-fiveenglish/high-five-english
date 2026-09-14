import { createHmac, timingSafeEqual } from "crypto";

// 관리자 "회원으로 로그인" → 메인 마케팅 사이트(Vite, 별도 origin·별도 mock 계정 체계)로
// 실제 이동시키기 위한 1회용 서명 토큰. 학생 세션 쿠키(studentAuth.ts)와는 별개다 — 이
// 토큰은 admin 서버에서만 서명/검증하고, 짧은 만료시간(60초)을 둬서 URL이 유출되더라도
// 재사용 창을 최소화한다. Vite 사이트는 정적 SPA라 비밀키를 절대 들고 있을 수 없으므로,
// 검증은 반드시 admin의 /api/public/sso/verify 서버 라우트에서만 일어난다.
export interface SsoPayload {
  studentId: number;
  loginId: string;
  name: string;
  englishName: string | null;
  iat: number;
}

const TOKEN_TTL_MS = 60_000;

function sign(data: string): string {
  const secret = process.env.SSO_SHARED_SECRET;
  if (!secret) throw new Error("SSO_SHARED_SECRET 환경변수가 설정되지 않았습니다.");
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function createSsoToken(payload: Omit<SsoPayload, "iat">): string {
  const full: SsoPayload = { ...payload, iat: Date.now() };
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = sign(data);
  return `${data}.${sig}`;
}

export function verifySsoToken(token: string): SsoPayload | null {
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

  let payload: SsoPayload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.iat !== "number" || Date.now() - payload.iat > TOKEN_TTL_MS) return null;
  return payload;
}
