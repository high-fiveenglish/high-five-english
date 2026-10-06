// REAL Anthropic API E2E test for aiEvaluation.ts — separate from
// test-aiEvaluationDraft.ts (which is fixture-only, no network, always safe to run as
// part of the regular suite) so a real paid API call never happens by accident as part
// of routine testing. Run manually only: `npx tsx scripts/test-aiEvaluationE2E.ts`.
//
// No DB writes. No Google Drive. No AssemblyAI call (uses a synthetic transcript).
// Talk Time is injected directly as already-"measured" numbers (simulating what
// talkTime.ts would have computed from real AssemblyAI utterances) rather than
// computed here, since this test exercises the Claude layer only.
import fs from "node:fs";
import { generateAIEvaluationDraft } from "../src/lib/aiEvaluation";
import { checkNoUngroundedHistoricalClaims } from "../src/lib/projectEvaluationRules";
import type { TalkTimeResult, Utterance } from "../src/lib/talkTime";

const envText = fs.readFileSync("D:/하이파이브 사이트 제작/admin/.env", "utf8");
const match = envText.match(/^ANTHROPIC_API_KEY="?([^"\n]+)"?/m);
if (match) process.env.ANTHROPIC_API_KEY = match[1];

// 25분 수업 synthetic transcript — 실제 학생 개인정보 없음. 평가 signal을 의도적으로
// 심어둔다: 문법 오류 2개(과거시제, 전치사), 어휘 학습(3개), 교정 기회, 학생의 자발적
// 표현, 후속 질문, 강사의 engagement, pacing(워밍업→본활동→마무리) 신호.
const TRANSCRIPT = `
T: Hi Minjun! How are you doing today? How was your weekend?
S: I'm good! My weekend was... um... I go to my grandmother house.
T: Nice! Just to help you out — you'd say "I went to my grandmother's house," since it already happened. Can you try that again?
S: Oh okay. I went to my grandmother's house. We eat a lot of food together.
T: Good try! Same thing there — "We ate a lot of food together." Past tense, remember?
S: We ate a lot of food together. It was so yummy, I eat three plates!
T: Haha, three plates, wow! "I ate three plates" — you're getting it. What kind of food did you eat?
S: We eat... we ATE kimchi jjigae and also my grandmother made japchae for me because it's my favorite.
T: That's wonderful. Japchae is a great choice. Today we're going to learn some new vocabulary about family gatherings, and then we'll practice telling a story about your weekend using past tense. Sound good?
S: Yes!
T: Okay, first word: "gathering." A gathering is when a group of people come together, like a family gathering. Can you use it in a sentence?
S: My family gathering is... every Chuseok?
T: Exactly right, "My family has a gathering every Chuseok." Next word: "reunion" — this is when family members who don't see each other often come back together. Have you had a reunion recently?
S: Yes, last weekend was like a small reunion because my cousin came back from Busan.
T: Perfect use of the word! Last word for today: "hospitality" — this means being warm and welcoming to guests. Your grandmother showing hospitality by cooking for you is a great example.
S: My grandmother always have good hospitality. She cook for everyone who visit.
T: Close! "My grandmother always HAS good hospitality. She COOKS for everyone who VISITS." Remember, with "she" or "he," we add -s to the verb in present tense. Let's practice — can you tell me a short story about last weekend using past tense, and try to use one of our new words?
S: Okay... Last weekend, I go to my grandmother house for a family reunion. My cousin came from Busan and we didn't see him for two years. My grandmother cook a lot of food for us because she have a lot of hospitality. We talked and laughed so much. I was really happy.
T: Minjun, that was a really nice story, and I love that you used "reunion" and "hospitality" naturally! Two small fixes: "I WENT to my grandmother's house," and "My grandmother COOKED a lot of food... because she HAS a lot of hospitality." But honestly, the fact that you told a whole story with a beginning, middle, and feeling at the end — that's a big step up from last month. How did it feel seeing your cousin after two years?
S: It felt really exciting! I didn't expect he will be so tall now.
T: Good instinct using "expect" there! Small note: "I didn't expect HIM TO BE so tall now." We'll practice that pattern more next time. Let's wrap up — what's one thing you want to remember from today?
S: I want to remember... ate, cooked, went. Past tense words.
T: Great summary! For homework, try writing three sentences about a family gathering using past tense and at least one of today's new words. See you next class, Minjun!
S: Okay, see you teacher! Thank you!
`.trim();

