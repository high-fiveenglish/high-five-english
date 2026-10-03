// aiEvaluation.ts + projectEvaluationRules.ts의 순수 함수 테스트 — Anthropic API를
// 전혀 호출하지 않는다. 검증 대상: transport validation(validateAIEvaluationResult),
// age band 계산, Talk Time override 블록이 측정값을 그대로 담는지, prompt 재료에
// Skill 원문과 프로젝트 규칙이 실제로 포함되는지(문자열 검증).
import { parseReport } from "../src/lib/aiEvaluation";
import {
  ageBandFromBirthDate,
  ageToneInstruction,
  talkTimeOverrideBlock,
  checkNoUngroundedHistoricalClaims,
  buildProjectRules,
  HISTORICAL_CONTEXT_POLICY,
} from "../src/lib/projectEvaluationRules";
import { ONLINE_ENGLISH_FEEDBACK_SKILL } from "../src/lib/skill/onlineEnglishFeedbackSkill";

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

// --- parseReport (transport layer: 보고서마다 따로 호출하므로 tool 입력은 { report } 하나) ---
assertEqual(parseReport({ report: "  📘 feedback  " }), "📘 feedback", "정상 입력 -> 앞뒤 공백 제거 후 통과");
assertEqual(parseReport(null), null, "null -> null");
assertEqual(parseReport({}), null, "report 누락 -> null");
assertEqual(parseReport({ report: "   " }), null, "빈 report -> null");
assertEqual(parseReport({ report: 123 }), null, "report가 문자열 아님 -> null");

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

// --- prompt 조립 재료에 Skill 원문 규칙이 실제로 포함되는지(문자열 레벨) ---
// 예전에는 Skill을 요약한 별도 상수(GROUNDING_RULES 등)를 검사했지만, 이제 Skill 원문 전체가 그대로 prompt에 들어간다.
assert(ONLINE_ENGLISH_FEEDBACK_SKILL.includes("Never fabricate vocabulary, corrections, or quotes"), "Skill 원문에 '날조 금지' 포함");
assert(ONLINE_ENGLISH_FEEDBACK_SKILL.includes("📘") && ONLINE_ENGLISH_FEEDBACK_SKILL.includes("🌟"), "Skill 원문에 Output1 섹션 이모지 포함");
assert(ONLINE_ENGLISH_FEEDBACK_SKILL.includes("왜 틀렸을까요?"), "Skill 원문에 교정 설명(왜 틀렸는지) 요구 포함");
assert(
  ONLINE_ENGLISH_FEEDBACK_SKILL.includes("Talk Time Ratio") && ONLINE_ENGLISH_FEEDBACK_SKILL.includes("Teaching Quality"),
  "Skill 원문에 Output2의 10개 항목 핵심 포함",
);
assert(ONLINE_ENGLISH_FEEDBACK_SKILL.includes("25-minute class") && ONLINE_ENGLISH_FEEDBACK_SKILL.includes("50-minute class"), "Skill 원문에 25분/50분 구조가 각각 있음");
const projectRules = buildProjectRules({ lessonDurationMinutes: 25, speakerCount: 2 });
assert(projectRules.includes("PROJECT AI EVALUATION RULES"), "프로젝트 규칙 블록이 Skill과 구분되어 있음");
assert(projectRules.includes("Write Output 1 in ENGLISH"), "영어 canonical override가 코드에 명시됨");
assert(!projectRules.includes("3-5 sentences") && !projectRules.includes("2-4 items"), "Skill 구조와 충돌하던 범용 문장/항목 수 규칙은 제거됨");

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
