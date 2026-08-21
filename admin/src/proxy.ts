import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "admin_session";
const TOKEN_PAYLOAD = "hifive-admin-session";

function expectedToken(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(TOKEN_PAYLOAD).digest("hex");
}

export function proxy(request: NextRequest) {
  const expected = expectedToken();
  const value = request.cookies.get(COOKIE_NAME)?.value;

  let authed = false;
  if (expected && value) {
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    authed = a.length === b.length && timingSafeEqual(a, b);
  }

  if (!authed) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // /login, 공개 API(/api/public/*, 메인 사이트가 인증 없이 호출), 정적 자산은
    // 제외하고 나머지 전체(관리자 화면)를 보호한다.
    "/((?!login|api/public|_next/static|_next/image|favicon.ico).*)",
  ],
};