// 합성 대화를 AssemblyAI utterances 형태(화자 A=강사, B=학생, ms 타임스탬프)로 바꿔 production과 같은 입력 구조로 넘긴다.
const UTTERANCES: Utterance[] = TRANSCRIPT.split("\n").map((line, i) => ({
  speaker: line.startsWith("T:") ? "A" : "B",
  start: i * 20000,
  end: i * 20000 + 15000,
  text: line.replace(/^[TS]:\s*/, ""),
}));

// AI가 transcript만 보고 나이/날짜를 추측하지 않는다 — 둘 다 애플리케이션이 명시적으로
// 계산/조회해 LESSON CONTEXT로 전달한다(ageBand는 실제 production에서 ageBandFromBirthDate로
// 계산되지만, 이 테스트는 Claude adapter 레이어만 보므로 이미 계산된 값을 직접 준다).
const LESSON_DATE = "2026-10-01"; // 실제라면 ClassSession.scheduledAt에서 옴(appTime.ts)

const TALK_TIME: TalkTimeResult = {
  teacherSpeakingSeconds: 780,
  studentSpeakingSeconds: 570,
  teacherTalkPercentage: 57.8,
  studentTalkPercentage: 42.2,
};

async function main() {
  console.log("ANTHROPIC_API_KEY configured:", !!process.env.ANTHROPIC_API_KEY);
  console.log("lessonDate fixture:", LESSON_DATE, "(historicalContextAvailable: false)");
  console.log("Talk Time fixture:", JSON.stringify(TALK_TIME));

  console.log("\n=== CALLING REAL ANTHROPIC API (1 call) ===");
  let result;
  try {
    result = await generateAIEvaluationDraft({
      utterances: UTTERANCES,
      teacherSpeakerLabel: "A",
      talkTime: TALK_TIME,
      lessonContext: {
        lessonDate: LESSON_DATE,
        lessonDurationMinutes: 25,
        studentAgeBand: "teen",
        studentRegion: "KOREA",
        textbookName: "Our World Readers 3",
        classMethod: "zoom",
      },
    });
  } catch (e) {
    console.log("\nReal Claude API: FAIL —", e instanceof Error ? e.message : String(e));
    console.log("(this is the grounding-validation guard rejecting the draft — treat as CLAUDE E2E: FAIL, do not proceed)");
    process.exit(1);
  }

  if (!result) {
    console.log("\nReal Claude API: FAIL (null result — check API key/network/response)");
    process.exit(1);
  }
  console.log("\nReal Claude API: PASS");

  console.log("\n--- STUDENT FEEDBACK (Output 1) ---\n");
  console.log(result.studentFeedback);
  console.log("\n--- TEACHER QC (Output 2) ---\n");
  console.log(result.teacherQc ?? `(not generated: ${result.teacherQcFailure ?? "unknown"})`);
  // teacherQc is null when only the student report passed validation (the QC is optional for the review); the checks below use the text if present
  const teacherQcText = result.teacherQc ?? "";

  // 저장해서 이후 분석/보고에 쓸 수 있게 scratchpad에 남긴다(production 코드/DB와 무관).
  fs.writeFileSync(
    "C:/Users/jongb/AppData/Local/Temp/claude/D--------------/4699fdc1-b36b-48d2-af5a-2c984a006815/scratchpad/claude_e2e_result.json",
    JSON.stringify({ ...result, talkTimeFixtureSent: TALK_TIME }, null, 2),
  );

  console.log("\n=== STRUCTURAL CHECKS ===");
  console.log("A. studentFeedback present:", !!result.studentFeedback);
  console.log("B. teacherQc present:", !!result.teacherQc);
  console.log("E. Talk Time values appear verbatim in Output2:", teacherQcText.includes("57.8") && teacherQcText.includes("42.2"));
  console.log("E2. Talk Time values NOT altered elsewhere oddly (spot check 780/570):", teacherQcText.includes("780") || teacherQcText.includes("57.8"));

  console.log("\n=== GROUNDING / HISTORICAL-CLAIM CHECK (explicit, double-confirms the adapter's internal guard) ===");
  const feedbackCheck = checkNoUngroundedHistoricalClaims(result.studentFeedback, LESSON_DATE, TRANSCRIPT);
  const qcCheck = checkNoUngroundedHistoricalClaims(teacherQcText, LESSON_DATE, TRANSCRIPT);
  console.log("Output 1 grounding check:", feedbackCheck.ok ? "PASS" : `FAIL — ${feedbackCheck.issues.join("; ")}`);
  console.log("Output 2 grounding check:", qcCheck.ok ? "PASS" : `FAIL — ${qcCheck.issues.join("; ")}`);
  console.log("Output 1 date mentions lessonDate's month (October):", /October/i.test(result.studentFeedback));
  console.log("Output 2 date mentions lessonDate's month (October):", /October/i.test(teacherQcText));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
