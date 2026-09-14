import { NextResponse } from "next/server";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { getStudentClassroomSnapshot } from "@/lib/studentClassroom";

// 마케팅 사이트(Vite)의 "내 강의실" 화면(src/pages/ClassroomPage.tsx)이 실제 수업/휴강
// 데이터를 읽어오는 공개 엔드포인트 — student-profile API와 동일하게 로그인 시 발급된
// student API 토큰(Authorization: Bearer)으로 신원을 확인한다. 여기서 돌려주는 수업
// 상태·사유는 admin의 학생관리 > 수업관리 화면과 완전히 같은 데이터(ClassSession/
// LeaveRequest/AcademyClosure)라, 관리자가 휴강 처리하면 이 화면에도 곧바로 반영된다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const studentId = studentIdFromAuthHeader(request);
  if (!studentId) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 401, headers });
  }

  const url = new URL(request.url);
  const enrollmentIdParam = url.searchParams.get("enrollmentId");
  const enrollmentId = enrollmentIdParam ? Number(enrollmentIdParam) : undefined;

  const snapshot = await getStudentClassroomSnapshot(studentId, enrollmentId);
  if (!snapshot) {
    return NextResponse.json({ error: "no_enrollment" }, { status: 404, headers });
  }

  return NextResponse.json(snapshot, { status: 200, headers });
}
