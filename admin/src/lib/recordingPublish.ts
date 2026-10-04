// AI 초안 publish(AudioRecording.aiDraft → LessonEvaluation)의 DB 쓰기 규칙. DB 접근은 ops로
// 주입받는다 — recordingActions.ts는 prisma.$transaction 안에서 Prisma 기반 ops를 조립해
// 넘기고, admin/scripts/test-recordingPublish.ts는 같은 규칙을 in-memory fake로 검증한다.
//
// 왜 필요한가: 예전 구현은 "기존 평가서가 있나?"를 읽은 뒤 upsert하고 레코드를 PUBLISHED로
// 바꿨다 — 읽기와 쓰기 사이(번역 API 호출 포함)에 다른 곳이 평가서를 만들거나 고치면 그 내용을
// 조용히 덮어썼고, 같은 publish 요청이 두 번 들어오면 둘 다 통과했다. 지금은 한 트랜잭션 안에서
// (1) 레코드를 NEEDS_REVIEW → PUBLISHED로 "선점"(조건부 UPDATE, 한 요청만 성공)하고,
// (2) 기존 평가서는 사용자가 확인했던 시점의 updatedAt과 같을 때만 갱신하며(낙관적 동시성),
// (3) 평가서가 없던 경우엔 create만 한다(unique 제약 위반 = 그 사이 누가 만들었다 = 충돌).
// 어느 단계든 충돌이면 PublishConflictError를 던져 트랜잭션 전체가 롤백된다.

/** AI 초안은 영어 보고서라 사람이 쓰는 평가서(2000자)보다 길다 — 정상 범위를 넉넉히 허용하되,
 * 번역 API 비용·저장 크기를 보호하는 서버 측 상한을 둔다(클라이언트 검증을 신뢰하지 않는다). */
export const MAX_PUBLISH_CONTENT_LENGTH = 20000;

export type PublishConflictReason = "recording_not_ready" | "evaluation_changed";

export class PublishConflictError extends Error {
  constructor(public readonly reason: PublishConflictReason) {
    super(reason);
    this.name = "PublishConflictError";
  }
}

export const PUBLISH_CONFLICT_MESSAGES: Record<PublishConflictReason, string> = {
  recording_not_ready: "This draft was already published or is no longer ready for review.",
  evaluation_changed: "The evaluation for this class changed while you were reviewing. Reload the page and review it again.",
};

export interface EvaluationWriteData {
  content: string;
  contentTranslated: string | null;
  contentTranslatedLang: string | null;
}

export interface PublishOps {
  /** recordingId가 정확히 NEEDS_REVIEW일 때만 PUBLISHED(+reviewedAt)로 바꾸는 단일 조건부 UPDATE. 바꿨으면 true. */
  claimRecordingForPublish(recordingId: number): Promise<boolean>;
  /** classSessionId의 평가서가 expectedUpdatedAt과 같은 updatedAt일 때만 갱신. 갱신했으면 true. */
  updateEvaluationIfUnchanged(classSessionId: number, expectedUpdatedAt: Date, data: EvaluationWriteData): Promise<boolean>;
  /** 평가서를 새로 만든다. 이미 있으면(unique 위반) false. */
  createEvaluation(classSessionId: number, data: EvaluationWriteData): Promise<boolean>;
  /** 평가서 저장은 "수업이 진행되었다"는 확정 신호 — saveEvaluation과 같게 수업을 COMPLETED로 둔다. */
  markSessionCompleted(classSessionId: number): Promise<void>;
}

export interface CommitPublishParams {
  recordingId: number;
  classSessionId: number;
  sessionStatus: string;
  /** 사용자가 화면에서 확인한 시점의 기존 평가서(없으면 null). */
  existing: { updatedAt: Date } | null;
  data: EvaluationWriteData;
}

/** 반드시 하나의 DB 트랜잭션 안에서 호출한다. 충돌이면 PublishConflictError를 던진다(롤백용). */
export async function commitAIDraftPublish(ops: PublishOps, params: CommitPublishParams): Promise<void> {
  if (!(await ops.claimRecordingForPublish(params.recordingId))) {
    throw new PublishConflictError("recording_not_ready");
  }
  if (params.existing) {
    if (!(await ops.updateEvaluationIfUnchanged(params.classSessionId, params.existing.updatedAt, params.data))) {
      throw new PublishConflictError("evaluation_changed");
    }
  } else if (!(await ops.createEvaluation(params.classSessionId, params.data))) {
    throw new PublishConflictError("evaluation_changed");
  }
  if (params.sessionStatus !== "COMPLETED") {
    await ops.markSessionCompleted(params.classSessionId);
  }
}

/** publish 폼의 hidden sessionId 필드를 해석한다. 서버 액션에 bind로 넘기지 않는 이유는
 * recordingActions.ts 참고. 요청 값은 신뢰하지 않는다 — 양의 정수 10진수 문자열만 허용하고
 * (NaN, 빈 값, 0, 음수, 소수, 지수/16진 표기, 공백, 거대한 값, 파일은 null), 소유권은 호출부가 DB로 다시 확인한다. */
export function parseSessionIdField(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/** saveEvaluation(sessions/[id]/actions.ts)과 같은 수업 상태·시각 조건 — 서버 액션은 별도 POST
 * 엔드포인트라 페이지의 UI 제한을 믿지 않고 여기서도 검증한다. 막아야 하면 사유 문구를 돌려준다. */
export function evaluationBlockedReason(session: { status: string; scheduledAt: Date }, now: Date = new Date()): string | null {
  if (session.status === "CANCELLED" || session.status === "LEAVE" || session.status === "HOLD") {
    return "Evaluations cannot be written for a cancelled, on-hold, or paused class.";
  }
  if (session.scheduledAt.getTime() > now.getTime()) {
    return "You can write an evaluation once the class time has arrived.";
  }
  return null;
}
