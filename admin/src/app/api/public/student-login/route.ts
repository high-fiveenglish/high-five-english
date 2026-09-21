import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { verifyStudentLogin, createStudentSession } from "@/lib/studentAuth";
import { logAudit } from "@/lib/rbac";
import { buildStudentLoginPayload } from "@/lib/studentLoginResponse";

// 메인 마케팅 사이트(Vite)의 일반 로그인창이 실제 admin DB 학생 계정으로 직접
// 로그인할 수 있게 해주는 공개 엔드포인트. admin의 "회원으로 로그인"(sso/verify)과
// 달리 여기는 관리자가 대리 로그인시키는 게 아니라 학생 본인이 아이디/비밀번호로
// 직접 인증하는 경로라, 1회용 서명 토큰 대신 비밀번호 검증 자체를 신뢰 근거로 삼아
// 한 응답 안에서 (1) admin 도메인에 진짜 student_session 쿠키를 심고 (2) Vite가
// 자기 mock 데이터를 채우는 데 쓸 학생/수강정보를 그대로 돌려준다. 응답 형태는
// sso/verify와 동일하게 맞춰 Vite 쪽 처리 로직을 그대로 재사용할 수 있게 한다.
// credentials:true 로 CORS를 열어야 브라우저가 이 Set-Cookie를 실제로 저장한다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request, { credentials: true });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"), { credentials: true });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }

  const loginId = String((body as Record<string, unknown>).loginId ?? "").trim();
  const password = String((body as Record<string, unknown>).password ?? "");
  if (!loginId || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400, headers });
  }

  const studentId = await verifyStudentLogin(loginId, password);
  if (!studentId) {
    await logAudit({ actor: null, action: "LOGIN_FAILED", description: `마케팅 사이트 학생 로그인 실패: ${loginId}` });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401, headers });
  }

  await createStudentSession(studentId);
  const student = await prisma.student.update({ where: { id: studentId }, data: { lastLoginAt: new Date() } });
  if (student.deletedAt) {
    return NextResponse.json({ error: "student_not_found" }, { status: 404, headers });
  }
  await logAudit({
    actor: { role: "STUDENT", id: student.id, name: student.name },
    action: "LOGIN_SUCCESS",
    description: "마케팅 사이트에서 직접 로그인",
  });

  const payload = await buildStudentLoginPayload(studentId);
  return NextResponse.json(payload, { status: 200, headers });
}
