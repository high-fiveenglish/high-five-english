// Audio Automatic Evaluation의 Claude adapter. 평가 기준 자체는 전부
// evaluationSkillRules.ts(online-english-feedback skill의 production snapshot)가
// Single Source of Truth다 — 이 파일은 그 규칙 + transcript + student context +
// application이 계산한 Talk Time을 Anthropic API 호출로 조립하고, 응답을 검증해
// Output 1(학생 피드백)/Output 2(강사 QC)로 분리하는 adapter일 뿐이다. 평가 기준을
// 여기서 다시 정의하지 않는다.
import Anthropic from "@anthropic-ai/sdk";
import {
  GROUNDING_RULES,
  ATTITUDE_NOTE_RULE,
  STUDENT_FEEDBACK_RULES,
  TEACHER_QC_RULES,
  ageBandFromBirthDate,
  ageToneInstruction,
  talkTimeOverrideBlock,
} from "./evaluationSkillRules";
import type { TalkTimeResult } from "./talkTime";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface StudentContext {
  /** null이면 evaluationSkillRules.ts의 fallback(성인/직접 호칭)을 적용한다 — AI가 transcript로 나이를 추측하지 않는다. */
  birthDate: Date | null;
  textbookName: string | null;
  classMethod: string | null;
  durationMin: number;
}

export interface AIEvaluationResult {
  /** Output 1 — 학생/학부모용, 영어 canonical draft. AudioRecording.aiDraft에 저장. */
  studentFeedback: string;
  /** Output 2 — 강사 QC, 항상 영어. AudioRecording.teacherQcDraft에 저장, 학생에게 노출 안 함. */
  teacherQc: string;
}

const RESULT_TOOL_NAME = "submit_evaluation_result";

/** API transport 레이어일 뿐 평가 기준이 아니다 — 필드 2개(studentFeedback/teacherQc)는
 * evaluationSkillRules.ts가 요구하는 "완성된 포맷의 평문 텍스트" 그대로를 담는다.
 * EvaluationContent.tsx가 인식하는 이모지/①②③/❌✅ 관례를 skill 자체가 이미 쓰고
 * 있으므로, 별도의 구조 변환(formatter) 없이 studentFeedback을 거의 그대로
 * LessonEvaluation.content로 쓸 수 있다. */
export function validateAIEvaluationResult(input: unknown): AIEvaluationResult | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  if (typeof v.studentFeedback !== "string" || !v.studentFeedback.trim()) return null;
  if (typeof v.teacherQc !== "string" || !v.teacherQc.trim()) return null;
  return { studentFeedback: v.studentFeedback.trim(), teacherQc: v.teacherQc.trim() };
}

/** transcript + 계산된 Talk Time + student context로부터 Output1/Output2를 동시에
 * 생성한다. API 키 미설정/호출 실패/응답 검증 실패 시 null — 평가서 작성 자체(강사의
 * 수동 작성)를 막아서는 안 되므로 호출부가 null을 폴백으로 처리해야 한다. */
export async function generateAIEvaluationDraft(params: {
  transcript: string;
  talkTime: TalkTimeResult;
  student: StudentContext;
}): Promise<AIEvaluationResult | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const ageBand = ageBandFromBirthDate(params.student.birthDate);
  const contextLines = [
    ageToneInstruction(ageBand),
    params.student.textbookName ? `Textbook: ${params.student.textbookName}` : null,
    params.student.classMethod ? `Class type: ${params.student.classMethod}` : null,
    `Class duration: ${params.student.durationMin} minutes`,
  ].filter((l): l is string => !!l);

  const system = [
    "You generate two reports from an online English tutoring class transcript:",
    "Output 1 (student/parent feedback) and Output 2 (teacher QC evaluation).",
    "",
    GROUNDING_RULES,
    "",
    STUDENT_FEEDBACK_RULES,
    "",
    ATTITUDE_NOTE_RULE,
    "",
    TEACHER_QC_RULES,
  ].join("\n");

  const userMessage = [
    `Transcript (speaker-labeled):\n${params.transcript}`,
    "",
    contextLines.join("\n"),
    "",
    talkTimeOverrideBlock({
      teacherSeconds: params.talkTime.teacherSpeakingSeconds,
      teacherPercentage: params.talkTime.teacherTalkPercentage,
      studentSeconds: params.talkTime.studentSpeakingSeconds,
      studentPercentage: params.talkTime.studentTalkPercentage,
    }),
  ].join("\n");

  try {
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

    return validateAIEvaluationResult(toolUse.input);
  } catch {
    return null;
  }
}
