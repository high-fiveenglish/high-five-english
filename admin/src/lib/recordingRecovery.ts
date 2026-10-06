// TRANSCRIBED에 멈춘 AudioRecording 복구 로직. assemblyai-webhook은 TRANSCRIBED로
// 전이시킨 직후 background function을 호출하는데, 그 호출이 일시적으로 실패하면
// (네트워크 오류, 서버리스 런타임이 요청 전송 전에 종료 등) 레코드가 TRANSCRIBED에
// 영원히 남는다. background function은 실행되기만 하면 레코드를 반드시
// TRANSCRIBED 밖으로 옮기므로(ANALYZING 선점 또는 ANALYSIS_FAILED), "일정 시간 이상
// TRANSCRIBED에 머문 레코드" = "background 호출이 도달하지 못한 레코드"로 보고
// recover-transcribed-recordings(Netlify Scheduled Function)가 주기적으로 재트리거한다.
//
// 이 복구는 idempotent하다 — 재트리거된 background function도 기존과 같은 원자적
// ANALYZING 선점(updateMany where processingStatus = "TRANSCRIBED")을 거치므로,
// 원래 호출이 늦게 도착하거나 복구가 여러 번 겹쳐도 Claude는 한 번만 호출된다.
// DB/네트워크 접근은 deps로 주입받는다(admin/scripts/test-recordingProcessing.ts).
//
// ANALYZING에 멈춘 레코드(background function이 선점한 뒤 15분 제한 초과·런타임 종료로
// 끝나지 못한 경우)는 자동으로 다시 돌리지 않고 ANALYSIS_FAILED로 끝낸다 — 선점한 호출이
// 아직 Claude를 부르고 있을 수 있어 재실행하면 Claude가 중복 호출되고, 무한 재시도도
// 피하기 위함이다. 이렇게 해야 강사 화면이 "AI draft 생성 중"에서 영원히 멈추지 않는다.
import { ANALYZING_STUCK_AFTER_MS } from "./recordingWorkflow";

/** webhook이 방금 TRANSCRIBED로 바꾼 레코드는 정상 경로의 background 호출이 아직 진행
 * 중일 수 있으므로 건드리지 않는다. */
export const TRANSCRIBED_RECOVERY_GRACE_MS = 10 * 60 * 1000;

/** 이 시간 이상 TRANSCRIBED에 머문 레코드는 재트리거를 그만두고 ANALYSIS_FAILED로
 * 표시한다 — 영구적인 설정 문제(비밀값 누락 등)로 무한히 재시도하지 않고, 강사
 * 화면에 실패로 드러나게 하기 위함. */
export const TRANSCRIBED_RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StuckRecording {
  id: number;
  /** 마지막 상태 전이 시각(AudioRecording.updatedAt) — TRANSCRIBED로 바뀐 시각. */
  updatedAt: Date;
}

export interface RecoveryDeps {
  /** processingStatus = "TRANSCRIBED" 이고 updatedAt < olderThan 인 레코드. */
  findStuckTranscribed(olderThan: Date): Promise<StuckRecording[]>;
  /** 여전히 TRANSCRIBED일 때만 ANALYSIS_FAILED로 바꾼다(조건부 단일 UPDATE). */
  markRecoveryExhausted(id: number, errorMessage: string): Promise<void>;
  /** background function을 다시 호출. 요청이 수락됐으면 true. */
  triggerProcessing(id: number): Promise<boolean>;
  /** processingStatus = "ANALYZING" 이고 updatedAt < olderThan(= ANALYZING을 선점한 시각보다 오래됨) 인 레코드 id. */
  findStuckAnalyzing(olderThan: Date): Promise<number[]>;
  /** 여전히 ANALYZING이고 updatedAt < olderThan일 때만 ANALYSIS_FAILED로 바꾼다(조건부 단일
   * UPDATE) — 그 사이 정상 완료된 레코드(NEEDS_REVIEW)를 덮어쓰지 않는다. 바꿨으면 true. */
  markAnalysisAbandoned(id: number, olderThan: Date, errorMessage: string): Promise<boolean>;
}

