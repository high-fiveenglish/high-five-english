// Audio Automatic Evaluation의 Claude adapter.
//
// 영어 피드백의 평가 기준(내용·구조·어조·금지사항)은 online-english-feedback Skill이 Source of Truth이며,
// Skill 원문을 그대로(./skill/onlineEnglishFeedbackSkill.ts) prompt에 포함한다 — 여기서 다시 정의하거나
// 요약하지 않는다. 이 파일은 (1) Skill 원문 + (2) projectEvaluationRules.ts의 애플리케이션 규칙 + (3) 화자·
// 타임스탬프가 붙은 실제 발화 + (4) application이 측정한 Talk Time을 조립해 호출한다.
//
// 학생용 보고서(Output 1)와 강사 QC(Output 2)는 따로 호출한다: 각 출력이 짧아져 중복·환각이 줄고, 검증에
// 실패한 쪽만 이유를 알려 다시 생성한다(최대 MAX_ATTEMPTS번).
//   · 학생용 보고서가 끝내 통과하지 못하면 throw → ANALYSIS_FAILED (전달할 초안이 없다).
//   · 학생용 보고서는 통과했는데 강사 QC만 통과하지 못하면 throw하지 않는다: 학생용 초안은 그대로 돌려주고 teacherQc는 null이다
//     (QC는 강사 내부 자료라서, 그것 때문에 통과한 학생용 초안까지 버리지 않는다).
// 실패 이유는 범주와 건수로만 남긴다(evaluationDiagnostics.ts) — 검증 문장에는 전사 속 학생 발화가 인용돼 있어 로그/DB에 둘 수 없다.
import Anthropic from "@anthropic-ai/sdk";
import { ONLINE_ENGLISH_FEEDBACK_SKILL } from "./skill/onlineEnglishFeedbackSkill";
import {
  HISTORICAL_CONTEXT_POLICY,
  ageToneInstruction,
  buildProjectRules,
  talkTimeOverrideBlock,
  type AgeBand,
} from "./projectEvaluationRules";
import { skillLimitsFor, validateStudentFeedback, validateTeacherQc, type ValidationContext } from "./evaluationValidation";
import { detectLearnerErrors, formatLearnerErrorBlock, type LearnerErrorCandidate } from "./learnerErrors";
import {
  describeSpeakerMapping,
  formatTimestamp,
  recordingLengthMs,
  renderSpeakerTranscript,
  toRoleUtterances,
} from "./speakerTranscript";
import type { TalkTimeResult, Utterance } from "./talkTime";
import { EvaluationNotAcceptedError, recordAttempt, type AttemptRecord, type GenerationDiagnostics } from "./evaluationDiagnostics";

const MODEL = "claude-haiku-4-5";
// 보고서 하나당 약 1.5~3천 토큰이므로 넉넉하다. stop_reason이 max_tokens면 실패로 처리한다.
const MAX_TOKENS = 8192;
// 낮은 temperature: 인용·숫자를 지어내는 변동을 줄인다.
const TEMPERATURE = 0.2;
// 재시도는 이전 보고서를 부분 수정하게 하므로 위반이 시도마다 줄어든다(실제 음성에서 3→1→1건). 4회까지 허용한다.
const MAX_ATTEMPTS = 4;
// 운영 안전장치(평가 품질 로직이 아님): Netlify Background Function은 최대 15분이다. SDK 기본값(요청당
// 10분 타임아웃, 2회 재시도)이면 응답이 멈췄을 때 15분을 넘겨 ANALYZING에 남을 수 있다. 요청당
// 타임아웃을 90초로, SDK 내부 재시도를 1회로 줄이고, 마감 시간이 지나면 새 시도를 시작하지 않는다
// (이미 시작한 시도는 최대 180초 안에 끝난다 → 9분 + 3분 < 15분).
const REQUEST_TIMEOUT_MS = 90_000;
const SDK_MAX_RETRIES = 1;
const ATTEMPT_DEADLINE_MS = 9 * 60 * 1000;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: SDK_MAX_RETRIES });
  return client;
}

