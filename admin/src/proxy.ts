import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_COOKIE = "admin_session";
const ADMIN_TOKEN_PAYLOAD = "hifive-admin-session";
const TEACHER_COOKIE = "teacher_session";

function expectedAdminToken(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(ADMIN_TOKEN_PAYLOAD).digest("hex");
}

function isValidAdminSession(request: NextRequest): boolean {
  const expected = expectedAdminToken();
  const value = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!expected || !value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isValidTeacherSession(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const value = request.cookies.get(TEACHER_COOKIE)?.value;
  if (!secret || !value) return false;
  const dotIndex = value.indexOf(".");
  if (dotIndex === -1) return false;
  const teacherId = value.slice(0, dotIndex);
  const sig = value.slice(dotIndex + 1);
  if (!/^\d+$/.test(teacherId)) return false;
  const expected = createHmac("sha256", secret).update(`teacher:${teacherId}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/teacher" || pathname.startsWith("/teacher/")) {
    if (pathname === "/teacher/login" || isValidTeacherSession(request)) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/teacher/login", request.url));
  }

  if (isValidAdminSession(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    // /login, 공개 API(/api/public/*, 메인 사이트가 인증 없이 호출), 정적 자산은
    // 제외하고 나머지 전체(관리자 화면 + /teacher/* 강사 화면)를 보호한다. /teacher/*는
    // 강사 세션으로, 나머지는 관리자 세션으로 각각 검사한다(proxy 함수 본문 참고).
    "/((?!login|api/public|_next/static|_next/image|favicon.ico).*)",
  ],
};
