// process-recording-background(recordingProcessing.ts)와 TRANSCRIBED 복구
// (recordingRecovery.ts) 회귀 테스트 — DB/네트워크 없음. Prisma의 조건부 updateMany
// (where processingStatus = ...)를 in-memory fake로 흉내 낸다: JS는 단일 스레드라
// fake의 "조건 확인 + 갱신"이 한 번에 실행되므로, Postgres가 단일 UPDATE문에 거는 행
// 잠금과 같은 원자성을 갖는다.
import { handleProcessRecordingRequest, processRecording, type ProcessRecordingDeps } from "../src/lib/recordingProcessing";
import { isAuthorizedProcessingRequest, RECORDING_PROCESSING_SECRET_HEADER } from "../src/lib/recordingProcessingAuth";
import { ANALYZING_STUCK_AFTER_MS, MAX_ERROR_MESSAGE_LENGTH } from "../src/lib/recordingWorkflow";
import { studentFirstLesson, teacherFirstLesson, threeVoiceLesson } from "./fixtures/syntheticLessons";
import {
  recoverStuckTranscribedRecordings,
  TRANSCRIBED_RECOVERY_GRACE_MS,
  TRANSCRIBED_RECOVERY_MAX_AGE_MS,
  type RecoveryDeps,
} from "../src/lib/recordingRecovery";

let pass = 0;
let fail = 0;

function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

const SECRET = "test-processing-secret-0123456789";
const NOW = new Date("2026-10-01T12:00:00Z");

