// recordingWebhook.ts(AssemblyAI webhook 처리 본체) 회귀 테스트 — DB/네트워크 없음.
// 인증, 잘못된 요청 거절, 중복 webhook idempotency, 상태 전이의 원자성(조건부 UPDATE),
// 비밀값이 응답에 새지 않는지를 in-memory fake로 검증한다. JS는 단일 스레드라 fake의
// "조건 확인 + 갱신"은 Postgres가 단일 UPDATE문에 거는 행 잠금과 같은 원자성을 갖는다.
import { handleAssemblyAIWebhook, type RecordingWebhookDeps } from "../src/lib/recordingWebhook";
import { AWAITING_TRANSCRIPT_STATUSES } from "../src/lib/recordingWorkflow";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

const SECRET = "test-webhook-secret-0123456789";

interface Row {
  id: number;
  providerTranscriptId: string;
  processingStatus: string;
  errorMessage: string | null;
}

function createEnv(rows: Row[], options: { triggerResult?: boolean | "throw" } = {}) {
  const db = new Map<number, Row>(rows.map((r) => [r.id, { ...r }]));
  const calls = { find: 0, markFailed: 0, markTranscribed: 0, trigger: 0 };
  const triggered: number[] = [];
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const deps: RecordingWebhookDeps = {
    async findByTranscriptId(transcriptId) {
      calls.find++;
      await tick();
      const row = [...db.values()].find((r) => r.providerTranscriptId === transcriptId);
      return row ? { id: row.id } : null;
    },
    async markTranscriptionFailed(id) {
      calls.markFailed++;
      const row = db.get(id);
      if (!row || !AWAITING_TRANSCRIPT_STATUSES.includes(row.processingStatus)) return false;
      row.processingStatus = "TRANSCRIPTION_FAILED";
      row.errorMessage = "AssemblyAI reported status=error";
      return true;
    },
    async markTranscribed(id) {
      calls.markTranscribed++;
      const row = db.get(id);
      if (!row || !AWAITING_TRANSCRIPT_STATUSES.includes(row.processingStatus)) return false;
      row.processingStatus = "TRANSCRIBED";
      return true;
    },
    async triggerProcessing(id) {
      calls.trigger++;
      triggered.push(id);
      if (options.triggerResult === "throw") throw new Error("network down");
      return options.triggerResult ?? true;
    },
  };
  function req(body: unknown, headers: Record<string, string> = { "x-webhook-secret": SECRET }, raw?: string) {
    return new Request("https://example.test/api/public/assemblyai-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: raw ?? JSON.stringify(body),
    });
  }
  const total = () => Object.values(calls).reduce((a, b) => a + b, 0);
  return { db, calls, triggered, deps, req, total };
}

const row = (id: number, status: string): Row => ({ id, providerTranscriptId: `tx-${id}`, processingStatus: status, errorMessage: null });
const completed = (id: number) => ({ transcript_id: `tx-${id}`, status: "completed" });