export interface LessonContext {
  /** ClassSession.scheduledAt에서 애플리케이션이 뽑은 실제 수업 날짜("YYYY-MM-DD"). Claude가 추측하지 않는다. */
  lessonDate: string;
  lessonDurationMinutes: number;
  /** Student.birthDate로 코드가 미리 계산해 전달한다 — AI가 transcript로 나이를 추측하지 않는다. */
  studentAgeBand: AgeBand;
  /** 참고용 문화적 맥락(예: "KOREA"). null이면 지역 맥락 없이 진행. */
  studentRegion: string | null;
  textbookName: string | null;
  classMethod: string | null;
}

export interface AIEvaluationResult {
  /** Output 1 — 학생/학부모용, 영어 canonical draft. AudioRecording.aiDraft에 저장. */
  studentFeedback: string;
  /** Output 2 — 강사 QC, 항상 영어. AudioRecording.teacherQcDraft에 저장, 학생에게 노출 안 함.
   * null: 학생용 보고서는 통과했지만 QC가 허용된 시도 안에 검증을 통과하지 못했다(teacherQcFailure에 범주별 요약). */
  teacherQc: string | null;
  /** teacherQc가 null일 때만: 범주와 건수로만 쓴 이유(전사·보고서 문장 없음). 강사 내부 기록용 — 학생에게 노출하지 않는다. */
  teacherQcFailure?: string;
  /** 각 보고서가 검증을 통과하기까지(또는 포기하기까지)의 생성 시도 횟수. */
  attempts?: { studentFeedback: number; teacherQc: number };
  /** 시도별 실패 범주 기록(범주와 건수만). */
  diagnostics?: GenerationDiagnostics;
}

export interface MessageLike {
  content: Array<{ type: string; name?: string; input?: unknown }>;
  stop_reason: string | null;
}
export type CreateMessageFn = (body: Anthropic.MessageCreateParamsNonStreaming) => Promise<MessageLike>;

export interface GenerateAIEvaluationParams {
  /** AssemblyAI가 돌려준 원본 utterances — 변경하지 않고, Claude에 보여 줄 라벨 붙은 사본만 만든다. */
  utterances: Utterance[];
  /** 첫 발화자 휴리스틱으로 정한 강사 라벨(guessTeacherSpeakerLabel). 검증된 사실이 아니다. */
  teacherSpeakerLabel: string | null;
  /** application이 타임스탬프로 측정한 값 — Claude는 재계산하지 않는다. */
  talkTime: TalkTimeResult;
  lessonContext: LessonContext;
  /** 테스트용 주입점. 기본값은 실제 Anthropic 클라이언트. */
  createMessage?: CreateMessageFn;
  /** 생성이 끝났을 때(성공이든 실패든) 한 번 호출된다. 범주와 건수만 담긴 시도 기록을 받는다 — 로그용. 예외는 무시된다. */
  onDiagnostics?: (diagnostics: GenerationDiagnostics) => void;
}

type OutputKind = "student" | "teacher";
const OUTPUTS: Record<OutputKind, { tool: string; label: string; request: string }> = {
  student: {
    tool: "submit_student_feedback",
    label: "Output 1 (student feedback)",
    request: "Write ONLY Output 1 (the student/parent feedback report). Do not write Output 2.",
  },
  teacher: {
    tool: "submit_teacher_qc",
    label: "Output 2 (teacher QC)",
    request: "Write ONLY Output 2 (the Tutor Evaluation / teacher QC report). Do not write Output 1.",
  },
};

/** API transport 레이어일 뿐 평가 기준이 아니다: tool 입력에서 보고서 본문(비어 있지 않은 문자열)을 꺼낸다. */
export function parseReport(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const report = (input as Record<string, unknown>).report;
  return typeof report === "string" && report.trim() ? report.trim() : null;
}

function buildLessonContextBlock(ctx: LessonContext, recordingLength: string): string {
  return `
LESSON CONTEXT (this is all the context you have — see HISTORICAL CONTEXT POLICY):
lessonDate: ${ctx.lessonDate}
lessonDurationMinutes: ${ctx.lessonDurationMinutes}
recordingLength (last timestamp): ${recordingLength}
studentAgeBand: ${ctx.studentAgeBand}
studentRegion: ${ctx.studentRegion ?? "unknown"}
textbook: ${ctx.textbookName ?? "unknown"}
classType: ${ctx.classMethod ?? "unknown"}

historicalContextAvailable: false
historicalContext: null
`.trim();
}