interface FakeRow {
  id: number;
  providerTranscriptId: string | null;
  processingStatus: string;
  updatedAt: Date;
  aiDraft: string | null;
  teacherQcDraft: string | null;
  errorMessage: string | null;
}

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function createFakeEnv(rows: FakeRow[], options: { fetchThrowsFor?: Set<number> } = {}) {
  const db = new Map<number, FakeRow>(rows.map((r) => [r.id, { ...r }]));
  const calls = { findRecording: 0, fetchTranscript: 0, claimForAnalysis: 0, claimSucceeded: 0, markFailed: 0, markNeedsConfirmation: 0, saveDraft: 0, generateDraft: 0 };
  let fetchCount = 0;
  // 테스트가 외부 API 실패 유형을 바꿔 가며 시뮬레이션하는 스위치.
  const behavior: {
    fetch: "ok" | "null" | "throw" | "noUtterances" | "processing" | "error";
    generateThrows: string | null;
    lesson: "teacherFirst" | "studentFirst" | "threeVoice";
  } = {
    fetch: "ok",
    generateThrows: null,
    lesson: "teacherFirst",
  };

  const deps: ProcessRecordingDeps = {
    async findRecording(id) {
      calls.findRecording++;
      await tick();
      const row = db.get(id);
      if (!row) return null;
      return {
        id: row.id,
        providerTranscriptId: row.providerTranscriptId,
        lessonContext: {
          lessonDate: "2026-10-01",
          lessonDurationMinutes: 25,
          studentAgeBand: "adult",
          studentRegion: null,
          textbookName: null,
          classMethod: null,
        },
      };
    },
    async fetchTranscript(transcriptId) {
      calls.fetchTranscript++;
      // 공유 변수를 나중에(두 tick 이후) 다시 읽으면 동시 호출 양쪽 모두 서로를
      // "나중 호출"로 보게 되는 테스트 자체의 레이스가 생긴다 — 진입 시점에 자신의
      // 순번을 스냅샷해서, 실제로 먼저 들어온 호출만 성공하게 한다.
      const myFetchIndex = ++fetchCount;
      // 두 번 양보해 동시에 시작한 호출들이 모두 "선점 전" 지점까지 도달하게 한다.
      await tick();
      await tick();
      if (behavior.fetch === "null") return null;
      if (behavior.fetch === "throw") throw new Error("simulated AssemblyAI timeout");
      if (behavior.fetch === "processing") return { id: transcriptId, status: "processing", text: null, utterances: null, audio_duration: null };
      if (behavior.fetch === "error") return { id: transcriptId, status: "error", text: null, utterances: null, audio_duration: null };
      if (behavior.fetch === "noUtterances") return { id: transcriptId, status: "completed", text: "", utterances: [], audio_duration: 0 };
      const row = [...db.values()].find((r) => r.providerTranscriptId === transcriptId);
      if (row && options.fetchThrowsFor?.has(row.id) && myFetchIndex > 1) {
        throw new Error("simulated AssemblyAI failure on duplicate invocation");
      }
      return {
        id: transcriptId,
        status: "completed",
        text: "synthetic lesson",
        utterances: behavior.lesson === "studentFirst" ? studentFirstLesson() : behavior.lesson === "threeVoice" ? threeVoiceLesson() : teacherFirstLesson(),
        audio_duration: 1500,
      };
    },
    async claimForAnalysis(id) {
      calls.claimForAnalysis++;
      const row = db.get(id);
      if (!row || row.processingStatus !== "TRANSCRIBED") return false;
      row.processingStatus = "ANALYZING";
      row.updatedAt = NOW;
      calls.claimSucceeded++;
      return true;
    },
    async markFailed(id, fromStatus, errorMessage) {
      calls.markFailed++;
      const row = db.get(id);
      if (!row || row.processingStatus !== fromStatus) return;
      row.processingStatus = "ANALYSIS_FAILED";
      row.errorMessage = errorMessage;
    },
    async markNeedsSpeakerConfirmation(id, message) {
      calls.markNeedsConfirmation++;
      const row = db.get(id);
      if (!row || row.processingStatus !== "TRANSCRIBED") return;
      row.processingStatus = "NEEDS_SPEAKER_CONFIRMATION";
      row.errorMessage = message;
    },
    async saveDraft(id, result) {
      calls.saveDraft++;
      const row = db.get(id)!;
      row.processingStatus = "NEEDS_REVIEW";
      row.aiDraft = result.studentFeedback;
      row.teacherQcDraft = result.teacherQc;
    },
    async generateDraft() {
      calls.generateDraft++;
      await tick();
      if (behavior.generateThrows) throw new Error(behavior.generateThrows);
      return { studentFeedback: `feedback #${calls.generateDraft}`, teacherQc: `qc #${calls.generateDraft}` };
    },
  };

  function totalDepCalls() {
    return Object.values(calls).reduce((a, b) => a + b, 0);
  }

  function request(headers: Record<string, string>, body: unknown = { audioRecordingId: 1 }) {
    return new Request("https://example.test/.netlify/functions/process-recording-background", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  function recoveryDeps(trigger: (id: number) => Promise<boolean>): RecoveryDeps {
    return {
      async findStuckTranscribed(olderThan) {
        return [...db.values()]
          .filter((r) => r.processingStatus === "TRANSCRIBED" && r.updatedAt < olderThan)
          .map((r) => ({ id: r.id, updatedAt: r.updatedAt }));
      },
      async markRecoveryExhausted(id, errorMessage) {
        const row = db.get(id);
        if (!row || row.processingStatus !== "TRANSCRIBED") return;
        row.processingStatus = "ANALYSIS_FAILED";
        row.errorMessage = errorMessage;
      },
      triggerProcessing: trigger,
      async findStuckAnalyzing(olderThan) {
        return [...db.values()].filter((r) => r.processingStatus === "ANALYZING" && r.updatedAt < olderThan).map((r) => r.id);
      },
      async markAnalysisAbandoned(id, olderThan, errorMessage) {
        const row = db.get(id);
        if (!row || row.processingStatus !== "ANALYZING" || !(row.updatedAt < olderThan)) return false;
        row.processingStatus = "ANALYSIS_FAILED";
        row.errorMessage = errorMessage;
        return true;
      },
    };
  }

  /** 실제 recordingTrigger.ts처럼 비밀값 헤더를 붙여 background handler를 호출한다. */
  async function authorizedTrigger(id: number) {
    const res = await handleProcessRecordingRequest(
      request({ [RECORDING_PROCESSING_SECRET_HEADER]: SECRET }, { audioRecordingId: id }),
      SECRET,
      deps,
    );
    return res.ok;
  }

  return { db, calls, deps, behavior, totalDepCalls, request, recoveryDeps, authorizedTrigger };
}

function transcribedRow(id: number, ageMs: number): FakeRow {
  return {
    id,
    providerTranscriptId: `tx-${id}`,
    processingStatus: "TRANSCRIBED",
    updatedAt: new Date(NOW.getTime() - ageMs),
    aiDraft: null,
    teacherQcDraft: null,
    errorMessage: null,
  };
}

async function main() {
  // ── 1. 인증되지 않은 background 요청은 AI/DB 처리 전에 거절된다 ──────────────
  {
    assert(isAuthorizedProcessingRequest(SECRET, SECRET), "auth: 일치하는 비밀값 허용");
    assert(!isAuthorizedProcessingRequest(null, SECRET), "auth: 헤더 없음 거절");
    assert(!isAuthorizedProcessingRequest("", SECRET), "auth: 빈 헤더 거절");
    assert(!isAuthorizedProcessingRequest("wrong", SECRET), "auth: 길이 다른 값 거절");
    assert(!isAuthorizedProcessingRequest(SECRET.slice(0, -1) + "X", SECRET), "auth: 같은 길이 다른 값 거절");
    assert(!isAuthorizedProcessingRequest(SECRET, null), "auth: 서버 비밀값 미설정이면 항상 거절");
    assert(!isAuthorizedProcessingRequest("", ""), "auth: 빈 비밀값끼리도 거절");

    const cases: { label: string; headers: Record<string, string>; expected: string | null; status: number }[] = [
      { label: "헤더 없음", headers: {}, expected: SECRET, status: 401 },
      { label: "틀린 비밀값", headers: { [RECORDING_PROCESSING_SECRET_HEADER]: "nope" }, expected: SECRET, status: 401 },
      { label: "같은 길이 틀린 비밀값", headers: { [RECORDING_PROCESSING_SECRET_HEADER]: "x".repeat(SECRET.length) }, expected: SECRET, status: 401 },
      { label: "서버 비밀값 미설정", headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET }, expected: null, status: 503 },
    ];
    for (const c of cases) {
      const env = createFakeEnv([transcribedRow(1, 0)]);
      const req = env.request(c.headers);
      const res = await handleProcessRecordingRequest(req, c.expected, env.deps);
      assert(res.status === c.status, `unauthorized(${c.label}): status ${c.status} (got ${res.status})`);
      assert(env.totalDepCalls() === 0, `unauthorized(${c.label}): AI/DB deps 호출 0회`);
      assert(!req.bodyUsed, `unauthorized(${c.label}): 요청 본문도 읽지 않음`);
      assert(env.db.get(1)!.processingStatus === "TRANSCRIBED", `unauthorized(${c.label}): 상태 변경 없음`);
    }

    const env = createFakeEnv([transcribedRow(1, 0)]);
    const res = await handleProcessRecordingRequest(env.request({ [RECORDING_PROCESSING_SECRET_HEADER]: SECRET }), SECRET, env.deps);
    assert(res.status === 200 && (await res.text()) === "ok", "authorized: 정상 처리");
    assert(env.db.get(1)!.processingStatus === "NEEDS_REVIEW", "authorized: NEEDS_REVIEW로 전이");
    assert(env.calls.generateDraft === 1, "authorized: Claude 1회 호출");
  }

  // ── 2. background 호출이 실패한 TRANSCRIBED 레코드의 복구 ───────────────────
  {
    const env = createFakeEnv([
      transcribedRow(1, 30 * 60 * 1000), // webhook의 background 호출이 실패한 채 30분 경과
      transcribedRow(2, TRANSCRIBED_RECOVERY_GRACE_MS / 2), // 방금 전이됨 — 정상 경로가 진행 중일 수 있음
      transcribedRow(3, TRANSCRIBED_RECOVERY_MAX_AGE_MS + 1000), // 24시간 넘게 복구 실패
    ]);

    // 원래 webhook의 호출이 실패했다고 가정 — 아무 처리도 일어나지 않았다.
    assert(env.db.get(1)!.processingStatus === "TRANSCRIBED", "recovery: 호출 실패 후 TRANSCRIBED에 멈춤");

    const report = await recoverStuckTranscribedRecordings(env.recoveryDeps(env.authorizedTrigger), NOW);
    assert(JSON.stringify(report.retriggered) === "[1]", `recovery: 오래된 TRANSCRIBED만 재트리거 (got ${JSON.stringify(report.retriggered)})`);
    assert(env.db.get(1)!.processingStatus === "NEEDS_REVIEW", "recovery: 재트리거 후 NEEDS_REVIEW");
    assert(env.db.get(1)!.aiDraft === "feedback #1", "recovery: aiDraft 저장");
    assert(env.db.get(2)!.processingStatus === "TRANSCRIBED", "recovery: grace 기간 내 레코드는 건드리지 않음");
    assert(JSON.stringify(report.exhausted) === "[3]", "recovery: 24시간 초과 레코드는 exhausted");
    assert(env.db.get(3)!.processingStatus === "ANALYSIS_FAILED", "recovery: exhausted 레코드는 ANALYSIS_FAILED");
    assert(env.calls.generateDraft === 1, "recovery: Claude 1회만 호출(exhausted 레코드는 처리 안 함)");

    // 같은 복구를 다시 돌려도(다음 스케줄) 이미 처리된 레코드는 재처리하지 않는다.
    const again = await recoverStuckTranscribedRecordings(env.recoveryDeps(env.authorizedTrigger), NOW);
    assert(again.retriggered.length === 0 && again.exhausted.length === 0, "recovery: 재실행 시 처리할 것 없음(idempotent)");
    assert(env.calls.generateDraft === 1, "recovery: 재실행 후에도 Claude 1회");
  }
  {
    // 재트리거 자체가 실패/예외 → 레코드는 TRANSCRIBED에 남아 다음 스케줄에서 다시 시도된다.
    const env = createFakeEnv([transcribedRow(1, 30 * 60 * 1000)]);
    const report = await recoverStuckTranscribedRecordings(
      env.recoveryDeps(async () => {
        throw new Error("network down");
      }),
      NOW,
    );
    assert(JSON.stringify(report.triggerFailed) === "[1]", "recovery: 재트리거 예외는 triggerFailed로 기록");
    assert(env.db.get(1)!.processingStatus === "TRANSCRIBED", "recovery: 재트리거 실패 시 TRANSCRIBED 유지(다음 실행에서 재시도)");
    const next = await recoverStuckTranscribedRecordings(env.recoveryDeps(env.authorizedTrigger), NOW);
    assert(JSON.stringify(next.retriggered) === "[1]", "recovery: 다음 실행에서 재시도 성공");
    assert(env.db.get(1)!.processingStatus === "NEEDS_REVIEW", "recovery: 다음 실행 후 NEEDS_REVIEW");
  }

  // ── 3. 중복 복구/webhook 호출에도 ANALYZING 선점은 정확히 1회 ────────────────
  {
    // 늦게 도착한 원래 호출 + 복구 재트리거가 동시에 실행.
    const env = createFakeEnv([transcribedRow(1, 30 * 60 * 1000)]);
    const [a, b] = await Promise.all([processRecording(1, env.deps), processRecording(1, env.deps)]);
    const outcomes = [a, b].sort().join(",");
    assert(outcomes === "already_claimed,ok", `duplicate: 하나만 ok, 하나는 already_claimed (got ${outcomes})`);
    assert(env.calls.claimForAnalysis === 2 && env.calls.claimSucceeded === 1, "duplicate: 선점 시도 2회 중 성공 1회");
    assert(env.calls.generateDraft === 1, "duplicate: Claude 1회만 호출");
    assert(env.calls.saveDraft === 1, "duplicate: aiDraft 1회만 저장");
    assert(env.db.get(1)!.processingStatus === "NEEDS_REVIEW", "duplicate: 최종 NEEDS_REVIEW");
  }
  {
    // 겹쳐 실행된 두 번의 복구 스케줄 + 원래 webhook 호출(인증 통과) 3개가 동시에.
    const env = createFakeEnv([transcribedRow(1, 30 * 60 * 1000)]);
    await Promise.all([
      recoverStuckTranscribedRecordings(env.recoveryDeps(env.authorizedTrigger), NOW),
      recoverStuckTranscribedRecordings(env.recoveryDeps(env.authorizedTrigger), NOW),
      env.authorizedTrigger(1),
    ]);
    assert(env.calls.claimSucceeded === 1, `duplicate(recovery x2 + webhook): ANALYZING 선점 1회 (got ${env.calls.claimSucceeded})`);
    assert(env.calls.generateDraft === 1, "duplicate(recovery x2 + webhook): Claude 1회만 호출");
    assert(env.db.get(1)!.aiDraft === "feedback #1", "duplicate(recovery x2 + webhook): aiDraft가 겹쳐 쓰이지 않음");
  }
  {
    // 이미 NEEDS_REVIEW인 레코드에 뒤늦게 들어온 호출 — 선점 실패, 초안 유지.
    const env = createFakeEnv([transcribedRow(1, 0)]);
    await processRecording(1, env.deps);
    const late = await processRecording(1, env.deps);
    assert(late === "already_claimed", "duplicate(late): 뒤늦은 호출은 already_claimed");
    assert(env.calls.generateDraft === 1, "duplicate(late): Claude 추가 호출 없음");
    assert(env.db.get(1)!.aiDraft === "feedback #1", "duplicate(late): 기존 초안 유지");
  }
  {
    // 중복 호출 쪽의 실패(transcript 조회 예외)가 다른 호출이 선점/완료한 레코드를
    // ANALYSIS_FAILED로 덮어쓰지 않는다.
    const env = createFakeEnv([transcribedRow(1, 0)], { fetchThrowsFor: new Set([1]) });
    const [a, b] = await Promise.all([processRecording(1, env.deps), processRecording(1, env.deps)]);
    const outcomes = [a, b].sort().join(",");
    assert(outcomes === "ok,transcript_fetch_failed", `duplicate(failing twin): 하나 ok, 하나 transcript_fetch_failed (got ${outcomes})`);
    assert(env.db.get(1)!.processingStatus === "NEEDS_REVIEW", "duplicate(failing twin): 성공한 쪽 결과(NEEDS_REVIEW) 유지");
    assert(env.db.get(1)!.errorMessage === null, "duplicate(failing twin): errorMessage 덮어쓰지 않음");
  }

  // ── 4. ANALYZING에서 멈춘 레코드(함수 timeout 등)는 영구히 멈추지 않는다 ─────────
  {
    const analyzing = (id: number, ageMs: number): FakeRow => ({ ...transcribedRow(id, ageMs), processingStatus: "ANALYZING" });
    const env = createFakeEnv([
      analyzing(1, ANALYZING_STUCK_AFTER_MS + 60_000), // 선점 후 한참 지나도 끝나지 않음
      analyzing(2, 5 * 60 * 1000), // 정상적으로 진행 중일 수 있음
      { ...transcribedRow(3, ANALYZING_STUCK_AFTER_MS * 2), processingStatus: "NEEDS_REVIEW" },
      { ...transcribedRow(4, ANALYZING_STUCK_AFTER_MS * 2), processingStatus: "ANALYSIS_FAILED", errorMessage: "earlier failure" },
    ]);
    const report = await recoverStuckTranscribedRecordings(env.recoveryDeps(env.authorizedTrigger), NOW);
    assert(JSON.stringify(report.analysisAbandoned) === "[1]", `analyzing: 오래 멈춘 ANALYZING만 정리 (got ${JSON.stringify(report.analysisAbandoned)})`);
    assert(env.db.get(1)!.processingStatus === "ANALYSIS_FAILED" && !!env.db.get(1)!.errorMessage, "analyzing: 멈춘 레코드는 ANALYSIS_FAILED + 사유");
    assert(env.db.get(2)!.processingStatus === "ANALYZING", "analyzing: 진행 중일 수 있는 레코드는 건드리지 않음");
    assert(env.db.get(3)!.processingStatus === "NEEDS_REVIEW", "analyzing: 완료된 레코드는 건드리지 않음");
    assert(env.db.get(4)!.errorMessage === "earlier failure", "analyzing: 이미 실패한 레코드의 사유를 덮어쓰지 않음");
    assert(env.calls.generateDraft === 0 && env.calls.claimForAnalysis === 0, "analyzing: 정리 과정에서 Claude를 호출하지 않음(자동 재실행 없음)");
    const again = await recoverStuckTranscribedRecordings(env.recoveryDeps(env.authorizedTrigger), NOW);
    assert(again.analysisAbandoned.length === 0, "analyzing: 재실행해도 추가 변경 없음(idempotent)");
    // ANALYSIS_FAILED 레코드는 background가 다시 호출돼도 재처리되지 않는다(무한 재시도 없음).
    const late = await processRecording(1, env.deps);
    assert(late === "already_claimed", `analyzing: 실패 레코드를 background가 다시 돌리지 않음 (got ${late})`);
    assert(env.calls.generateDraft === 0, "analyzing: 실패 레코드에 Claude 호출 없음");
  }
  {
    // 선점한 호출이 정상 완료하는 순간과 정리가 겹쳐도 NEEDS_REVIEW가 ANALYSIS_FAILED로 덮이지 않는다.
    const env = createFakeEnv([{ ...transcribedRow(1, ANALYZING_STUCK_AFTER_MS + 1000), processingStatus: "ANALYZING" }]);
    const deps = env.recoveryDeps(env.authorizedTrigger);
    const cutoff = new Date(NOW.getTime() - ANALYZING_STUCK_AFTER_MS);
    const staleIds = await deps.findStuckAnalyzing(cutoff);
    env.db.get(1)!.processingStatus = "NEEDS_REVIEW"; // 그 사이 원래 호출이 저장을 마침
    const changed = await deps.markAnalysisAbandoned(staleIds[0], cutoff, "x");
    assert(!changed && env.db.get(1)!.processingStatus === "NEEDS_REVIEW", "analyzing(race): 그 사이 완료된 레코드는 덮어쓰지 않음");
  }

  // ── 5. 외부 API 실패: 선점 전(비용 발생 전) 실패는 TRANSCRIBED에서 복구, 선점 후 실패는 ANALYSIS_FAILED ──
  for (const mode of ["null", "throw", "processing"] as const) {
    const env = createFakeEnv([transcribedRow(1, 30 * 60 * 1000)]);
    env.behavior.fetch = mode;
    const out = await processRecording(1, env.deps);
    assert(out === "transcript_fetch_failed", `fetch(${mode}): transcript_fetch_failed (got ${out})`);
    assert(env.db.get(1)!.processingStatus === "TRANSCRIBED" && env.db.get(1)!.errorMessage === null, `fetch(${mode}): TRANSCRIBED 유지(영구 실패로 확정하지 않음)`);
    assert(env.calls.markFailed === 0 && env.calls.generateDraft === 0, `fetch(${mode}): Claude 호출·실패 확정 없음`);
    env.behavior.fetch = "ok";
    const report = await recoverStuckTranscribedRecordings(env.recoveryDeps(env.authorizedTrigger), NOW);
    assert(JSON.stringify(report.retriggered) === "[1]" && env.db.get(1)!.processingStatus === "NEEDS_REVIEW", `fetch(${mode}): AssemblyAI 복구 후 다음 복구에서 정상 처리`);
  }
  {
    // 일시 장애가 계속돼도 무한 재시도하지 않는다 — 24시간 후 ANALYSIS_FAILED.
    const env = createFakeEnv([transcribedRow(1, TRANSCRIBED_RECOVERY_MAX_AGE_MS + 1000)]);
    env.behavior.fetch = "null";
    const report = await recoverStuckTranscribedRecordings(env.recoveryDeps(env.authorizedTrigger), NOW);
    assert(JSON.stringify(report.exhausted) === "[1]" && env.db.get(1)!.processingStatus === "ANALYSIS_FAILED", "fetch: 24시간 넘게 복구 못 하면 ANALYSIS_FAILED(무한 재시도 없음)");
  }
  for (const mode of ["noUtterances", "error"] as const) {
    // AssemblyAI가 분명히 "빈 결과/실패"라고 답한 경우(발화 없음 = invalid speaker data 포함)는 재시도해도 소용없으므로 바로 실패 확정.
    const env = createFakeEnv([transcribedRow(1, 0)]);
    env.behavior.fetch = mode;
    const out = await processRecording(1, env.deps);
    assert(out === "transcript_unavailable" && env.db.get(1)!.processingStatus === "ANALYSIS_FAILED", `transcript(${mode}): 즉시 ANALYSIS_FAILED (got ${out})`);
    assert(env.calls.generateDraft === 0, `transcript(${mode}): Claude 호출 없음`);
  }
  {
    // 선점 후 Claude/검증 실패 → ANALYSIS_FAILED, 사유는 길이 제한, 자동 재시도 없음.
    const env = createFakeEnv([transcribedRow(1, 0)]);
    env.behavior.generateThrows = "Output 1 (student feedback) rejected after 4 attempts — " + "quoted student speech ".repeat(100);
    const out = await processRecording(1, env.deps);
    assert(out === "error" && env.db.get(1)!.processingStatus === "ANALYSIS_FAILED", "claude failure: ANALYSIS_FAILED");
    assert((env.db.get(1)!.errorMessage ?? "").length <= MAX_ERROR_MESSAGE_LENGTH, "claude failure: errorMessage 길이 제한");
    assert(env.calls.generateDraft === 1, "claude failure: 자동 재호출 없음");
    const again = await processRecording(1, env.deps);
    assert(again === "already_claimed" && env.calls.generateDraft === 1, "claude failure: 같은 레코드를 다시 처리하지 않음(Claude 추가 호출 없음)");
  }

  // ── 6. background 입력 검증: 잘못된 id는 DB 조회 전에 거절 ─────────────────────
  for (const bad of [-1, 0, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 10, undefined]) {
    const env = createFakeEnv([transcribedRow(1, 0)]);
    const res = await handleProcessRecordingRequest(env.request({ [RECORDING_PROCESSING_SECRET_HEADER]: SECRET }, { audioRecordingId: bad }), SECRET, env.deps);
    assert(res.status === 400 && env.totalDepCalls() === 0, `invalid id(${String(bad)}): 400, deps 호출 0회`);
  }

  // ── 7. Speaker-role confidence gate: LOW confidence must stop BEFORE Claude, never swap the roles silently ────────
  for (const lesson of ["studentFirst", "threeVoice"] as const) {
    const env = createFakeEnv([transcribedRow(1, 0)]);
    env.behavior.lesson = lesson;
    const out = await processRecording(1, env.deps);
    assert(out === "needs_speaker_confirmation", `gate(${lesson}): needs_speaker_confirmation (got ${out})`);
    const row = env.db.get(1)!;
    assert(row.processingStatus === "NEEDS_SPEAKER_CONFIRMATION", `gate(${lesson}): status NEEDS_SPEAKER_CONFIRMATION`);
    assert(env.calls.generateDraft === 0 && env.calls.claimForAnalysis === 0 && env.calls.saveDraft === 0, `gate(${lesson}): no claim, no Claude call, no draft`);
    assert(row.aiDraft === null && row.teacherQcDraft === null, `gate(${lesson}): no draft text is stored`);
    assert(/^LOW: /.test(row.errorMessage ?? "") && (row.errorMessage ?? "").length <= MAX_ERROR_MESSAGE_LENGTH, `gate(${lesson}): the stored reason is a short LOW summary`);
    const texts = [...studentFirstLesson(), ...threeVoiceLesson()].map((u) => u.text).filter((t) => t.length > 12);
    assert(!texts.some((t) => (row.errorMessage ?? "").includes(t)), `gate(${lesson}): the stored reason contains no transcript text`);
    // asked again (duplicate invocation / re-trigger): still no Claude call, status unchanged
    const again = await processRecording(1, env.deps);
    assert(again === "needs_speaker_confirmation" && env.calls.generateDraft === 0 && env.db.get(1)!.processingStatus === "NEEDS_SPEAKER_CONFIRMATION", `gate(${lesson}): a repeated invocation still does not call Claude`);
  }
  {
    // two concurrent invocations on a LOW-confidence recording: the status changes once, Claude is never called
    const env = createFakeEnv([transcribedRow(1, 30 * 60 * 1000)]);
    env.behavior.lesson = "studentFirst";
    const [a, b] = await Promise.all([processRecording(1, env.deps), processRecording(1, env.deps)]);
    assert(a === "needs_speaker_confirmation" && b === "needs_speaker_confirmation" && env.calls.generateDraft === 0, "gate(concurrent): both stop, no Claude call");
    assert(env.db.get(1)!.processingStatus === "NEEDS_SPEAKER_CONFIRMATION", "gate(concurrent): one consistent final status");
    // the scheduled recovery must not touch it (it is not TRANSCRIBED and not ANALYZING)
    const report = await recoverStuckTranscribedRecordings(env.recoveryDeps(env.authorizedTrigger), NOW);
    assert(report.retriggered.length === 0 && report.exhausted.length === 0 && report.analysisAbandoned.length === 0, "gate: recovery leaves a record that waits for the teacher alone");
    assert(env.db.get(1)!.processingStatus === "NEEDS_SPEAKER_CONFIRMATION", "gate: status unchanged after recovery");
  }
  {
    // HIGH confidence proceeds exactly as before
    const env = createFakeEnv([transcribedRow(1, 0)]);
    const out = await processRecording(1, env.deps);
    assert(out === "ok" && env.calls.markNeedsConfirmation === 0 && env.calls.generateDraft === 1, "gate: a clear teacher-first lesson (HIGH) is analysed as before");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}



main();
