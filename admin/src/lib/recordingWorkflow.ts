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
export const ALREADY_PROGRESSED_STATUSES = ["TRANSCRIBED", "ANALYZING", "NEEDS_SPEAKER_CONFIRMATION", "NEEDS_REVIEW", "PUBLISHED", "COMPLETED"];

/** AssemblyAI webhook이 레코드를 TRANSCRIBED(또는 TRANSCRIPTION_FAILED)로 옮길 수 있는
 * 유일한 출발 상태 — "전사 결과를 기다리는 중"인 상태뿐이다. notIn(ALREADY_PROGRESSED) 대신
 * 허용 목록(in)을 쓰는 이유: 이미 ANALYSIS_FAILED/UPLOAD_FAILED 등으로 끝난 레코드에 늦게
 * 도착했거나 재전송된 webhook이 레코드를 TRANSCRIBED로 되살려 Claude를 다시 호출하게 하거나,
 * 실패 사유를 덮어쓰지 못하게 한다. */
export const AWAITING_TRANSCRIPT_STATUSES = ["UPLOADED", "PUBLIC_READY", "TRANSCRIBING"];

/** background function이 ANALYZING을 선점한 뒤 이 시간 이상 지나도 NEEDS_REVIEW/ANALYSIS_FAILED로
 * 끝나지 않은 레코드는 실행이 중단된 것(함수 15분 제한 초과·런타임 종료 등)으로 본다.
 * 함수 최대 실행 시간(15분) + 여유. */
export const ANALYZING_STUCK_AFTER_MS = 30 * 60 * 1000;

/** 강사 화면에 보여 줄 실패 안내 — DB의 errorMessage(내부 오류 문구·검증 사유가 섞여 있음)는
 * 화면/클라이언트로 내보내지 않고, 상태별 고정 문구만 보여 준다. */
const SAFE_FAILURE_MESSAGES: Record<string, string> = {
  NEEDS_SPEAKER_CONFIRMATION:
    "We could not tell with enough confidence which voice is the teacher, so no AI draft was created (a draft with the roles swapped would be wrong). You can still write today's evaluation manually.",
  UPLOAD_FAILED: "The recording upload failed. You can still write today's evaluation manually.",
  TRANSCRIPTION_FAILED: "Transcription failed. You can still write today's evaluation manually.",
  ANALYSIS_FAILED: "The AI draft could not be generated. You can still write today's evaluation manually.",
  SAVE_FAILED: "Saving failed. You can still write today's evaluation manually.",
};
export function safeRecordingFailureMessage(processingStatus: string): string | null {
  return SAFE_FAILURE_MESSAGES[processingStatus] ?? null;
}

/** DB에 저장하는 errorMessage 길이 상한 — 예외 문구·검증 사유가 무한정 길어지지 않게 한다. */
export const MAX_ERROR_MESSAGE_LENGTH = 500;
export function truncateErrorMessage(message: string): string {
  return message.length > MAX_ERROR_MESSAGE_LENGTH ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…` : message;
}

export function isAlreadyProgressed(processingStatus: string): boolean {
  return ALREADY_PROGRESSED_STATUSES.includes(processingStatus);
}

/** 기존 LessonEvaluation이 있는데 아직 명시적으로 덮어쓰기 확인을 받지 않았다면
 * true — 이 경우 publish를 진행하지 않고 확인을 요청해야 한다. */
export function shouldRequireOverwriteConfirmation(hasExistingEvaluation: boolean, confirmOverwrite: boolean): boolean {
  return hasExistingEvaluation && !confirmOverwrite;
}
