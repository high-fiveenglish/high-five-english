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

  // voiceUrl(음성 base64, @db.Text)은 여기서 절대 select하지 않는다 — 22명분만 같이
  // 읽어도 쿼리 자체가 최대 34초 걸린 실측 기록이 있고(teacherSelect.ts 주석 참고),
  // 응답도 강사 1인당 최대 수MB라 전체 목록 응답이 18.9MB까지 커졌었다. 실제로
  // voiceUrl이 쓰이는 곳은 강사소개 카드를 클릭해서 상세 모달을 열었을 때뿐이라
  // (PublicTeacherModal.tsx), 그 한 명 것만 /api/public/teachers/[id]/voice에서
  // 따로 지연 조회한다 — 목록 로딩 자체는 이 필드를 아예 몰라도 된다.
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
    bio: t.selfIntroduction,
    experience: t.experience,
    videoYoutubeCode: t.videoYoutubeCode,
    tesol: t.tesol,
    workingHours: formatAvailableTimeRanges(t.availableHours),
  }));

  // 이 목록은 이제 테넌트/도메인과 무관하게 항상 같은 응답이라(agentId로 나뉘지 않음)
  // 캐시가 다른 협력사 데이터와 섞일 여지 자체가 없다 — 인증 헤더로도 응답이 안 바뀐다.
  return NextResponse.json(payload, { headers: { ...headers, "Cache-Control": "public, max-age=60" } });
}
