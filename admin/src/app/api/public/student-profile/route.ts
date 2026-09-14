import { NextResponse } from "next/server";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { getStudentProfileSnapshot, applyStudentProfileUpdate } from "@/lib/studentProfileUpdate";
import { logAudit } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

// 마케팅 사이트(Vite)의 "정보변경" 화면이 그 자리에서 바로 조회/저장하기 위해 쓰는
// 공개 엔드포인트 — 쿠키가 아니라 로그인 시 발급된 student API 토큰(Authorization:
// Bearer)으로 신원을 확인한다(이유는 studentApiToken.ts 참고). admin 자체 정보변경
// 페이지(student/(dashboard)/profile)와 완전히 같은 Student row·같은 저장 로직
// (lib/studentProfileUpdate)을 쓰므로, 여기서 저장한 내용은 관리자 학생관리 화면에도
// 곧바로 반영된다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const studentId = studentIdFromAuthHeader(request);
  if (!studentId) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 401, headers });
  }

  const snapshot = await getStudentProfileSnapshot(studentId);
  if (!snapshot) {
    return NextResponse.json({ error: "student_not_found" }, { status: 404, headers });
  }

  return NextResponse.json(snapshot, { status: 200, headers });
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
  const b = body as Record<string, unknown>;
  const str = (key: string) => String(b[key] ?? "").trim();

  const result = await applyStudentProfileUpdate(studentId, {
    englishName: str("englishName"),
    sex: str("sex"),
    birthDate: str("birthDate"),
    occupation: str("occupation"),
    region: str("region"),
    address: str("address"),
    mobilePhone: str("mobilePhone"),
    email: str("email"),
    preferredClassMethod: str("preferredClassMethod"),
    teamsId: str("teamsId"),
    kakaoId: str("kakaoId"),
    wechatId: str("wechatId"),
    newPassword: String(b.newPassword ?? ""),
    newPasswordConfirm: String(b.newPasswordConfirm ?? ""),
  });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400, headers });
  }

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  await logAudit({
    actor: student ? { role: "STUDENT", id: student.id, name: student.name } : null,
    action: "UPDATE",
    targetType: "Student",
    targetId: studentId,
    description: result.passwordChanged
      ? "학생 본인 정보 수정(마케팅 사이트, 비밀번호 변경 포함)"
      : "학생 본인 정보 수정(마케팅 사이트)",
  });

  const snapshot = await getStudentProfileSnapshot(studentId);
  return NextResponse.json(snapshot, { status: 200, headers });
}
