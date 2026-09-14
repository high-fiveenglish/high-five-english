import { NextResponse } from "next/server";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { getStudentEnrollmentHistory } from "@/lib/studentClassroom";

// 마케팅 사이트(Vite)의 "내 강의실 > 수강내역" 탭이 읽는 공개 엔드포인트 — 학생의
// 모든 수강 건(과거/현재/예정)과 각 건의 수업 목록을 한 번에 돌려준다. /api/public/classroom와
// 같은 Bearer 토큰 인증을 쓴다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const studentId = studentIdFromAuthHeader(request);
  if (!studentId) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 401, headers });
  }

  const rows = await getStudentEnrollmentHistory(studentId);
  return NextResponse.json({ rows }, { status: 200, headers });
}
