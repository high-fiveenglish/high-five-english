// AssemblyAI webhook 처리 본체. DB·네트워크 접근은 deps로 주입받는다 — 라우트
// (api/public/assemblyai-webhook/route.ts)는 Prisma 기반 deps를 조립해 넘기기만 하고,
// admin/scripts/test-recordingWebhook.ts는 같은 로직을 in-memory fake deps로 검증한다
// (인증, 잘못된 요청, 중복 webhook, 상태 전이의 원자성).
import { timingSafeEqual } from "crypto";
import { parseTranscriptWebhookPayload } from "./assemblyai";

export interface RecordingWebhookDeps {
  /** providerTranscriptId(우리가 AssemblyAI에 제출할 때 저장한 값)로 레코드를 찾는다. */
  findByTranscriptId(transcriptId: string): Promise<{ id: number } | null>;
  /** 정확히 "전사 대기 중" 상태(AWAITING_TRANSCRIPT_STATUSES)인 레코드만 TRANSCRIPTION_FAILED로
   * 바꾸는 단일 조건부 UPDATE. 실제로 바꿨으면 true. */
  markTranscriptionFailed(id: number): Promise<boolean>;
  /** 정확히 "전사 대기 중" 상태인 레코드만 TRANSCRIBED로 바꾸는 단일 조건부 UPDATE.
   * 이 호출이 실제로 1행을 바꿨으면 true — 중복 webhook 중 하나만 true를 받는다. */
  markTranscribed(id: number): Promise<boolean>;
  /** background function 호출 요청이 수락됐으면 true. */
  triggerProcessing(id: number): Promise<boolean>;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** 인증은 본문 파싱·DB 조회보다 먼저 확인한다 — 인증되지 않은 요청은 deps를 전혀 건드리지
 * 않는다. 응답 본문에는 어떤 경우에도 비밀값·내부 오류 문구를 싣지 않는다. */
export async function handleAssemblyAIWebhook(
  req: Request,
  expectedSecret: string | undefined,
  deps: RecordingWebhookDeps,
): Promise<Response> {
  if (!expectedSecret) {
    // 아직 설정되지 않은 환경 — 요청을 수락한 것처럼 보이면 안 되므로 503으로 명확히 거절한다.
    return json({ error: "webhook_not_configured" }, 503);
  }
  const receivedSecret = req.headers.get("x-webhook-secret");
  if (!receivedSecret || !timingSafeEqualString(receivedSecret, expectedSecret)) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const payload = parseTranscriptWebhookPayload(body);
  if (!payload) {
    return json({ error: "invalid_payload" }, 400);
  }

  const recording = await deps.findByTranscriptId(payload.transcriptId);
  if (!recording) {
    // 모르는 transcriptId — 재시도/오발송일 수 있으니 200으로 받되 아무 것도 하지 않는다
    // (AssemblyAI가 4xx/5xx를 받으면 재시도하므로, "우리가 모르는 ID"는 우리 쪽 문제가
    // 아니라 그냥 무시해도 되는 상황이다).
    return json({ ok: true, note: "unknown_transcript_id" });
  }

  if (payload.status === "error") {
    // 조회 후 갱신이 아니라 where에 상태 조건을 건 단일 UPDATE — 동시에 도착한 중복 요청 중
    // 하나만 행을 바꾼다(TOCTOU 방지). 이미 다음 단계로 간 레코드(TRANSCRIBED·ANALYZING·
    // NEEDS_REVIEW·ANALYSIS_FAILED 등)의 상태/사유는 덮어쓰지 않는다.
    await deps.markTranscriptionFailed(recording.id);
    return json({ ok: true });
  }

  if (payload.status !== "completed") {
    // processing/queued 등 중간 상태 — 아직 할 일 없음.
    return json({ ok: true });
  }

  // Idempotency + race 방지 — 이 UPDATE가 실제로 1행을 바꾼 경우에만("전사 대기 중"이던
  // 레코드를 이 요청이 직접 TRANSCRIBED로 전이시킨 경우에만) background trigger를 쏜다.
  // 동시에 도착한 중복 webhook 중 먼저 커밋되는 하나만 true를 받고, 나머지는 false를 받아
  // 트리거를 쏘지 않는다 — Claude 중복 호출/aiDraft 중복 저장을 이 지점에서 원천 차단한다.
  // 이미 끝난(ANALYSIS_FAILED 등) 레코드에 늦게 온 webhook도 되살리지 않는다.
  const transitioned = await deps.markTranscribed(recording.id);
  if (!transitioned) {
    return json({ ok: true, note: "already_processed" });
  }

  // 무거운 처리는 Background Function에 넘긴다. 호출이 실패해도 레코드는 TRANSCRIBED에
  // 남고 recover-transcribed-recordings(Scheduled Function)가 주기적으로 재트리거한다 —
  // 재트리거돼도 background 쪽 원자적 ANALYZING 선점 때문에 Claude는 한 번만 호출된다.
  const triggered = await deps.triggerProcessing(recording.id);
  return json({ ok: true, ...(triggered ? {} : { note: "processing_trigger_deferred_to_recovery" }) });
}
