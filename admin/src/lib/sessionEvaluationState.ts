// 수업별 "평가 상태"(연기 가능 여부 판단용) — 서버 전용 조회.
//
// 녹음(AudioRecording)에는 전사문·AI 초안·강사 QC·R2 키가 있어 강사 본인 화면과 서버-서버 경로에서만 읽는다(test-teacherQcVisibility.ts).
// 여기서는 평가서 존재 여부(LessonEvaluation의 id)와 녹음의 processingStatus 한 값만 읽고, 그 밖의 내부 데이터는 select하지 않는다.
// 호출한 화면(학생관리 수업 페이지)에는 NONE / HAS_EVALUATION / AI_PROCESSING 세 값만 돌려준다.
import { prisma } from "./prisma";
import { evaluationStateOf, type EvaluationState } from "./reschedule";

export async function loadEvaluationStates(sessionIds: readonly number[]): Promise<Map<number, EvaluationState>> {
  const states = new Map<number, EvaluationState>();
  if (sessionIds.length === 0) return states;
  const ids = [...sessionIds];
  const [evaluations, recordings] = await Promise.all([
    prisma.lessonEvaluation.findMany({ where: { classSessionId: { in: ids } }, select: { classSessionId: true } }),
    prisma.audioRecording.findMany({ where: { classSessionId: { in: ids } }, select: { classSessionId: true, processingStatus: true } }),
  ]);
  const evaluated = new Set(evaluations.map((e) => e.classSessionId));
  const status = new Map(recordings.map((r) => [r.classSessionId, r.processingStatus]));
  for (const id of ids) {
    const processingStatus = status.get(id);
    states.set(id, evaluationStateOf({ evaluation: evaluated.has(id) ? { id } : null, audioRecording: processingStatus === undefined ? null : { processingStatus } }));
  }
  return states;
}
