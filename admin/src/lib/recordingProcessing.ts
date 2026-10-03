// process-recording-background.ts의 처리 로직 본체. DB/AssemblyAI/Claude 접근은 전부
// deps로 주입받는다 — Netlify 함수 파일은 Prisma 기반 deps를 조립해 넘기기만 하고,
// admin/scripts/test-recordingProcessing.ts는 같은 로직을 in-memory fake deps로
// 검증한다(인증 거절, TRANSCRIBED 복구, 중복 호출 시 ANALYZING 선점 1회).
import { computeTalkTime } from "./talkTime";
import type { TalkTimeResult, Utterance } from "./talkTime";
import { inferSpeakerRoles, summarizeInference, type SpeakerRoleInference } from "./speakerRoles";
import type { AssemblyAITranscriptResult } from "./assemblyai";
import type { AIEvaluationResult, LessonContext } from "./aiEvaluation";
import { isAuthorizedProcessingRequest, RECORDING_PROCESSING_SECRET_HEADER } from "./recordingProcessingAuth";
import { truncateErrorMessage } from "./recordingWorkflow";
import { parseStoredUtterances, projectUtterancesForStorage, speakerLabelsOf } from "./speakerConfirmation";

export interface RecordingForProcessing {
  id: number;
  providerTranscriptId: string | null;
  processingStatus: string;
  /** Set once the teacher has chosen the teacher voice (Teacher Confirmation). */
  confirmedTeacherSpeaker: string | null;
  /** Raw JSON column: the AssemblyAI utterances saved when the roles needed confirming. */
  storedUtterances: unknown;
  lessonContext: LessonContext;
}

export interface AnalysisClaimData extends TalkTimeResult {
  /** Omitted when the stored values must stay as they are (analysis resumed from stored utterances). */
  transcript?: string | null;
  duration?: number | null;
  /** "AUTO" when the code itself was confident about the roles. */
  speakerMappingStatus?: "AUTO";
}

export type ClaimableStatus = "TRANSCRIBED" | "TEACHER_SPEAKER_CONFIRMED";

/** What is saved when the roles need the teacher's confirmation: enough to resume without calling AssemblyAI again. */
export interface TranscriptSnapshot {
  utterances: Utterance[];
  transcript: string | null;
  duration: number | null;
}

