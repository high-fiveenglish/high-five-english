import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { exchangeKakaoCode } from "@/lib/kakaoAuth";
import { logAudit } from "@/lib/rbac";

// 이미 아이디/비밀번호로 로그인한 학생이 "정보변경" 화면에서 본인 계정에 카카오
// 계정을 연동/해제하는 엔드포인트. student-profile route와 같은 방식(Authorization:
// Bearer student API 토큰)으로 신원을 확인한다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const studentId = studentIdFromAuthHeader(request);
  if (!studentId) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 401, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }
  const code = String((body as Record<string, unknown>).code ?? "");
  const redirectUri = String((body as Record<string, unknown>).redirectUri ?? "");
  if (!code || !redirectUri) {
    return NextResponse.json({ error: "missing_code" }, { status: 400, headers });
  }

  const exchanged = await exchangeKakaoCode(code, redirectUri);
  if ("error" in exchanged) {
    return NextResponse.json({ error: exchanged.error }, { status: 400, headers });
  }

  const existing = await prisma.student.findUnique({ where: { kakaoUserId: exchanged.kakaoUserId } });
  if (existing && existing.id !== studentId) {
    return NextResponse.json({ error: "kakao_already_linked" }, { status: 409, headers });
  }

  const student = await prisma.student.update({
    where: { id: studentId },
    data: { kakaoUserId: exchanged.kakaoUserId },
  });
  await logAudit({
    actor: { role: "STUDENT", id: student.id, name: student.name },
    action: "UPDATE",
    targetType: "Student",
    targetId: studentId,
    description: "카카오 로그인 연동",
  });

  return NextResponse.json({ ok: true }, { status: 200, headers });
}

export async function DELETE(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const studentId = studentIdFromAuthHeader(request);
  if (!studentId) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 401, headers });
  }

  const student = await prisma.student.update({
    where: { id: studentId },
    data: { kakaoUserId: null },
  });
  await logAudit({
    actor: { role: "STUDENT", id: student.id, name: student.name },
    action: "UPDATE",
    targetType: "Student",
    targetId: studentId,
    description: "카카오 로그인 연동 해제",
  });

  return NextResponse.json({ ok: true }, { status: 200, headers });
}
