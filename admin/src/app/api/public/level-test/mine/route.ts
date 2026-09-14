import { NextResponse } from "next/server";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { getLevelTestEligibility, getStudentLevelTests } from "@/lib/studentLevelTests";

// 마케팅 사이트(Vite)의 "내 강의실 > 레벨테스트신청/레벨테스트결과" 탭이 읽는 공개
// 엔드포인트 — 로그인한 학생 본인의 레벨테스트 이력 전체와, 지금 새로 신청할 수
// 있는지(재신청 대기 기간 포함) 여부를 함께 돌려준다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const studentId = studentIdFromAuthHeader(request);
  if (!studentId) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 401, headers });
  }

  const [eligibility, tests] = await Promise.all([
    getLevelTestEligibility(studentId),
    getStudentLevelTests(studentId),
  ]);

  return NextResponse.json({ eligibility, tests }, { status: 200, headers });
}