export interface ProcessRecordingDeps {
  findRecording(id: number): Promise<RecordingForProcessing | null>;
  fetchTranscript(transcriptId: string): Promise<AssemblyAITranscriptResult | null>;
  /** 정확히 fromStatus인 레코드만 ANALYZING으로 전이시키는 단일 조건부 UPDATE
   * (updateMany + where 상태 조건). 이 호출이 실제로 1행을 바꿨으면 true. */
  claimForAnalysis(id: number, data: AnalysisClaimData, fromStatus: ClaimableStatus): Promise<boolean>;
  /** fromStatus 상태일 때만 ANALYSIS_FAILED로 바꾼다 — 중복 호출된 쪽의 실패가 이미
   * 다른 호출이 선점/완료한 레코드(ANALYZING/NEEDS_REVIEW)를 덮어쓰지 않게 한다. */
  markFailed(id: number, fromStatus: ClaimableStatus | "ANALYZING", errorMessage: string): Promise<void>;
  /** The roles could not be confirmed automatically: TRANSCRIBED -> NEEDS_SPEAKER_CONFIRMATION (single conditional UPDATE, so a
   * duplicate invocation changes nothing) and the utterances are kept so the analysis can resume WITHOUT calling AssemblyAI again.
   * The message holds evidence counts only, never transcript text. */
  markNeedsSpeakerConfirmation(id: number, message: string, snapshot: TranscriptSnapshot): Promise<void>;
  /** Test seam: defaults to the real inferSpeakerRoles. */
  inferRoles?: (utterances: Utterance[]) => SpeakerRoleInference;
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
  | "transcript_fetch_failed"
  | "needs_speaker_confirmation"
  | "already_claimed"
  | "draft_generation_failed"
  | "ok"
  | "error";

export async function processRecording(audioRecordingId: number, deps: ProcessRecordingDeps): Promise<ProcessRecordingOutcome> {
  const recording = await deps.findRecording(audioRecordingId);
  if (!recording || !recording.providerTranscriptId) return "not_found";

  // Only these states can start an analysis. Everything else was already claimed, finished or is waiting for the teacher — and nothing
  // is fetched or generated for it (no AssemblyAI call, no Claude call).
  const startStatus = recording.processingStatus;
  if (startStatus === "NEEDS_SPEAKER_CONFIRMATION") return "needs_speaker_confirmation";
  if (startStatus !== "TRANSCRIBED" && startStatus !== "TEACHER_SPEAKER_CONFIRMED") return "already_claimed";

  // 선점(claim) 전에는 시작 상태(TRANSCRIBED / TEACHER_SPEAKER_CONFIRMED)만, 선점 후에는 ANALYZING 상태만 이 호출이
  // 실패로 바꿀 수 있다.
  let ownedStatus: ClaimableStatus | "ANALYZING" = startStatus;
  try {
    let utterances: Utterance[];
    let teacherLabel: string;
    let claimExtras: Pick<AnalysisClaimData, "transcript" | "duration" | "speakerMappingStatus">;

    if (startStatus === "TEACHER_SPEAKER_CONFIRMED") {
      // Resume after Teacher Confirmation: the stored utterances and the label the teacher chose are used as they are. AssemblyAI is NOT
      // called, so the transcript cannot change between the first pass and the re-analysis, and no transcription cost is repeated.
      const stored = parseStoredUtterances(recording.storedUtterances);
      const label = recording.confirmedTeacherSpeaker;
      if (!stored || !label || !speakerLabelsOf(stored).includes(label)) {
        await deps.markFailed(recording.id, ownedStatus, "Stored transcript or confirmed teacher speaker is invalid");
        return "transcript_unavailable";
      }
      utterances = stored;
      teacherLabel = label;
      claimExtras = {};
    } else {
      // transcript를 못 가져온 것(네트워크 오류·타임아웃·AssemblyAI 4xx/5xx·아직 processing)은 일시적
      // 문제일 수 있다 — 아직 비용이 드는 일(Claude)을 하지 않았으므로 레코드를 TRANSCRIBED에 그대로
      // 둔다. recover-transcribed-recordings가 주기적으로 다시 시도하고, 24시간이 지나도 안 되면
      // ANALYSIS_FAILED로 끝낸다(무한 재시도 없음). 영구적인 실패로 바로 확정하는 것은 AssemblyAI가
      // "끝났다/실패했다"고 분명히 답한 경우뿐이다.
      let transcript: AssemblyAITranscriptResult | null;
      try {
        transcript = await deps.fetchTranscript(recording.providerTranscriptId);
      } catch {
        return "transcript_fetch_failed";
      }
      if (!transcript || transcript.status === "processing" || transcript.status === "queued") {
        return "transcript_fetch_failed";
      }
      if (transcript.status !== "completed" || !transcript.utterances || transcript.utterances.length === 0) {
        await deps.markFailed(recording.id, ownedStatus, "AssemblyAI transcript not completed or missing utterances");
        return "transcript_unavailable";
      }

      // Who is the teacher? The old "first speaker" rule failed on real recordings (a student spoke first), and with swapped roles
      // Talk Time, reading detection and both reports are wrong. Only a HIGH-confidence inference proceeds; otherwise NO Claude
      // call is made, the transcript is kept, and the record waits for the teacher to choose the voice (speakerRoles.ts has the
      // evidence rules, speakerConfirmation.ts the confirmation).
      const inference = (deps.inferRoles ?? inferSpeakerRoles)(transcript.utterances);
      if (inference.confidence !== "HIGH" || inference.teacherLabel === null) {
        await deps.markNeedsSpeakerConfirmation(recording.id, summarizeInference(inference), {
          // Only speaker/start/end/text are kept — no word-level data or other AssemblyAI metadata (see projectUtterancesForStorage).
          utterances: projectUtterancesForStorage(transcript.utterances),
          transcript: transcript.text,
          duration: transcript.audio_duration ?? null,
        });
        return "needs_speaker_confirmation";
      }
      utterances = transcript.utterances;
      teacherLabel = inference.teacherLabel;
      claimExtras = { transcript: transcript.text, duration: transcript.audio_duration ?? null, speakerMappingStatus: "AUTO" };
    }

    const talkTime = computeTalkTime(utterances, teacherLabel);

    // webhook 쪽 race 방지(updateMany + where 상태 조건)와 같은 패턴을 여기서도
    // 쓴다 — 이 함수 자체가 중복 호출될 가능성(webhook 재전송, Netlify 재시도,
    // recover-transcribed-recordings의 재트리거, 교사의 중복 확인 요청 등)에 대비한 두 번째 방어선이다.
    // 정확히 시작 상태인 레코드만 이 호출이 ANALYZING으로 전이시킬 수 있고,
    // 전이에 성공한 호출만 Claude를 부른다 — 두 호출이 동시에 들어와도 Claude API가
    // 중복 호출되거나 aiDraft가 두 번 겹쳐 쓰이지 않는다.
    const claimed = await deps.claimForAnalysis(recording.id, { ...claimExtras, ...talkTime }, startStatus);
    if (!claimed) {
      // 다른 호출이 이미 이 레코드를 선점했다(중복 invocation) — 여기서 조용히 종료.
      return "already_claimed";
    }
    ownedStatus = "ANALYZING";

    const result = await deps.generateDraft({
      utterances,
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
    await deps.markFailed(recording.id, ownedStatus, truncateErrorMessage(err instanceof Error ? err.message : String(err)));
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
  if (typeof audioRecordingId !== "number" || !Number.isSafeInteger(audioRecordingId) || audioRecordingId <= 0) {
    return new Response("missing_audioRecordingId", { status: 400 });
  }

  const outcome = await processRecording(audioRecordingId, deps);
  return new Response(outcome, { status: outcome === "not_found" ? 404 : 200 });
}
