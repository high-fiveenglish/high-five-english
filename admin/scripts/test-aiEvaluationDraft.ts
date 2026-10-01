// aiEvaluation.ts + evaluationSkillRules.ts의 순수 함수 테스트 — Anthropic API를
// 전혀 호출하지 않는다. 검증 대상: transport validation(validateAIEvaluationResult),
// age band 계산, Talk Time override 블록이 측정값을 그대로 담는지, prompt 조립에
// grounding/skill 규칙이 실제로 포함되는지(문자열 검증).
import { validateAIEvaluationResult } from "../src/lib/aiEvaluation";
import {
  ageBandFromBirthDate,
  ageToneInstruction,
  talkTimeOverrideBlock,
  checkNoUngroundedHistoricalClaims,
  GROUNDING_RULES,
  HISTORICAL_CONTEXT_POLICY,
  STUDENT_FEEDBACK_RULES,
  TEACHER_QC_RULES,
} from "../src/lib/evaluationSkillRules";

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
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

// --- validateAIEvaluationResult (transport layer) ---
assertEqual(
  validateAIEvaluationResult({ studentFeedback: "📘 feedback", teacherQc: "Tutor Evaluation" }),
  { studentFeedback: "📘 feedback", teacherQc: "Tutor Evaluation" },
  "정상 입력 -> 통과",
);
assertEqual(validateAIEvaluationResult(null), null, "null -> null");
assertEqual(validateAIEvaluationResult({ studentFeedback: "x" }), null, "teacherQc 누락 -> null");
assertEqual(validateAIEvaluationResult({ studentFeedback: "", teacherQc: "x" }), null, "빈 studentFeedback -> null");
assertEqual(validateAIEvaluationResult({ studentFeedback: 123, teacherQc: "x" }), null, "studentFeedback이 문자열 아님 -> null");

// --- ageBandFromBirthDate (Skill 원문이 숫자를 못박지 않아 production이 정한 기본값) ---
const FIXED_NOW = new Date("2026-10-01T00:00:00Z");
assertEqual(ageBandFromBirthDate(null, FIXED_NOW), "unknown", "birthDate 없음 -> unknown");
assertEqual(ageBandFromBirthDate(new Date("2018-01-01"), FIXED_NOW), "child", "8세 -> child");
assertEqual(ageBandFromBirthDate(new Date("2010-01-01"), FIXED_NOW), "teen", "16세 -> teen");
assertEqual(ageBandFromBirthDate(new Date("2000-01-01"), FIXED_NOW), "adult", "26세 -> adult");
// 생일 경계 — 2026-10-01 기준 2013-10-02생은 아직 13세 생일 전이므로 12세(child)여야 함
assertEqual(ageBandFromBirthDate(new Date("2013-10-02"), FIXED_NOW), "child", "생일 하루 전 -> 만 나이로 child");
assertEqual(ageBandFromBirthDate(new Date("2013-09-30"), FIXED_NOW), "teen", "생일 지남 -> 만 13세 teen");

// --- ageToneInstruction — AI가 transcript로 나이를 추측하지 않고 코드가 계산한 band를 그대로 지시문에 반영 ---
assert(ageToneInstruction("child").includes("CHILD"), "child band -> CHILD 지시 포함");
assert(ageToneInstruction("adult").includes("ADULT") && ageToneInstruction("adult").includes("2nd"), "adult band -> 2인칭 직접 호칭 지시 포함");
assert(ageToneInstruction("unknown").includes("fallback") || ageToneInstruction("unknown").includes("assumption"), "unknown band -> fallback임을 명시");

// --- talkTimeOverrideBlock — 측정값이 그대로, 재계산 금지 지시 포함 ---
const block = talkTimeOverrideBlock({ teacherSeconds: 400, teacherPercentage: 67, studentSeconds: 200, studentPercentage: 33 });
assert(block.includes("400s (67%)"), "teacher 측정값이 블록에 그대로 포함");
assert(block.includes("200s (33%)"), "student 측정값이 블록에 그대로 포함");
assert(/do not estimate/i.test(block), "재계산/추정 금지 지시 포함");
assert(/UNVERIFIED HEURISTIC/.test(block), "화자 매핑이 미검증 휴리스틱임을 명시");

