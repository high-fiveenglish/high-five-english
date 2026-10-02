// Audio Automatic Evaluation의 Claude adapter.
//
// 영어 피드백의 평가 기준(내용·구조·어조·금지사항)은 online-english-feedback Skill이 Source of Truth이며,
// Skill 원문을 그대로(./skill/onlineEnglishFeedbackSkill.ts) prompt에 포함한다 — 여기서 다시 정의하거나
// 요약하지 않는다. 이 파일은 (1) Skill 원문 + (2) projectEvaluationRules.ts의 애플리케이션 규칙 + (3) 화자·
// 타임스탬프가 붙은 실제 발화 + (4) application이 측정한 Talk Time을 조립해 호출하고, (5) 결과를
// evaluationValidation.ts의 결정적 검사로 확인하며, 실패하면 이유를 알려 1회만 다시 생성한다.
import Anthropic from "@anthropic-ai/sdk";
import { ONLINE_ENGLISH_FEEDBACK_SKILL } from "./skill/onlineEnglishFeedbackSkill";
import {
  HISTORICAL_CONTEXT_POLICY,
  ageToneInstruction,
  buildProjectRules,
  talkTimeOverrideBlock,
  type AgeBand,
} from "./projectEvaluationRules";
import { validateEvaluationOutput } from "./evaluationValidation";
import {
  describeSpeakerMapping,
  formatTimestamp,
  recordingLengthMs,
  renderSpeakerTranscript,
  toRoleUtterances,
} from "./speakerTranscript";
import type { TalkTimeResult, Utterance } from "./talkTime";

const MODEL = "claude-haiku-4-5";
// 출력이 두 보고서(약 3~4천 토큰, 50분 수업은 더 큼)이므로 여유를 둔다. stop_reason이 max_tokens면 실패로 처리한다.
const MAX_TOKENS = 8192;
const MAX_ATTEMPTS = 2;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
  /** Output 2 — 강사 QC, 항상 영어. AudioRecording.teacherQcDraft에 저장, 학생에게 노출 안 함. */
  teacherQc: string;
  /** 통과하기까지 생성 시도 횟수(1 또는 2). */
  attempts?: number;
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
}

const RESULT_TOOL_NAME = "submit_evaluation_result";

/** API transport 레이어일 뿐 평가 기준이 아니다. */
export function validateAIEvaluationResult(input: unknown): { studentFeedback: string; teacherQc: string } | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  if (typeof v.studentFeedback !== "string" || !v.studentFeedback.trim()) return null;
  if (typeof v.teacherQc !== "string" || !v.teacherQc.trim()) return null;
  return { studentFeedback: v.studentFeedback.trim(), teacherQc: v.teacherQc.trim() };
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

function retryNotice(issues: string[]): string {
  return `
VALIDATION FAILED on your previous attempt. Generate BOTH outputs again from scratch and fix exactly these problems:
${issues.map((i) => `- ${i}`).join("\n")}
Do not mention this notice. Each report must appear exactly once. Keep every quotation word-for-word from the
transcript; where you cannot, describe what happened without quotation marks. Do not invent example sentences.
`.trim();
}

/** 실제 utterances + 측정된 Talk Time + 수업 맥락으로 Output 1/Output 2를 생성한다.
 * 반환 null: API 키 없음 또는 발화 없음. throw: 검증을 통과하는 결과를 MAX_ATTEMPTS번 안에 얻지 못함(이유 포함)
 * — 호출부(processRecording)가 ANALYSIS_FAILED로 기록한다. */
export async function generateAIEvaluationDraft(params: GenerateAIEvaluationParams): Promise<AIEvaluationResult | null> {
  const createMessage = params.createMessage ?? defaultCreateMessage();
  if (!createMessage) return null;

  const roles = toRoleUtterances(params.utterances, params.teacherSpeakerLabel);
  if (roles.length === 0) return null;
  const mapping = describeSpeakerMapping(params.utterances, params.teacherSpeakerLabel);
  const ctx = params.lessonContext;

  const system = [
    "You generate two reports from an online English tutoring class: Output 1 (student/parent feedback) and",
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
    `SPEAKER MAPPING: roles were assigned by an unverified heuristic (the first speaker is assumed to be the teacher; ${mapping?.speakerCount ?? 0} speaker label(s) detected; confidence: ${mapping?.confidence ?? "low"}).`,
    "",
    "TRANSCRIPT (speaker-labeled, [mm:ss] timestamps):",
    renderSpeakerTranscript(roles),
  ].join("\n");

  const validationContext = {
    roles,
    lessonDateISO: ctx.lessonDate,
    lessonDurationMinutes: ctx.lessonDurationMinutes,
    ageBand: ctx.studentAgeBand,
    talkTime: params.talkTime,
  };

  let issues: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const message = await createMessage({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: attempt === 1 ? baseUserMessage : `${baseUserMessage}\n\n${retryNotice(issues)}` }],
      tools: [
        {
          name: RESULT_TOOL_NAME,
          description: "Submit the two completed reports. Each field holds ONE complete report, written once.",
          input_schema: {
            type: "object",
            properties: {
              studentFeedback: { type: "string", description: "Output 1, one complete report, ready to store as-is." },
              teacherQc: { type: "string", description: "Output 2, one complete report, ready to store as-is." },
            },
            required: ["studentFeedback", "teacherQc"],
          },
        },
      ],
      tool_choice: { type: "tool", name: RESULT_TOOL_NAME },
    });

    if (message.stop_reason === "max_tokens") {
      issues = [`the output was cut off at the token limit (${MAX_TOKENS}); keep each report within the skill's length for this class`];
      continue;
    }
    const toolUse = message.content.find((b) => b.type === "tool_use" && b.name === RESULT_TOOL_NAME);
    const result = toolUse ? validateAIEvaluationResult(toolUse.input) : null;
    if (!result) {
      issues = ["the response did not contain both studentFeedback and teacherQc as non-empty text"];
      continue;
    }

    const validation = validateEvaluationOutput(result, validationContext);
    if (validation.ok) return { ...result, attempts: attempt };
    issues = validation.issues;
  }

  throw new Error(`AI draft rejected after ${MAX_ATTEMPTS} attempts — ${issues.join("; ")}`);
}