export interface RecoveryReport {
  retriggered: number[];
  triggerFailed: number[];
  exhausted: number[];
  /** ANALYZING에서 멈춰 ANALYSIS_FAILED로 끝낸 레코드. */
  analysisAbandoned: number[];
}

// ── Recordings that are still WAITING for the transcript (UPLOADED / PUBLIC_READY / TRANSCRIBING) ─────────────────────────────────────
// The webhook is the normal way out of these states. If it never arrives (lost delivery, or it came before the transcript id was saved and was
// answered with "unknown id"), the record would wait forever. recoverStuckAwaitingRecordings asks AssemblyAI for the status of the ones that
// have a transcript id, and gives up cleanly on the others. It NEVER submits anything to AssemblyAI (a second submission is a second paid
// transcription): a record without a transcript id is only closed as UPLOAD_FAILED so the teacher can upload it again deliberately.

/** An UPLOADED row that was never completed (the browser closed, the network dropped). The upload URL lives 10 minutes, so this is generous. */
export const AWAITING_UPLOAD_STALE_MS = 2 * 60 * 60 * 1000;
/** PUBLIC_READY lasts only for the moment between "claimed" and "AssemblyAI answered"; this long means the request died in between. */
export const AWAITING_SUBMIT_STALE_MS = 15 * 60 * 1000;
/** Normally the webhook arrives within minutes; only after this long is AssemblyAI asked. */
export const TRANSCRIBING_POLL_AFTER_MS = 15 * 60 * 1000;
/** Still not completed after this long -> TRANSCRIPTION_FAILED (the teacher can upload again). */
export const TRANSCRIBING_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** AssemblyAI lookups per run (a scheduled function has about 30 seconds). */
export const AWAITING_POLLS_PER_RUN = 3;

export interface AwaitingRecording {
  id: number;
  processingStatus: string;
  providerTranscriptId: string | null;
  /** last state change */
  updatedAt: Date;
}

export interface AwaitingRecoveryDeps {
  /** processingStatus in (UPLOADED, PUBLIC_READY, TRANSCRIBING) and updatedAt < olderThan, oldest first. */
  findAwaiting(olderThan: Date, limit: number): Promise<AwaitingRecording[]>;
  /** The current AssemblyAI status of a transcript; null when it can not be read (network, key, unknown id). */
  fetchTranscriptStatus(transcriptId: string): Promise<"queued" | "processing" | "completed" | "error" | null>;
  /** The webhook's own conditional UPDATE: waiting state -> TRANSCRIBED. true only for the one caller that changed the row. */
  markTranscribed(id: number): Promise<boolean>;
  /** waiting state -> TRANSCRIPTION_FAILED, conditional. */
  markTranscriptionFailed(id: number, message: string): Promise<boolean>;
  /** one of `fromStatuses` -> UPLOAD_FAILED, conditional. */
  markUploadFailed(id: number, fromStatuses: string[], message: string): Promise<boolean>;
  /** the existing background trigger */
  triggerProcessing(id: number): Promise<boolean>;
}

export interface AwaitingRecoveryReport {
  completed: number[];
  transcriptionFailed: number[];
  stillProcessing: number[];
  timedOut: number[];
  uploadAbandoned: number[];
  lookupFailed: number[];
  skippedForBudget: number[];
  triggerFailed: number[];
}

