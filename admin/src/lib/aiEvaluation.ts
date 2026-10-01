// Audio Automatic Evaluation의 Claude adapter. 평가 기준 자체는 전부
// evaluationSkillRules.ts(online-english-feedback skill의 production snapshot)가
// Single Source of Truth다 — 이 파일은 그 규칙 + transcript + 명시적 LESSON CONTEXT
// (날짜/학생 맥락) + application이 계산한 Talk Time을 Anthropic API 호출로 조립하고,
// 응답을 검증해 Output 1(학생 피드백)/Output 2(강사 QC)로 분리하는 adapter일 뿐이다.
// 평가 기준을 여기서 다시 정의하지 않는다.
import Anthropic from "@anthropic-ai/sdk";
import {
  GROUNDING_RULES,
  HISTORICAL_CONTEXT_POLICY,
  ATTITUDE_NOTE_RULE,
  STUDENT_FEEDBACK_RULES,
  TEACHER_QC_RULES,
  ageToneInstruction,
  talkTimeOverrideBlock,
  checkNoUngroundedHistoricalClaims,
  type AgeBand,
} from "./evaluationSkillRules";
import type { TalkTimeResult } from "./talkTime";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface LessonContext {
  /** ClassSession.scheduledAt에서 애플리케이션이 뽑은 실제 수업 날짜("YYYY-MM-DD").
   * Claude가 추측하지 않는다 — 2026-10-01 실제 E2E 테스트에서 날짜를 아예 안 줬더니
   * 임의 날짜("25 January 2025")를 지어낸 사례가 있어 반드시 명시적으로 전달한다. */
  lessonDate: string;
  lessonDurationMinutes: number;
  /** null이면 evaluationSkillRules.ts의 fallback(성인/직접 호칭)을 적용 — AI가
   * transcript로 나이를 추측하지 않는다(코드가 Student.birthDate로 미리 계산해 전달). */
  studentAgeBand: AgeBand;
  /** 참고용 문화적 맥락(예: "KOREA") — Output 1은 언어와 무관하게 항상 영어로 쓴다
   * (기존 bilingual 파이프라인이 발행 시점에 번역). null이면 지역 맥락 없이 진행. */
  studentRegion: string | null;
  textbookName: string | null;
  classMethod: string | null;
}

export interface AIEvaluationResult {
  /** Output 1 — 학생/학부모용, 영어 canonical draft. AudioRecording.aiDraft에 저장. */
  studentFeedback: string;
  /** Output 2 — 강사 QC, 항상 영어. AudioRecording.teacherQcDraft에 저장, 학생에게 노출 안 함. */
  teacherQc: string;
}

const RESULT_TOOL_NAME = "submit_evaluation_result";

/** API transport 레이어일 뿐 평가 기준이 아니다 — 필드 2개(studentFeedback/teacherQc)는
 * evaluationSkillRules.ts가 요구하는 "완성된 포맷의 평문 텍스트" 그대로를 담는다. */
export function validateAIEvaluationResult(input: unknown): AIEvaluationResult | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  if (typeof v.studentFeedback !== "string" || !v.studentFeedback.trim()) return null;
  if (typeof v.teacherQc !== "string" || !v.teacherQc.trim()) return null;
  return { studentFeedback: v.studentFeedback.trim(), teacherQc: v.teacherQc.trim() };
}

function buildLessonContextBlock(ctx: LessonContext): string {
  return `
LESSON CONTEXT (this is all the context you have — see HISTORICAL CONTEXT POLICY below):
lessonDate: ${ctx.lessonDate}
lessonDurationMinutes: ${ctx.lessonDurationMinutes}
studentAgeBand: ${ctx.studentAgeBand}
studentRegion: ${ctx.studentRegion ?? "unknown"}
textbook: ${ctx.textbookName ?? "unknown"}
classType: ${ctx.classMethod ?? "unknown"}

historicalContextAvailable: false
historicalContext: null
`.trim();
}

/** transcript + 계산된 Talk Time + 명시적 lesson/student context로부터 Output1/Output2를
 * 동시에 생성한다. API 키 미설정/호출 실패/응답 검증 실패/historical-claim 환각 탐지
 * 시 null — 평가서 작성 자체(강사의 수동 작성)를 막아서는 안 되므로 호출부가 null을
 * 폴백으로 처리해야 한다. 실패 사유는 throw된 Error의 message로 호출부(background
 * function)의 기존 catch가 그대로 errorMessage에 기록한다. */
export async function generateAIEvaluationDraft(params: {
  transcript: string;
  talkTime: TalkTimeResult;
  lessonContext: LessonContext;
}): Promise<AIEvaluationResult | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const system = [
    "You generate two reports from an online English tutoring class transcript:",
    "Output 1 (student/parent feedback) and Output 2 (teacher QC evaluation).",
    "",
    GROUNDING_RULES,
    "",
    HISTORICAL_CONTEXT_POLICY,
    "",
    ageToneInstruction(params.lessonContext.studentAgeBand),
    "",
    STUDENT_FEEDBACK_RULES,
    "",
    ATTITUDE_NOTE_RULE,
    "",
    TEACHER_QC_RULES,
  ].join("\n");

  const userMessage = [
    buildLessonContextBlock(params.lessonContext),
    "",
    talkTimeOverrideBlock({
      teacherSeconds: params.talkTime.teacherSpeakingSeconds,
      teacherPercentage: params.talkTime.teacherTalkPercentage,
      studentSeconds: params.talkTime.studentSpeakingSeconds,
      studentPercentage: params.talkTime.studentTalkPercentage,
    }),
    "",
    `TRANSCRIPT (speaker-labeled):\n${params.transcript}`,
  ].join("\n");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userMessage }],
    tools: [
      {
        name: RESULT_TOOL_NAME,
        description: "Submit the two completed reports.",
        input_schema: {
          type: "object",
          properties: {
            studentFeedback: { type: "string", description: "Output 1, complete and ready to store as-is." },
            teacherQc: { type: "string", description: "Output 2, complete and ready to store as-is." },
          },
          required: ["studentFeedback", "teacherQc"],
        },
      },
    ],
    tool_choice: { type: "tool", name: RESULT_TOOL_NAME },
  });

  const toolUse = message.content.find((b) => b.type === "tool_use" && b.name === RESULT_TOOL_NAME);
  if (!toolUse || toolUse.type !== "tool_use") return null;

  const result = validateAIEvaluationResult(toolUse.input);
  if (!result) return null;

  // Post-generation application-level 검증 — HISTORICAL_CONTEXT_POLICY를 prompt에
  // 넣는 것만으로는 100% 보장되지 않으므로, 저장 전에 한 번 더 걸러낸다(LLM 재호출
  // 없이, 순수 패턴 검사만).
  const feedbackCheck = checkNoUngroundedHistoricalClaims(result.studentFeedback, params.lessonContext.lessonDate);
  const qcCheck = checkNoUngroundedHistoricalClaims(result.teacherQc, params.lessonContext.lessonDate);
  if (!feedbackCheck.ok || !qcCheck.ok) {
    throw new Error(
      `AI draft rejected — ungrounded historical claim detected: ${[...feedbackCheck.issues, ...qcCheck.issues].join("; ")}`,
    );
  }

  return result;
}
