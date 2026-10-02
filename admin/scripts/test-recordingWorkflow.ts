// recordingWorkflow.ts의 순수 상태 판단 함수 단위 테스트 — DB/네트워크 없음.
import {
  ALREADY_PROGRESSED_STATUSES,
  AWAITING_TRANSCRIPT_STATUSES,
  isAlreadyProgressed,
  MAX_ERROR_MESSAGE_LENGTH,
  safeRecordingFailureMessage,
  shouldRequireOverwriteConfirmation,
  truncateErrorMessage,
} from "../src/lib/recordingWorkflow";

let pass = 0;
let fail = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// isAlreadyProgressed
assertEqual(isAlreadyProgressed("UPLOADED"), false, "UPLOADED -> 아직 진행 전");
assertEqual(isAlreadyProgressed("TRANSCRIBING"), false, "TRANSCRIBING -> 아직 진행 전");
assertEqual(isAlreadyProgressed("TRANSCRIBED"), true, "TRANSCRIBED -> 이미 진행됨");
assertEqual(isAlreadyProgressed("ANALYZING"), true, "ANALYZING -> 이미 진행됨");
assertEqual(isAlreadyProgressed("NEEDS_REVIEW"), true, "NEEDS_REVIEW -> 이미 진행됨");
assertEqual(isAlreadyProgressed("PUBLISHED"), true, "PUBLISHED -> 이미 진행됨");
assertEqual(isAlreadyProgressed("COMPLETED"), true, "COMPLETED -> 이미 진행됨");
assertEqual(isAlreadyProgressed("TRANSCRIPTION_FAILED"), false, "실패 상태는 '진행됨'이 아님(재시도 허용)");

// shouldRequireOverwriteConfirmation
assertEqual(shouldRequireOverwriteConfirmation(true, false), true, "기존 평가서 있음 + 미확인 -> 확인 필요");
assertEqual(shouldRequireOverwriteConfirmation(true, true), false, "기존 평가서 있음 + 확인됨 -> 진행 가능");
assertEqual(shouldRequireOverwriteConfirmation(false, false), false, "기존 평가서 없음 -> 확인 불필요");
assertEqual(shouldRequireOverwriteConfirmation(false, true), false, "기존 평가서 없음(확인 플래그 무관) -> 확인 불필요");

// AWAITING_TRANSCRIPT_STATUSES — webhook이 전이시킬 수 있는 유일한 출발 상태(되살리기 방지)
assertEqual(AWAITING_TRANSCRIPT_STATUSES.some((st) => ALREADY_PROGRESSED_STATUSES.includes(st)), false, "전사 대기 상태와 진행됨 상태는 겹치지 않음");
for (const st of ["ANALYSIS_FAILED", "TRANSCRIPTION_FAILED", "UPLOAD_FAILED", "SAVE_FAILED", "TRANSCRIBED", "NEEDS_REVIEW"]) {
  assertEqual(AWAITING_TRANSCRIPT_STATUSES.includes(st), false, `${st}는 webhook이 되살릴 수 있는 상태가 아님`);
}

// safeRecordingFailureMessage — 내부 errorMessage 대신 고정 문구만
assertEqual(safeRecordingFailureMessage("ANALYSIS_FAILED")?.includes("manually"), true, "ANALYSIS_FAILED -> 고정 안내 문구");
assertEqual(safeRecordingFailureMessage("NEEDS_REVIEW"), null, "실패가 아닌 상태 -> 문구 없음");
assertEqual(safeRecordingFailureMessage("ANALYZING"), null, "진행 중 -> 문구 없음");

// truncateErrorMessage
assertEqual(truncateErrorMessage("short"), "short", "짧은 오류 문구는 그대로");
assertEqual(truncateErrorMessage("x".repeat(5000)).length, MAX_ERROR_MESSAGE_LENGTH, "긴 오류 문구는 상한으로 자름");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
