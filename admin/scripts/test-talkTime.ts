// talkTime.ts의 순수 함수 단위 테스트 — DB/네트워크 전혀 사용하지 않는다.
import { computeTalkTime, guessTeacherSpeakerLabel, type Utterance } from "../src/lib/talkTime";

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

// 1. 기본 계산: A가 70%, B가 30%
const basic: Utterance[] = [
  { speaker: "A", start: 0, end: 7000, text: "hi" },
  { speaker: "B", start: 7000, end: 10000, text: "hello" },
];
assertEqual(
  computeTalkTime(basic, "A"),
  { teacherSpeakingSeconds: 7, studentSpeakingSeconds: 3, teacherTalkPercentage: 70, studentTalkPercentage: 30 },
  "70/30 기본 계산",
);

// 2. 여러 발화 구간 합산
const multi: Utterance[] = [
  { speaker: "A", start: 0, end: 2000, text: "a" },
  { speaker: "B", start: 2000, end: 3000, text: "b" },
  { speaker: "A", start: 3000, end: 5000, text: "c" },
  { speaker: "B", start: 5000, end: 9000, text: "d" },
];
// A: 2000+2000=4000ms=4s, B: 1000+4000=5000ms=5s, total 9s -> A 44%, B 56%
assertEqual(
  computeTalkTime(multi, "A"),
  { teacherSpeakingSeconds: 4, studentSpeakingSeconds: 5, teacherTalkPercentage: 44, studentTalkPercentage: 56 },
  "여러 구간 합산",
);

// 3. 발화 없음 -> 0/0, 0%/0%
assertEqual(
  computeTalkTime([], "A"),
  { teacherSpeakingSeconds: 0, studentSpeakingSeconds: 0, teacherTalkPercentage: 0, studentTalkPercentage: 0 },
  "발화 없음 -> 전부 0",
);

// 4. teacherSpeakerLabel과 일치하는 화자가 없음 -> teacher 0, student 100%
const noTeacher: Utterance[] = [{ speaker: "B", start: 0, end: 5000, text: "x" }];
assertEqual(
  computeTalkTime(noTeacher, "A"),
  { teacherSpeakingSeconds: 0, studentSpeakingSeconds: 5, teacherTalkPercentage: 0, studentTalkPercentage: 100 },
  "teacher 라벨과 일치하는 화자 없음",
);

// 5. guessTeacherSpeakerLabel — 첫 발화자
assertEqual(guessTeacherSpeakerLabel(multi), "A", "guessTeacherSpeakerLabel -> 첫 발화자");
assertEqual(guessTeacherSpeakerLabel([]), null, "guessTeacherSpeakerLabel([]) -> null");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