// --- prompt 조립 재료에 Skill 규칙이 실제로 포함되는지(문자열 레벨) ---
assert(GROUNDING_RULES.toLowerCase().includes("never invent"), "grounding 규칙에 '날조 금지' 포함");
assert(STUDENT_FEEDBACK_RULES.includes("📘") && STUDENT_FEEDBACK_RULES.includes("🌟"), "Output1 규칙에 skill 섹션 이모지 포함");
assert(STUDENT_FEEDBACK_RULES.includes("Why this happened"), "Output1 규칙에 교정 설명(왜 틀렸는지) 요구 포함");
assert(TEACHER_QC_RULES.includes("Talk Time Ratio") && TEACHER_QC_RULES.includes("Teaching Quality"), "Output2 규칙에 QC 10개 항목 핵심 포함");
assert(!TEACHER_QC_RULES.includes("📘"), "Output2 규칙에는 이모지(학생용 서식) 섞이지 않음");

// --- HISTORICAL_CONTEXT_POLICY — prompt에 실제로 포함되는지 ---
assert(HISTORICAL_CONTEXT_POLICY.includes("NOT PROVIDED"), "historical context가 제공되지 않음을 명시");
assert(/previous|earlier|prior/i.test(HISTORICAL_CONTEXT_POLICY), "이전 수업 언급 금지 규칙 포함");
assert(HISTORICAL_CONTEXT_POLICY.includes("lessonDate"), "날짜는 lessonDate를 그대로 쓰라는 지시 포함");
assert(
  /current-lesson-internal evidence is\s*\n?always fine/i.test(HISTORICAL_CONTEXT_POLICY),
  "같은 수업 내부 비교는 허용한다는 예외 명시(과도한 차단 방지)",
);

// --- checkNoUngroundedHistoricalClaims — 2026-10-01 실제 E2E에서 발견된 환각 회귀 테스트 ---
const LESSON_DATE = "2026-10-01";

// 실제로 발견됐던 문구 그대로 재현 — 반드시 잡아야 한다.
const actualHallucination =
  "This shows real progress in his ability to sustain a story in past tense — a meaningful step forward from his earlier February sessions.";
assert(
  !checkNoUngroundedHistoricalClaims(actualHallucination, LESSON_DATE).ok,
  "실제 발견된 환각('earlier February sessions') 탐지됨",
);

const historicalPhrases = [
  "Compared with previous lessons, the student spoke more.",
  "The student improved from previous lessons significantly.",
  "This shows continued progress from previous class sessions.",
  "Since the last lesson, the student has grown a lot.",
  "This is better than last month's performance.",
  "This was a strong lesson, as seen in his earlier session too.",
];
for (const phrase of historicalPhrases) {
  assert(!checkNoUngroundedHistoricalClaims(phrase, LESSON_DATE).ok, `역사적 비교 문구 탐지: "${phrase.slice(0, 40)}..."`);
}

// 10번 항목 — 과도하게 막지 않는다: 같은 수업 "내부" 비교는 정상(false positive 없어야 함).
const legitimateWithinLessonComparison =
  "The student first said 'I go to my grandmother house,' and after the tutor's correction said 'I went to my grandmother's house.'";
assert(
  checkNoUngroundedHistoricalClaims(legitimateWithinLessonComparison, LESSON_DATE).ok,
  "같은 수업 내부(before/after correction) 비교는 오탐 없이 통과",
);
const plainObservation = "During today's lesson, the student practiced past tense storytelling and used three new vocabulary words.";
assert(checkNoUngroundedHistoricalClaims(plainObservation, LESSON_DATE).ok, "이번 수업만 서술하는 평범한 문장은 통과");

// 날짜 regression — 실제 발견된 환각 날짜("January 2025") 포함 시 탐지, lessonDate와
// 같은 달이면 통과.
assert(
  !checkNoUngroundedHistoricalClaims("📘 25 January 2025 Today's Class Feedback", LESSON_DATE).ok,
  "lessonDate(2026-10)와 다른 달(January) 언급 시 탐지",
);
assert(
  checkNoUngroundedHistoricalClaims("📘 October 1, 2026 Today's Class Feedback", LESSON_DATE).ok,
  "lessonDate와 같은 달(October) 언급은 통과",
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