async function main() {
  // ── 1. 인증 ──────────────────────────────────────────────────────────────────
  const authCases: { label: string; headers: Record<string, string>; secret: string | undefined; status: number }[] = [
    { label: "헤더 없음", headers: {}, secret: SECRET, status: 401 },
    { label: "틀린 비밀값", headers: { "x-webhook-secret": "nope" }, secret: SECRET, status: 401 },
    { label: "같은 길이 틀린 비밀값", headers: { "x-webhook-secret": "x".repeat(SECRET.length) }, secret: SECRET, status: 401 },
    { label: "빈 헤더", headers: { "x-webhook-secret": "" }, secret: SECRET, status: 401 },
    { label: "서버 비밀값 미설정", headers: { "x-webhook-secret": SECRET }, secret: undefined, status: 503 },
    { label: "서버 비밀값이 빈 문자열", headers: { "x-webhook-secret": "" }, secret: "", status: 503 },
  ];
  for (const c of authCases) {
    const env = createEnv([row(1, "TRANSCRIBING")]);
    const request = env.req(completed(1), c.headers);
    const res = await handleAssemblyAIWebhook(request, c.secret, env.deps);
    const text = await res.text();
    assert(res.status === c.status, `auth(${c.label}): status ${c.status} (got ${res.status})`);
    assert(env.total() === 0, `auth(${c.label}): DB·trigger 호출 0회`);
    assert(!request.bodyUsed, `auth(${c.label}): 요청 본문도 읽지 않음`);
    assert(env.db.get(1)!.processingStatus === "TRANSCRIBING", `auth(${c.label}): 상태 변경 없음`);
    assert(!text.includes(SECRET) && !text.includes("nope"), `auth(${c.label}): 응답에 비밀값 없음`);
  }

  // ── 2. 잘못된 요청 ───────────────────────────────────────────────────────────
  {
    const env = createEnv([row(1, "TRANSCRIBING")]);
    const bad = await handleAssemblyAIWebhook(env.req(null, undefined, "{not json"), SECRET, env.deps);
    assert(bad.status === 400, "invalid json: 400");
    for (const payload of [{}, { status: "completed" }, { transcript_id: "tx-1" }, { transcript_id: 1, status: "completed" }, null, "x", [], { transcript_id: {}, status: [] }]) {
      const res = await handleAssemblyAIWebhook(env.req(payload), SECRET, env.deps);
      assert(res.status === 400, `invalid payload ${JSON.stringify(payload)}: 400 (got ${res.status})`);
    }
    assert(env.total() === 0 && env.db.get(1)!.processingStatus === "TRANSCRIBING", "invalid: DB 접근·상태 변경 없음");
  }
  {
    // 존재하지 않는/조작된 transcript id → 200으로 받되 아무 것도 하지 않는다. 다른 레코드를 건드리지 않는다.
    const env = createEnv([row(1, "TRANSCRIBING"), row(2, "TRANSCRIBING")]);
    for (const id of ["tx-999", "tx-1 OR 1=1", "../tx-1", "tx-1\n", ""]) {
      const res = await handleAssemblyAIWebhook(env.req({ transcript_id: id, status: "completed" }), SECRET, env.deps);
      const body = (await res.json()) as { note?: string };
      assert(res.status === 200 && body.note === "unknown_transcript_id", `unknown id ${JSON.stringify(id)}: 200 + 무시`);
    }
    assert(env.calls.markTranscribed === 0 && env.calls.trigger === 0, "unknown id: 상태 전이·trigger 없음");
    assert(env.db.get(1)!.processingStatus === "TRANSCRIBING" && env.db.get(2)!.processingStatus === "TRANSCRIBING", "unknown id: 실제 레코드 변경 없음");
  }

  // ── 3. 정상 경로와 idempotency ──────────────────────────────────────────────
  {
    const env = createEnv([row(1, "TRANSCRIBING")]);
    const res = await handleAssemblyAIWebhook(env.req(completed(1)), SECRET, env.deps);
    assert(res.status === 200 && env.db.get(1)!.processingStatus === "TRANSCRIBED", "completed: TRANSCRIBED로 전이");
    assert(JSON.stringify(env.triggered) === "[1]", "completed: background trigger 1회");
  }
  {
    // 같은 webhook을 동시에 3번(중복 전송) — 전이도 trigger도 정확히 1회.
    const env = createEnv([row(1, "TRANSCRIBING")]);
    const results = await Promise.all([1, 2, 3].map(() => handleAssemblyAIWebhook(env.req(completed(1)), SECRET, env.deps)));
    const notes = await Promise.all(results.map(async (r) => ((await r.json()) as { note?: string }).note ?? "first"));
    assert(notes.filter((n) => n === "first").length === 1 && notes.filter((n) => n === "already_processed").length === 2, `duplicate x3: 1회만 처리 (got ${notes.join(",")})`);
    assert(env.triggered.length === 1, "duplicate x3: trigger 1회(Claude 중복 호출 원천 차단)");
    assert(env.db.get(1)!.processingStatus === "TRANSCRIBED", "duplicate x3: TRANSCRIBED");
  }
  {
    // 순차 재전송(AssemblyAI 재시도).
    const env = createEnv([row(1, "TRANSCRIBING")]);
    await handleAssemblyAIWebhook(env.req(completed(1)), SECRET, env.deps);
    const again = await handleAssemblyAIWebhook(env.req(completed(1)), SECRET, env.deps);
    assert(((await again.json()) as { note?: string }).note === "already_processed" && env.triggered.length === 1, "replay: 재전송은 already_processed, trigger 추가 없음");
  }
  // 이미 진행/종료된 어떤 상태의 레코드도 completed webhook으로 되살아나거나 재처리되지 않는다.
  for (const status of ["TRANSCRIBED", "ANALYZING", "NEEDS_REVIEW", "PUBLISHED", "COMPLETED", "ANALYSIS_FAILED", "TRANSCRIPTION_FAILED", "UPLOAD_FAILED", "SAVE_FAILED"]) {
    const env = createEnv([row(1, status)]);
    const res = await handleAssemblyAIWebhook(env.req(completed(1)), SECRET, env.deps);
    assert(res.status === 200 && env.db.get(1)!.processingStatus === status && env.triggered.length === 0, `completed on ${status}: 상태 유지, trigger 없음`);
  }
  // 전사 대기 상태에서는 모두 정상 전이.
  for (const status of AWAITING_TRANSCRIPT_STATUSES) {
    const env = createEnv([row(1, status)]);
    await handleAssemblyAIWebhook(env.req(completed(1)), SECRET, env.deps);
    assert(env.db.get(1)!.processingStatus === "TRANSCRIBED" && env.triggered.length === 1, `completed on ${status}: TRANSCRIBED + trigger 1회`);
  }

  // ── 4. error / 중간 상태 webhook ────────────────────────────────────────────
  {
    const env = createEnv([row(1, "TRANSCRIBING")]);
    const res = await handleAssemblyAIWebhook(env.req({ transcript_id: "tx-1", status: "error" }), SECRET, env.deps);
    assert(res.status === 200 && env.db.get(1)!.processingStatus === "TRANSCRIPTION_FAILED" && env.triggered.length === 0, "error: TRANSCRIPTION_FAILED, trigger 없음");
  }
  for (const status of ["TRANSCRIBED", "ANALYZING", "NEEDS_REVIEW", "PUBLISHED", "ANALYSIS_FAILED"]) {
    // 늦게 온/조작된 error webhook이 이미 진행된 레코드의 상태·실패 사유를 덮어쓰지 않는다.
    const env = createEnv([{ ...row(1, status), errorMessage: status === "ANALYSIS_FAILED" ? "original reason" : null }]);
    await handleAssemblyAIWebhook(env.req({ transcript_id: "tx-1", status: "error" }), SECRET, env.deps);
    assert(env.db.get(1)!.processingStatus === status, `error on ${status}: 상태 유지`);
    assert(status !== "ANALYSIS_FAILED" || env.db.get(1)!.errorMessage === "original reason", "error on ANALYSIS_FAILED: 실패 사유 유지");
  }
  for (const status of ["processing", "queued", "unknown_status"]) {
    const env = createEnv([row(1, "TRANSCRIBING")]);
    const res = await handleAssemblyAIWebhook(env.req({ transcript_id: "tx-1", status }), SECRET, env.deps);
    assert(res.status === 200 && env.calls.markTranscribed === 0 && env.calls.markFailed === 0 && env.db.get(1)!.processingStatus === "TRANSCRIBING", `status=${status}: 아무 것도 하지 않음`);
  }

  // ── 5. trigger 실패는 복구 경로로 넘어간다 ──────────────────────────────────
  {
    const env = createEnv([row(1, "TRANSCRIBING")], { triggerResult: false });
    const res = await handleAssemblyAIWebhook(env.req(completed(1)), SECRET, env.deps);
    const body = (await res.json()) as { note?: string };
    assert(res.status === 200 && body.note === "processing_trigger_deferred_to_recovery", "trigger 실패: 200 + 복구로 위임");
    assert(env.db.get(1)!.processingStatus === "TRANSCRIBED", "trigger 실패: TRANSCRIBED 유지(recover-transcribed-recordings가 재시도)");
  }

  // ── 6. 응답 본문에 비밀값·내부 정보가 없다 ──────────────────────────────────
  {
    const env = createEnv([row(1, "TRANSCRIBING")]);
    const texts: string[] = [];
    for (const [payload, headers] of [
      [completed(1), { "x-webhook-secret": SECRET }],
      [completed(1), { "x-webhook-secret": SECRET }],
      [{ transcript_id: "nope", status: "completed" }, { "x-webhook-secret": SECRET }],
      [{}, { "x-webhook-secret": SECRET }],
      [completed(1), {}],
    ] as [unknown, Record<string, string>][]) {
      texts.push(await (await handleAssemblyAIWebhook(env.req(payload, headers), SECRET, env.deps)).text());
    }
    assert(texts.every((t) => !t.includes(SECRET) && !/stack|prisma|ASSEMBLYAI|at \w+ \(/i.test(t)), "응답 본문에 비밀값·stack·내부 식별자 없음");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
