// recordingWorkflow.ts의 순수 상태 판단 함수 단위 테스트 — DB/네트워크 없음.
import { isAlreadyProgressed, shouldRequireOverwriteConfirmation } from "../src/lib/recordingWorkflow";

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
