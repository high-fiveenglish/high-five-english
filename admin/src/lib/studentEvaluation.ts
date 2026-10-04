// 공개 사이트(Vite) "내 강의실 > 평가서 보기"가 읽는 read-only API의 처리 본체. DB·인증은 deps로 주입받는다 —
// 라우트(api/public/classroom/evaluation/route.ts)는 Prisma 기반 deps를 조립해 넘기기만 하고,
// admin/scripts/test-studentEvaluationApi.ts는 같은 로직을 in-memory fake deps로 검증한다.
//
// 인증/소유권 규칙:
//  - 인증은 학생 Bearer 토큰(studentApiToken)뿐이다. 쿠키·Admin·Teacher 권한은 읽지 않는다.
//  - 어떤 수업의 평가서인지는 공개 사이트가 아는 식별자 = ClassSession id(lessonId)로 찾는다.
//  - 소유권은 조회 자체에 걸린다(findOwnEvaluation의 studentId 인자): "없음"과 "남의 것"이 똑같이 404라서
//    다른 학생의 수업 id를 넣어도 존재 여부가 드러나지 않는다.
//  - lessonId는 양의 정수일 때만 DB까지 간다(숫자가 아닌 값이 Prisma까지 가서 500이 되지 않는다).
import { corsHeaders } from "./cors";

/** Postgres int4 최대값 — 이보다 큰 id는 어차피 존재할 수 없고, Prisma에 넘기면 오류가 난다. */
const MAX_LESSON_ID = 2_147_483_647;

export function parseLessonIdParam(raw: string | null): number | null {
  if (raw === null || !/^[1-9][0-9]{0,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= MAX_LESSON_ID ? n : null;
}

export interface StudentLessonEvaluation {
  lessonId: number;
  /** 수업일(KST, YYYY-MM-DD). */
  date: string;
  /** 강사가 확정해 게시한 영어 평가서 원문. */
  content: string;
  /** 학생 언어 번역본. 없으면 null — 이때 translatedLangLabel도 null이어야 한다. */
  contentTranslated: string | null;
  translatedLangLabel: string | null;
}

export interface StudentEvaluationDeps {
  /** 요청의 Authorization: Bearer 토큰에서 학생 id를 꺼낸다. 없거나 틀리면 null. */
  studentIdFromRequest(request: Request): number | null;
  /** 이 학생 본인의 수업(삭제되지 않은 것)에 게시된 평가서만 돌려준다. 없으면 null. */
  findOwnEvaluation(studentId: number, lessonId: number): Promise<StudentLessonEvaluation | null>;
}

export async function handleStudentEvaluationRequest(request: Request, deps: StudentEvaluationDeps): Promise<Response> {
  const headers = { ...(corsHeaders(request.headers.get("origin")) as Record<string, string>), "Cache-Control": "no-store" };
  const json = (body: unknown, status: number) => Response.json(body, { status, headers });

  const studentId = deps.studentIdFromRequest(request);
  if (!studentId) return json({ error: "invalid_or_expired_token" }, 401);

  // 값이 정확히 하나일 때만 받는다(?lessonId=1&lessonId=2 같은 모호한 입력은 어느 값을 쓸지 추측하지 않고 거부).
  const values = new URL(request.url).searchParams.getAll("lessonId");
  const lessonId = values.length === 1 ? parseLessonIdParam(values[0]) : null;
  if (lessonId === null) return json({ error: "not_found" }, 404);

  const evaluation = await deps.findOwnEvaluation(studentId, lessonId);
  if (!evaluation) return json({ error: "not_found" }, 404);

  // 번역본과 언어 라벨은 둘 다 있을 때만 내보낸다(어느 한쪽만 있으면 화면이 번역 토글을 잘못 그린다).
  const hasTranslation = Boolean(evaluation.contentTranslated && evaluation.translatedLangLabel);
  return json(
    {
      lessonId: evaluation.lessonId,
      date: evaluation.date,
      content: evaluation.content,
      contentTranslated: hasTranslation ? evaluation.contentTranslated : null,
      translatedLangLabel: hasTranslation ? evaluation.translatedLangLabel : null,
    },
    200,
  );
}