function defaultCreateMessage(): CreateMessageFn | null {
  const anthropic = getClient();
  return anthropic ? (body) => anthropic.messages.create(body) as unknown as Promise<MessageLike> : null;
}

/** 전사 뒤(모델이 마지막으로 읽는 위치)에 두는 압축 체크리스트: 이 요청에서 실제로 검증되는 항목만 담는다.
 * 시스템 프롬프트의 긴 규칙을 반복하는 것이 아니라, 어기면 거부되는 항목을 눈에 띄게 다시 보여 주는 용도다. */
function finalChecklist(kind: OutputKind, ctx: LessonContext, talkTime: TalkTimeResult, learnerErrors: LearnerErrorCandidate[] = []): string {
  if (kind === "student") {
    const limits = skillLimitsFor(ctx.lessonDurationMinutes);
    const thirdPerson = ctx.studentAgeBand === "child" || ctx.studentAgeBand === "teen";
    return [
      "FINAL CHECKLIST — the application rejects Output 1 if any line below is violated:",
      "- Exactly one 📘 title line; each of the 📝, 💬, ✅ and 🌟 sections exactly once; nothing after the 🌟 section.",
      `- At most ${limits.content} lines under 📝, ${limits.expressions} items under 💬 and ${limits.corrections} corrections under ✅ (fewer is fine).`,
      "- A ❌ line holds ONLY one student sentence copied word for word from a \"Student\" line (not a reading-aloud line) — no commentary, no description.",
      "- Quotation marks only for: the ❌ sentence, an Example line, and one student sentence in the 🌟 section — each copied word for word. Describe everything else in your own words, without quotation marks.",
      ...(thirdPerson ? ['- Write about "the student" in the 3rd person. Never write "you" or "your" outside quotation marks.'] : []),
      `- Do not write any number of minutes or seconds, except the lesson length (${ctx.lessonDurationMinutes} minutes).`,
      "- Every ❌ sentence must contain a REAL grammar error (agreement, tense, plural/count, article, word order, missing auxiliary, preposition). If a sentence is already correct English — even if it could sound softer or more precise — do NOT list it; a ✅ that only adds a qualifier (always, usually, really, so far ...) is rejected. When you are not sure a sentence is wrong, leave it out: fewer corrections is better than a doubtful one.",
      "- The title of each correction names the grammar point that actually changes between the ❌ and the ✅ sentence.",
      ...(learnerErrors.length > 0 ? ["- The CLEAR LEARNER ERRORS list above is mandatory: at least one ❌ item must be one of those errors."] : []),
    ].join("\n");
  }
  return [
    "FINAL CHECKLIST — the application rejects Output 2 if any line below is violated:",
    "- Output 2 contains NO quotation marks at all — not even around a single word (write tension, not \"tension\"). Describe what the tutor or student said in your own words.",
    "- A [mm:ss] label must be the start of a line spoken by the person the sentence is about: a sentence about the tutor cites a Tutor line, a sentence about the student cites a Student line (a tutor question is NOT at the timestamp of the student's answer).",
    "- Refer to a moment only with a [mm:ss] label copied from the start of a transcript line; never invent a time. Do not write any duration in minutes or seconds, except the lesson length (" + ctx.lessonDurationMinutes + " minutes). Item 10 may suggest a practice time.",
    `- Item 1 is exactly: "1. Talk Time Ratio: Teacher ${talkTime.teacherTalkPercentage}% / Student ${talkTime.studentTalkPercentage}%". No other % figure anywhere.`,
    "- One title line, then items 1 through 10 exactly once, in order; no other numbered lists; no emoji.",
  ].join("\n");
}

/** 재시도 요청. 이전 보고서가 있으면 "해당 문제만 고치라"고 본문과 함께 보낸다 — 처음부터 다시 쓰게 하면 매번 새로운
 * 실수가 생기는 것이 실제 음성 테스트에서 관찰되었다(위반은 시도마다 1~2건의 국소적인 실수였다). */
