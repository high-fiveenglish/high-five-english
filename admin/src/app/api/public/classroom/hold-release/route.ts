import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { getStudentClassroomSnapshot } from "@/lib/studentClassroom";
import { releaseHold } from "@/lib/holdApply";
import { logAudit } from "@/lib/rbac";

// 마케팅 사이트의 "홀드 해제 요청" 버튼이 부르는 공개 엔드포인트 — admin 자체 학생
// 화면(student/(dashboard)의 HoldReleaseButton)과 완전히 같은 처리(holdApply.releaseHold)를
// 거친다. 학생 셀프 연기 신청과 동일한 정책으로, 승인 대기 없이 요청 즉시 적용된다.
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
  const enrollmentId = Number((body as Record<string, unknown>).enrollmentId);
  if (!Number.isInteger(enrollmentId)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers });
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.studentId !== studentId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }

  const result = await releaseHold(enrollmentId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400, headers });
  }

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  await logAudit({
    actor: student ? { role: "STUDENT", id: student.id, name: student.name } : null,
    action: "UPDATE",
    targetType: "Enrollment",
    targetId: enrollmentId,
    description: "마케팅 사이트에서 홀드 해제 요청",
  });

  const snapshot = await getStudentClassroomSnapshot(studentId, enrollmentId);
  return NextResponse.json(snapshot, { status: 200, headers });
}
