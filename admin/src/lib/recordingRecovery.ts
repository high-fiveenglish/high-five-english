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
