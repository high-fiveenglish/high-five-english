import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_COOKIE = "admin_session";
const TEACHER_COOKIE = "teacher_session";
const STUDENT_COOKIE = "student_session";

function isValidRoleSession(request: NextRequest, cookieName: string, rolePrefix: string): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const value = request.cookies.get(cookieName)?.value;
  if (!secret || !value) return false;
  const dotIndex = value.indexOf(".");
  if (dotIndex === -1) return false;
  const id = value.slice(0, dotIndex);
  const sig = value.slice(dotIndex + 1);
  if (!/^\d+$/.test(id)) return false;
  const expected = createHmac("sha256", secret).update(`${rolePrefix}:${id}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/teacher" || pathname.startsWith("/teacher/")) {
    if (pathname === "/teacher/login" || isValidRoleSession(request, TEACHER_COOKIE, "teacher")) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/teacher/login", request.url));
  }

  if (pathname === "/student" || pathname.startsWith("/student/")) {
    if (pathname === "/student/login" || isValidRoleSession(request, STUDENT_COOKIE, "student")) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/student/login", request.url));
  }

  if (isValidRoleSession(request, ADMIN_COOKIE, "admin")) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    // /login, 공개 API(/api/public/*, 메인 사이트가 인증 없이 호출), 정적 자산은
    // 제외하고 나머지 전체(관리자 화면 + /teacher/* 강사 화면 + /student/* 학생 화면)를
    // 보호한다. /teacher/*는 강사 세션, /student/*는 학생 세션, 나머지는 관리자 세션으로
    // 각각 검사한다(proxy 함수 본문 참고). "/teacher"/"/student"는 정확히 그 경로이거나
    // "/"로 시작하는 하위 경로일 때만 매칭 — "/teachers"·"/students" 같은 관리자 목록
    // 페이지가 접두사 일치로 오매칭되지 않도록 한다.
    "/((?!login|api/public|_next/static|_next/image|favicon.ico).*)",
  ],
};