export async function recoverStuckAwaitingRecordings(
  deps: AwaitingRecoveryDeps,
  now: Date = new Date(),
  options: { pollsPerRun?: number } = {},
): Promise<AwaitingRecoveryReport> {
  const report: AwaitingRecoveryReport = { completed: [], transcriptionFailed: [], stillProcessing: [], timedOut: [], uploadAbandoned: [], lookupFailed: [], skippedForBudget: [], triggerFailed: [] };
  let budget = options.pollsPerRun ?? AWAITING_POLLS_PER_RUN;
  const minAge = Math.min(AWAITING_SUBMIT_STALE_MS, TRANSCRIBING_POLL_AFTER_MS, AWAITING_UPLOAD_STALE_MS);
  const rows = await deps.findAwaiting(new Date(now.getTime() - minAge), 50);

  for (const rec of rows) {
    const age = now.getTime() - rec.updatedAt.getTime();
    if (!rec.providerTranscriptId) {
      // Never submitted (or the submission result was lost). Never re-submit from here.
      if (rec.processingStatus === "UPLOADED" && age >= AWAITING_UPLOAD_STALE_MS) {
        if (await deps.markUploadFailed(rec.id, ["UPLOADED"], "Upload was never completed")) report.uploadAbandoned.push(rec.id);
      } else if (rec.processingStatus === "PUBLIC_READY" && age >= AWAITING_SUBMIT_STALE_MS) {
        if (await deps.markUploadFailed(rec.id, ["PUBLIC_READY"], "Submission to transcription did not finish")) report.uploadAbandoned.push(rec.id);
      }
      continue;
    }
    if (age < TRANSCRIBING_POLL_AFTER_MS) continue;
    if (budget <= 0) {
      report.skippedForBudget.push(rec.id);
      continue;
    }
    budget -= 1;
    let status: Awaited<ReturnType<AwaitingRecoveryDeps["fetchTranscriptStatus"]>> = null;
    try {
      status = await deps.fetchTranscriptStatus(rec.providerTranscriptId);
    } catch {
      status = null;
    }
    if (status === "completed") {
      // The same conditional UPDATE the webhook uses: if the webhook (or another run) got there first this returns false and nothing is triggered twice.
      if (await deps.markTranscribed(rec.id)) {
        report.completed.push(rec.id);
        let ok = false;
        try {
          ok = await deps.triggerProcessing(rec.id);
        } catch {
          ok = false;
        }
        if (!ok) report.triggerFailed.push(rec.id); // stays TRANSCRIBED: recoverStuckTranscribedRecordings re-triggers it
      }
    } else if (status === "error") {
      if (await deps.markTranscriptionFailed(rec.id, "AssemblyAI reported status=error")) report.transcriptionFailed.push(rec.id);
    } else {
      // queued / processing / unreadable: wait, unless it has been waiting for too long
      if (age >= TRANSCRIBING_MAX_AGE_MS) {
        if (await deps.markTranscriptionFailed(rec.id, "Transcription did not complete in time")) report.timedOut.push(rec.id);
      } else if (status === null) report.lookupFailed.push(rec.id);
      else report.stillProcessing.push(rec.id);
    }
  }
  return report;
}

export async function recoverStuckTranscribedRecordings(deps: RecoveryDeps, now: Date = new Date()): Promise<RecoveryReport> {
  const report: RecoveryReport = { retriggered: [], triggerFailed: [], exhausted: [], analysisAbandoned: [] };
  const stuck = await deps.findStuckTranscribed(new Date(now.getTime() - TRANSCRIBED_RECOVERY_GRACE_MS));
  for (const rec of stuck) {
    if (now.getTime() - rec.updatedAt.getTime() >= TRANSCRIBED_RECOVERY_MAX_AGE_MS) {
      await deps.markRecoveryExhausted(rec.id, "Background processing never started; automatic recovery gave up after 24h");
      report.exhausted.push(rec.id);
      continue;
    }
    let ok = false;
    try {
      ok = await deps.triggerProcessing(rec.id);
    } catch {
      ok = false;
    }
    (ok ? report.retriggered : report.triggerFailed).push(rec.id);
  }

  const analyzingCutoff = new Date(now.getTime() - ANALYZING_STUCK_AFTER_MS);
  for (const id of await deps.findStuckAnalyzing(analyzingCutoff)) {
    const changed = await deps.markAnalysisAbandoned(id, analyzingCutoff, "Analysis did not finish (function timed out or was interrupted); not retried automatically");
    if (changed) report.analysisAbandoned.push(id);
  }
  return report;
}
