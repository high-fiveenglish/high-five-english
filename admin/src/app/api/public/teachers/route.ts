import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { formatAvailableTimeRanges } from "@/lib/timeSlots";

// 메인 마케팅 사이트의 홈페이지 강사소개 섹션(src/services/instructorService.ts)이
// 호출하는 공개 읽기 전용 엔드포인트. 예전에는 별도의 마케팅용 Instructor 모델을
// 관리자가 직접 입력했지만, 이제는 실제 강사 계정(Teacher) 중 계정상태가 ACTIVE인
// 사람을 그대로 공개 프로필로 노출한다 — 강사소개 관리 화면 자체가 필요 없어졌다.
// 로그인ID/비밀번호/연락처/화상 미팅 접속 정보 등 내부 운영 정보는 포함하지 않는다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const teachers = await prisma.teacher.findMany({
    where: { siteId: DEFAULT_SITE_ID, accountStatus: "ACTIVE" },
    orderBy: [{ priority: "desc" }, { realName: "asc" }],
    select: {
      id: true,
      realName: true,
      nickname: true,
      nationality: true,
      teacherGrade: true,
      photoUrl: true,
      voiceUrl: true,
      selfIntroduction: true,
      experience: true,
      videoYoutubeCode: true,
      tesol: true,
      availableHours: true,
    },
  });

  const payload = teachers.map((t) => ({
    id: t.id,
    name: t.realName,
    nickname: t.nickname,
    nationality: t.nationality,
    grade: t.teacherGrade,
    photoUrl: t.photoUrl,
    audioUrl: t.voiceUrl,
    bio: t.selfIntroduction,
    experience: t.experience,
    videoYoutubeCode: t.videoYoutubeCode,
    tesol: t.tesol,
    workingHours: formatAvailableTimeRanges(t.availableHours),
  }));

  return NextResponse.json(payload, { headers: { ...headers, "Cache-Control": "no-store" } });
}
