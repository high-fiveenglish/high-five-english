// recordingPublish.ts(AI 초안 publish의 DB 쓰기 규칙) 회귀 테스트 — DB/네트워크 없음.
// 실제 구현은 prisma.$transaction 안에서 같은 규칙을 Prisma 조건부 updateMany/create로 실행한다.
// 여기서는 트랜잭션(전부 반영 또는 롤백)을 snapshot/restore로 흉내 내, 동시 publish·동시 수동
// 저장·기존 평가서 보호가 데이터를 덮어쓰거나 중복 생성하지 않는지 검증한다.
import {
  commitAIDraftPublish,
  evaluationBlockedReason,
  MAX_PUBLISH_CONTENT_LENGTH,
  PublishConflictError,
  type PublishOps,
} from "../src/lib/recordingPublish";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

interface Evaluation {
  content: string;
  updatedAt: Date;
}
interface State {
  recordingStatus: string;
  evaluation: Evaluation | null;
  sessionStatus: string;
}

let clock = 1000;
const nextTime = () => new Date(++clock);

function createDb(initial: State) {
  const state: State = { ...initial, evaluation: initial.evaluation ? { ...initial.evaluation } : null };

  /** 트랜잭션 흉내: 이 트랜잭션이 한 쓰기만 되돌린다(undo log) — 다른 동시 트랜잭션의 쓰기는 건드리지 않는다. */
  async function transaction<T>(fn: (ops: PublishOps) => Promise<T>): Promise<T> {
    const undo: Array<() => void> = [];
    try {
      return await fn({
        async claimRecordingForPublish() {
          if (state.recordingStatus !== "NEEDS_REVIEW") return false;
          const before = state.recordingStatus;
          state.recordingStatus = "PUBLISHED";
          undo.push(() => (state.recordingStatus = before));
          return true;
        },
        async updateEvaluationIfUnchanged(_sessionId, expectedUpdatedAt, data) {
          if (!state.evaluation || state.evaluation.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return false;
          const before = state.evaluation;
          state.evaluation = { content: data.content, updatedAt: nextTime() };
          undo.push(() => (state.evaluation = before));
          return true;
        },
        async createEvaluation(_sessionId, data) {
          if (state.evaluation) return false; // unique(classSessionId) 위반
          state.evaluation = { content: data.content, updatedAt: nextTime() };
          undo.push(() => (state.evaluation = null));
          return true;
        },
        async markSessionCompleted() {
          const before = state.sessionStatus;
          state.sessionStatus = "COMPLETED";
          undo.push(() => (state.sessionStatus = before));
        },
      });
    } catch (err) {
      for (const u of undo.reverse()) u();
      throw err;
    }
  }
  return { state, transaction };
}

const data = (content: string) => ({ content, contentTranslated: null, contentTranslatedLang: null });

async function publish(db: ReturnType<typeof createDb>, existing: Evaluation | null, content = "AI draft") {
  try {
    await db.transaction((ops) =>
      commitAIDraftPublish(ops, { recordingId: 1, classSessionId: 1, sessionStatus: db.state.sessionStatus, existing, data: data(content) }),
    );
    return "ok" as const;
  } catch (err) {
    if (err instanceof PublishConflictError) return err.reason;
    throw err;
  }
}

async function main() {
  // ── 1. 평가서가 없던 경우: 생성 + PUBLISHED + 수업 COMPLETED(수동 saveEvaluation과 동일) ──
  {
    const db = createDb({ recordingStatus: "NEEDS_REVIEW", evaluation: null, sessionStatus: "SCHEDULED" });
    assert((await publish(db, null)) === "ok", "create: 성공");
    assert(db.state.evaluation?.content === "AI draft" && db.state.recordingStatus === "PUBLISHED", "create: 평가서 생성 + PUBLISHED");
    assert(db.state.sessionStatus === "COMPLETED", "create: 수업이 COMPLETED로 전환(수동 평가서 저장과 동일)");
  }
  {
    const db = createDb({ recordingStatus: "NEEDS_REVIEW", evaluation: null, sessionStatus: "COMPLETED" });
    await publish(db, null);
    assert(db.state.sessionStatus === "COMPLETED", "create: 이미 COMPLETED인 수업 상태 유지");
  }

  // ── 2. 같은 publish 요청이 두 번(동시) 들어와도 한 번만 반영 ─────────────────────
  {
    const db = createDb({ recordingStatus: "NEEDS_REVIEW", evaluation: null, sessionStatus: "SCHEDULED" });
    const [a, b] = await Promise.all([publish(db, null, "first"), publish(db, null, "second")]);
    const outcomes = [a, b].sort().join(",");
    assert(outcomes === "ok,recording_not_ready", `double publish: 하나만 성공 (got ${outcomes})`);
    assert(db.state.evaluation?.content === "first", "double publish: 먼저 성공한 내용만 저장(덮어쓰기 없음)");
  }
  {
    const db = createDb({ recordingStatus: "PUBLISHED", evaluation: { content: "published", updatedAt: nextTime() }, sessionStatus: "COMPLETED" });
    const r = await publish(db, db.state.evaluation, "again");
    assert(r === "recording_not_ready" && db.state.evaluation?.content === "published", "republish(PUBLISHED): 거절 + 기존 평가서 유지");
  }
  for (const status of ["ANALYZING", "ANALYSIS_FAILED", "TRANSCRIBED"]) {
    const db = createDb({ recordingStatus: status, evaluation: null, sessionStatus: "SCHEDULED" });
    assert((await publish(db, null)) === "recording_not_ready" && db.state.evaluation === null, `publish on ${status}: 거절, 평가서 생성 없음`);
  }

  // ── 3. 기존 평가서 보호(확인 후 덮어쓰기 포함) ────────────────────────────────
  {
    const existing: Evaluation = { content: "teacher wrote this", updatedAt: nextTime() };
    const db = createDb({ recordingStatus: "NEEDS_REVIEW", evaluation: existing, sessionStatus: "COMPLETED" });
    assert((await publish(db, existing, "AI replaces")) === "ok", "overwrite(확인됨, 변경 없음): 성공");
    assert(db.state.evaluation?.content === "AI replaces", "overwrite: 확인한 평가서만 교체");
  }
  {
    // 사용자가 확인한 뒤(번역 API 호출 중 등) 다른 곳에서 평가서를 고쳤다 → 덮어쓰지 않고 충돌.
    const seen: Evaluation = { content: "v1", updatedAt: nextTime() };
    const db = createDb({ recordingStatus: "NEEDS_REVIEW", evaluation: seen, sessionStatus: "COMPLETED" });
    db.state.evaluation = { content: "v2 edited concurrently", updatedAt: nextTime() };
    const r = await publish(db, seen, "AI replaces");
    assert(r === "evaluation_changed", "concurrent edit: evaluation_changed");
    assert(db.state.evaluation?.content === "v2 edited concurrently", "concurrent edit: 동시에 수정된 평가서를 덮어쓰지 않음");
    assert(db.state.recordingStatus === "NEEDS_REVIEW", "concurrent edit: 롤백 — 초안은 NEEDS_REVIEW로 남아 다시 검토 가능");
  }
  {
    // 평가서가 없다고 보고 publish하는 사이 다른 곳이 먼저 만들었다 → create 충돌, 덮어쓰지 않음.
    const db = createDb({ recordingStatus: "NEEDS_REVIEW", evaluation: null, sessionStatus: "SCHEDULED" });
    db.state.evaluation = { content: "created meanwhile", updatedAt: nextTime() };
    const r = await publish(db, null, "AI draft");
    assert(r === "evaluation_changed" && db.state.evaluation?.content === "created meanwhile", "concurrent create: 충돌, 덮어쓰지 않음");
    assert(db.state.recordingStatus === "NEEDS_REVIEW" && db.state.sessionStatus === "SCHEDULED", "concurrent create: 롤백(상태 변경 없음)");
  }

  // ── 4. 서버 측 입력/상태 검증 ─────────────────────────────────────────────────
  {
    const past = new Date("2026-10-01T00:00:00Z");
    const now = new Date("2026-10-02T00:00:00Z");
    assert(evaluationBlockedReason({ status: "SCHEDULED", scheduledAt: past }, now) === null, "guard: 지난 수업은 허용");
    for (const status of ["CANCELLED", "LEAVE", "HOLD"]) {
      assert(evaluationBlockedReason({ status, scheduledAt: past }, now) !== null, `guard: ${status} 수업은 차단`);
    }
    assert(evaluationBlockedReason({ status: "SCHEDULED", scheduledAt: new Date("2026-10-03T00:00:00Z") }, now) !== null, "guard: 아직 시작 전인 수업은 차단");
    assert(MAX_PUBLISH_CONTENT_LENGTH >= 8000 && MAX_PUBLISH_CONTENT_LENGTH <= 100000, "guard: 서버 측 길이 상한이 정상 초안은 허용하고 남용은 막는 범위");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
