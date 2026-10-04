import { corsOptionsResponse } from "@/lib/cors";
import { prisma } from "@/lib/prisma";
import { formatAppDate } from "@/lib/appTime";
import { labelForLangCode } from "@/lib/levelTestTranslation";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { handleStudentEvaluationRequest, type StudentEvaluationDeps } from "@/lib/studentEvaluation";

// 마케팅 사이트(Vite)의 "내 강의실 > 평가서 보기"가 읽는 공개 엔드포인트 — 로그인한 학생 본인의 수업(lessonId =
// ClassSession id)에 게시된 평가서 본문(+번역본)을 돌려준다. /api/public/classroom와 같은 Bearer 학생 토큰
// 인증만 쓰고, 소유권은 조회 조건(classSession.studentId)으로 강제한다. 처리 규칙과 테스트는 studentEvaluation.ts /
// admin/scripts/test-studentEvaluationApi.ts 참고. 이 라우트는 읽기 전용이다(쓰기·번역 호출 없음).
const prismaDeps: StudentEvaluationDeps = {
  studentIdFromRequest: studentIdFromAuthHeader,
  async findOwnEvaluation(studentId, lessonId) {
    const row = await prisma.lessonEvaluation.findFirst({
      where: { classSessionId: lessonId, classSession: { studentId, deletedAt: null } },
      select: {
        classSessionId: true,
        content: true,
        contentTranslated: true,
        contentTranslatedLang: true,
        classSession: { select: { scheduledAt: true } },
      },
    });
    if (!row) return null;
    return {
      lessonId: row.classSessionId,
      date: formatAppDate(row.classSession.scheduledAt),
      content: row.content,
      contentTranslated: row.contentTranslated,
      translatedLangLabel: labelForLangCode(row.contentTranslatedLang),
    };
  },
};

export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  return handleStudentEvaluationRequest(request, prismaDeps);
}
