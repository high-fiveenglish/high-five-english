import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { applyStudentRequestedLeave, getStudentClassroomSnapshot } from "@/lib/studentClassroom";
import { logAudit } from "@/lib/rbac";
import { isInt4 } from "@/lib/routeId";

// 마케팅 사이트의 "수업 연기" 버튼(RescheduleConfirmModal)이 부르는 공개 엔드포인트 —
// admin 자체 학생 화면(student/(dashboard)/sessions)의 "연기 신청"과 완전히 같은 처리
// (applyStudentRequestedLeave)를 거친다. 연기 후 최신 스냅샷을 그대로 돌려줘서,
// Vite 쪽이 새 lessons/closures를 다시 조회할 필요 없이 한 번의 응답으로 화면을 갱신할
// 수 있게 한다.
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
  const b = body as Record<string, unknown>;
  const lessonId = Number(b.lessonId);
  const reason = String(b.reason ?? "");

  // 정수가 아니거나 DB 정수(int4) 범위를 넘는 값은 Prisma까지 가면 500이 되므로 여기서 400으로 끝낸다.
  if (!isInt4(lessonId)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers });
  }

  const result = await applyStudentRequestedLeave(studentId, lessonId, reason);
  if (result.error) {
    // code: 마케팅 사이트가 안내 문구를 고를 수 있게 하는 기계가 읽는 사유(STUDENT_QUOTA_EXCEEDED, TOO_LATE, ALREADY_STARTED 등)
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400, headers });
  }

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  await logAudit({
    actor: student ? { role: "STUDENT", id: student.id, name: student.name } : null,
    action: "LEAVE_REQUESTED",
    targetType: "LeaveRequest",
    targetId: result.leaveRequestId,
    description: "마케팅 사이트에서 학생연기 신청",
  });

  const snapshot = await getStudentClassroomSnapshot(studentId);
  return NextResponse.json(snapshot, { status: 200, headers });
}