function retryNotice(issues: string[], previousReport: string | null): string {
  const problems = `VALIDATION FAILED on your previous attempt. These are the problems:\n${issues.map((i) => `- ${i}`).join("\n")}`;
  const rules = `Keep every quotation word-for-word from the transcript; where you cannot, describe what happened
without quotation marks. Do not invent example sentences, durations or timestamps. Do not mention this notice.`;
  if (!previousReport) return `${problems}\nWrite the report again from scratch, fixing these problems. The report must appear exactly once.\n${rules}`.trim();
  return `
${problems}

YOUR PREVIOUS REPORT (the one that failed):
=== BEGIN PREVIOUS REPORT ===
${previousReport}
=== END PREVIOUS REPORT ===

Return the corrected report in full. Change only what is needed to fix the problems above — for each flagged quotation,
either replace it with the exact words from the transcript or describe it without quotation marks; for a flagged
❌ line, use a different genuine student sentence or remove that correction. Keep all other text exactly as it is.
${rules}
`.trim();
}

/** 실제 utterances + 측정된 Talk Time + 수업 맥락으로 Output 1/Output 2를 각각 생성·검증한다.
 * 반환 null: API 키 없음 또는 발화 없음. throw: 어느 한 보고서라도 MAX_ATTEMPTS번 안에 검증을 통과하지 못함(이유 포함)
 * — 호출부(processRecording)가 ANALYSIS_FAILED로 기록한다. */
