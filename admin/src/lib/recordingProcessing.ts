// process-recording-background.ts의 처리 로직 본체. DB/AssemblyAI/Claude 접근은 전부
// deps로 주입받는다 — Netlify 함수 파일은 Prisma 기반 deps를 조립해 넘기기만 하고,
// admin/scripts/test-recordingProcessing.ts는 같은 로직을 in-memory fake deps로
// 검증한다(인증 거절, TRANSCRIBED 복구, 중복 호출 시 ANALYZING 선점 1회).
import { computeTalkTime, guessTeacherSpeakerLabel } from "./talkTime";
import type { TalkTimeResult, Utterance } from "./talkTime";
import type { AssemblyAITranscriptResult } from "./assemblyai";
import type { AIEvaluationResult, LessonContext } from "./aiEvaluation";
import { isAuthorizedProcessingRequest, RECORDING_PROCESSING_SECRET_HEADER } from "./recordingProcessingAuth";

export interface RecordingForProcessing {
  id: number;
  providerTranscriptId: string | null;
  lessonContext: LessonContext;
}

export interface AnalysisClaimData extends TalkTimeResult {
  transcript: string | null;
  duration: number | null;
}

export interface ProcessRecordingDeps {
  findRecording(id: number): Promise<RecordingForProcessing | null>;
  fetchTranscript(transcriptId: string): Promise<AssemblyAITranscriptResult | null>;
  /** 정확히 "TRANSCRIBED"인 레코드만 ANALYZING으로 전이시키는 단일 조건부 UPDATE
   * (updateMany + where 상태 조건). 이 호출이 실제로 1행을 바꿨으면 true. */
  claimForAnalysis(id: number, data: AnalysisClaimData): Promise<boolean>;
  /** fromStatus 상태일 때만 ANALYSIS_FAILED로 바꾼다 — 중복 호출된 쪽의 실패가 이미
   * 다른 호출이 선점/완료한 레코드(ANALYZING/NEEDS_REVIEW)를 덮어쓰지 않게 한다. */
  markFailed(id: number, fromStatus: "TRANSCRIBED" | "ANALYZING", errorMessage: string): Promise<void>;
  saveDraft(id: number, result: AIEvaluationResult): Promise<void>;
  /** Claude에는 plain text가 아니라 원본 utterances(화자·타임스탬프 포함)를 넘긴다. */
  generateDraft(params: {
    utterances: Utterance[];
    teacherSpeakerLabel: string | null;
    talkTime: TalkTimeResult;
    lessonContext: LessonContext;
  }): Promise<AIEvaluationResult | null>;
}

export type ProcessRecordingOutcome =
  | "not_found"
  | "transcript_unavailable"
  | "already_claimed"
  | "draft_generation_failed"
  | "ok"
  | "error";

export async function processRecording(audioRecordingId: number, deps: ProcessRecordingDeps): Promise<ProcessRecordingOutcome> {
  const recording = await deps.findRecording(audioRecordingId);
  if (!recording || !recording.providerTranscriptId) return "not_found";

  // 선점(claim) 전에는 TRANSCRIBED 상태만, 선점 후에는 ANALYZING 상태만 이 호출이
  // 실패로 바꿀 수 있다.
  let ownedStatus: "TRANSCRIBED" | "ANALYZING" = "TRANSCRIBED";
  try {
    const transcript = await deps.fetchTranscript(recording.providerTranscriptId);
    if (!transcript || transcript.status !== "completed" || !transcript.utterances || transcript.utterances.length === 0) {
      await deps.markFailed(recording.id, ownedStatus, "AssemblyAI transcript not completed or missing utterances");
      return "transcript_unavailable";
    }

    const teacherLabel = guessTeacherSpeakerLabel(transcript.utterances);
    const talkTime = teacherLabel
      ? computeTalkTime(transcript.utterances, teacherLabel)
      : { teacherSpeakingSeconds: 0, studentSpeakingSeconds: 0, teacherTalkPercentage: 0, studentTalkPercentage: 0 };

    // webhook 쪽 race 방지(updateMany + where 상태 조건)와 같은 패턴을 여기서도
    // 쓴다 — 이 함수 자체가 중복 호출될 가능성(webhook 재전송, Netlify 재시도,
    // recover-transcribed-recordings의 재트리거 등)에 대비한 두 번째 방어선이다.
    // 정확히 "TRANSCRIBED" 상태인 레코드만 이 호출이 ANALYZING으로 전이시킬 수 있고,
    // 전이에 성공한 호출만 Claude를 부른다 — 두 호출이 동시에 들어와도 Claude API가
    // 중복 호출되거나 aiDraft가 두 번 겹쳐 쓰이지 않는다.
    const claimed = await deps.claimForAnalysis(recording.id, {
      transcript: transcript.text,
      duration: transcript.audio_duration ?? null,
      ...talkTime,
    });
    if (!claimed) {
      // 다른 호출이 이미 이 레코드를 선점했다(중복 invocation) — 여기서 조용히 종료.
      return "already_claimed";
    }
    ownedStatus = "ANALYZING";

    const result = await deps.generateDraft({
      utterances: transcript.utterances,
      teacherSpeakerLabel: teacherLabel,
      talkTime,
      lessonContext: recording.lessonContext,
    });
    if (!result) {
      await deps.markFailed(recording.id, ownedStatus, "Claude draft generation failed or ANTHROPIC_API_KEY not configured");
      return "draft_generation_failed";
    }

    await deps.saveDraft(recording.id, result);
    return "ok";
  } catch (err) {
    await deps.markFailed(recording.id, ownedStatus, err instanceof Error ? err.message : String(err));
    return "error";
  }
}

/** Background Function의 HTTP 진입점. 인증은 본문 파싱/DB 조회보다 먼저 확인한다 —
 * 인증되지 않은 요청은 deps를 전혀 건드리지 않고 거절된다. */
export async function handleProcessRecordingRequest(
  req: Request,
  expectedSecret: string | null,
  deps: ProcessRecordingDeps,
): Promise<Response> {
  if (!expectedSecret) {
    return new Response("processing_not_configured", { status: 503 });
  }
  if (!isAuthorizedProcessingRequest(req.headers.get(RECORDING_PROCESSING_SECRET_HEADER), expectedSecret)) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: { audioRecordingId?: unknown } | null;
  try {
    body = (await req.json()) as { audioRecordingId?: unknown } | null;
  } catch {
    return new Response("invalid_json", { status: 400 });
  }
  const audioRecordingId = body?.audioRecordingId;
  if (typeof audioRecordingId !== "number") {
    return new Response("missing_audioRecordingId", { status: 400 });
  }

  const outcome = await processRecording(audioRecordingId, deps);
  return new Response(outcome, { status: outcome === "not_found" ? 404 : 200 });
}
