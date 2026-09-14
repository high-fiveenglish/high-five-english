import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { verifySsoToken } from "@/lib/sso";
import { createStudentApiToken } from "@/lib/studentApiToken";
import { getStudentProfileSnapshot } from "@/lib/studentProfileUpdate";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";

// 관리자 "회원으로 로그인"이 발급한 1회용 SSO 토큰을 메인 마케팅 사이트(Vite, 별도
// origin·정적 SPA)가 검증하기 위해 호출하는 공개 엔드포인트. 서명 비밀키(SSO_SHARED_SECRET)는
// 이 서버 프로세스 밖으로 절대 나가지 않는다 — Vite 쪽은 토큰 문자열만 그대로 넘기고,
// 검증이 통과했을 때만 이 라우트가 돌려주는 학생 표시정보 + (있다면) 실제 수강정보
// 요약을 받아 자기 쪽 mock 데이터를 채운다. proxy.ts가 "api/public"은 인증 없이
// 통과시키므로 이 라우트는 관리자 세션 없이도 호출 가능하다 — 대신 토큰 자체가 60초
// 만료의 서명된 1회용 증표라 위조/재사용이 불가능하다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }

  const token = String((body as Record<string, unknown>).token ?? "");
  const payload = verifySsoToken(token);
  if (!payload) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 401, headers });
  }

  const student = await prisma.student.findUnique({ where: { id: payload.studentId } });
  if (!student || student.deletedAt) {
    return NextResponse.json({ error: "student_not_found" }, { status: 404, headers });
  }

  const [enrollment, profile] = await Promise.all([
    prisma.enrollment.findFirst({
      where: { studentId: payload.studentId, status: { in: ["ACTIVE", "PAID", "APPLIED"] } },
      orderBy: { id: "desc" },
      include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
    }),
    getStudentProfileSnapshot(payload.studentId),
  ]);

  return NextResponse.json(
    {
      studentId: payload.studentId,
      loginId: payload.loginId,
      name: payload.name,
      englishName: payload.englishName,
      apiToken: createStudentApiToken(payload.studentId),
      profile,
      enrollment: enrollment
        ? {
            scheduleDays: enrollment.scheduleDays,
            classTime: enrollment.classTime,
            classTimes: enrollment.classTimes,
            classDurationMin: enrollment.classDurationMin,
            totalSessions: enrollment.totalSessions,
            startDate: enrollment.startDate.toISOString().slice(0, 10),
            endDate: enrollment.endDate.toISOString().slice(0, 10),
            classMethod: enrollment.classMethod,
            textbookName: enrollment.textbookName,
            teacherName: enrollment.teacher?.realName ?? null,
          }
        : null,
    },
    { status: 200, headers },
  );
}