export async function generateAIEvaluationDraft(params: GenerateAIEvaluationParams): Promise<AIEvaluationResult | null> {
  const createMessage = params.createMessage ?? defaultCreateMessage();
  if (!createMessage) return null;

  const roles = toRoleUtterances(params.utterances, params.teacherSpeakerLabel);
  if (roles.length === 0) return null;
  const mapping = describeSpeakerMapping(params.utterances, params.teacherSpeakerLabel);
  const ctx = params.lessonContext;

  const system = [
    "You write reports for an online English tutoring class: Output 1 (student/parent feedback) and",
    "Output 2 (teacher QC evaluation). The skill below is the source of truth for both reports.",
    "",
    "=== SKILL: online-english-feedback (verbatim) ===",
    ONLINE_ENGLISH_FEEDBACK_SKILL,
    "=== END SKILL ===",
    "",
    buildProjectRules({ lessonDurationMinutes: ctx.lessonDurationMinutes, speakerCount: mapping?.speakerCount ?? 0 }),
    "",
    HISTORICAL_CONTEXT_POLICY,
    "",
    ageToneInstruction(ctx.studentAgeBand),
  ].join("\n");

  const baseUserMessage = [
    buildLessonContextBlock(ctx, formatTimestamp(recordingLengthMs(roles))),
    "",
    talkTimeOverrideBlock({
      teacherSeconds: params.talkTime.teacherSpeakingSeconds,
      teacherPercentage: params.talkTime.teacherTalkPercentage,
      studentSeconds: params.talkTime.studentSpeakingSeconds,
      studentPercentage: params.talkTime.studentTalkPercentage,
    }),
    "",
    `SPEAKER MAPPING: roles were assigned by an unverified heuristic (inferred from the transcript text — questions, lesson-management phrases, instructions and reply patterns — not from listening; ${mapping?.speakerCount ?? 0} speaker label(s) detected; confidence: ${mapping?.confidence ?? "low"}).`,
    "",
    "TRANSCRIPT (speaker-labeled, [mm:ss] timestamps):",
    renderSpeakerTranscript(roles),
  ].join("\n");

  // Clear learner errors found by fixed grammar patterns (learnerErrors.ts): shown to the model for Output 1 and re-checked by the validator.
  const learnerErrors = detectLearnerErrors(roles);

  const validationContext: ValidationContext = {
    roles,
    lessonDateISO: ctx.lessonDate,
    lessonDurationMinutes: ctx.lessonDurationMinutes,
    ageBand: ctx.studentAgeBand,
    talkTime: params.talkTime,
  };

  async function generateOne(kind: OutputKind): Promise<{ text: string; attempts: number; records: AttemptRecord[] }> {
    const spec = OUTPUTS[kind];
    let issues: string[] = [];
    let previousReport: string | null = null;
    const records: AttemptRecord[] = [];
    const startedAt = Date.now();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1 && Date.now() - startedAt > ATTEMPT_DEADLINE_MS) {
        records.push(recordAttempt(attempt, null, "time_budget"));
        throw new EvaluationNotAcceptedError(spec.label, records);
      }
      const userMessage = [
        baseUserMessage,
        "",
        ...(kind === "student" && learnerErrors.length > 0 ? [formatLearnerErrorBlock(learnerErrors), ""] : []),
        finalChecklist(kind, ctx, params.talkTime, kind === "student" ? learnerErrors : []),
        "",
        spec.request,
        ...(attempt > 1 ? ["", retryNotice(issues, previousReport)] : []),
      ].join("\n");
      const message = await createMessage!({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system,
        messages: [{ role: "user", content: userMessage }],
        tools: [
          {
            name: spec.tool,
            description: `Submit the completed ${spec.label}. The field holds ONE complete report, written once.`,
            input_schema: {
              type: "object",
              properties: { report: { type: "string", description: "The complete report as plain text, ready to store as-is." } },
              required: ["report"],
            },
          },
        ],
        tool_choice: { type: "tool", name: spec.tool },
      });

      if (message.stop_reason === "max_tokens") {
        issues = [`the output was cut off at the token limit (${MAX_TOKENS}); keep the report within the skill's length for this class`];
        previousReport = null;
        records.push(recordAttempt(attempt, null, "response_cut_off"));
        continue;
      }
      const toolUse = message.content.find((b) => b.type === "tool_use" && b.name === spec.tool);
      const text = toolUse ? parseReport(toolUse.input) : null;
      if (!text) {
        issues = ["the response did not contain the report as non-empty text"];
        previousReport = null;
        records.push(recordAttempt(attempt, null, "response_empty"));
        continue;
      }
      const validation = kind === "student" ? validateStudentFeedback(text, validationContext) : validateTeacherQc(text, validationContext);
      records.push(recordAttempt(attempt, validation.issues));
      if (validation.ok) return { text, attempts: attempt, records };
      // the validators' sentences go back to Claude (that is how it learns what to fix) but are NOT kept: only the categories are (records)
      issues = validation.issues;
      previousReport = text;
    }
    throw new EvaluationNotAcceptedError(spec.label, records);
  }

  const [student, teacher] = await Promise.allSettled([generateOne("student"), generateOne("teacher")]);

  const recordsOf = (r: PromiseSettledResult<{ records: AttemptRecord[] }>): AttemptRecord[] =>
    r.status === "fulfilled" ? r.value.records : r.reason instanceof EvaluationNotAcceptedError ? r.reason.records : [];
  const diagnostics: GenerationDiagnostics = { student: recordsOf(student), teacherQc: recordsOf(teacher) };
  try {
    params.onDiagnostics?.(diagnostics); // categories and counts only; a failing logger must never fail the evaluation
  } catch {
    /* ignore */
  }

  // The student report is the deliverable: without it there is nothing to review, so the whole analysis fails (ANALYSIS_FAILED) as before.
  if (student.status === "rejected") {
    const reasons = [student, teacher].flatMap((r) => (r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []));
    throw new Error(reasons.join(" | "));
  }

  // The teacher QC is an internal report. If it could not be validated, the passing student report is still returned (teacherQc null) instead of
  // being thrown away. The reason is a category summary (never report or transcript text); an unexpected error keeps only its type name.
  if (teacher.status === "rejected") {
    const failure =
      teacher.reason instanceof EvaluationNotAcceptedError
        ? teacher.reason.message
        : `${OUTPUTS.teacher.label} failed with an unexpected error (${teacher.reason instanceof Error ? teacher.reason.name : "unknown"})`;
    return {
      studentFeedback: student.value.text,
      teacherQc: null,
      teacherQcFailure: failure,
      attempts: { studentFeedback: student.value.attempts, teacherQc: diagnostics.teacherQc.length },
      diagnostics,
    };
  }
  return {
    studentFeedback: student.value.text,
    teacherQc: teacher.value.text,
    attempts: { studentFeedback: student.value.attempts, teacherQc: teacher.value.attempts },
    diagnostics,
  };
}
