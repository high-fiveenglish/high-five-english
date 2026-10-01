// AudioRecording 처리 흐름에서 반복되는 "상태 판단" 로직을 DB 접근과 분리된 순수
// 함수로 뽑아둔다 — webhook 라우트(idempotency)와 teacher의 publishAIDraft(기존
// 평가서 보호) 양쪽에서 재사용하고, admin/scripts/test-*.ts 패턴으로 테스트하기
// 위함이다.

/** 이미 TRANSCRIBED 이후 단계로 넘어간 상태 — webhook/background function이 중복
 * 도착·중복 실행돼도 되돌리거나 재처리를 트리거하지 않아야 하는 상태 목록. 두 곳
 * 모두(assemblyai-webhook/route.ts, process-recording-background.ts) 이 배열을
 * Prisma의 `updateMany({ where: { processingStatus: { notIn: ... } } })`에 직접
 * 넘겨, "조회 후 갱신"이 아니라 단일 UPDATE문으로 상태 전이를 원자적으로 만든다 —
 * 동시에 도착한 중복 요청 중 하나만 실제로 행을 바꾸게 해 race condition(Claude
 * 중복 호출, aiDraft 중복 저장)을 막는다. */
export const ALREADY_PROGRESSED_STATUSES = ["TRANSCRIBED", "ANALYZING", "NEEDS_REVIEW", "PUBLISHED", "COMPLETED"];

export function isAlreadyProgressed(processingStatus: string): boolean {
  return ALREADY_PROGRESSED_STATUSES.includes(processingStatus);
}

/** 기존 LessonEvaluation이 있는데 아직 명시적으로 덮어쓰기 확인을 받지 않았다면
 * true — 이 경우 publish를 진행하지 않고 확인을 요청해야 한다. */
export function shouldRequireOverwriteConfirmation(hasExistingEvaluation: boolean, confirmOverwrite: boolean): boolean {
  return hasExistingEvaluation && !confirmOverwrite;
}
