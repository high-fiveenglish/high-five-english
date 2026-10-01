import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { parseTranscriptWebhookPayload } from "@/lib/assemblyai";
import { ALREADY_PROGRESSED_STATUSES } from "@/lib/recordingWorkflow";
import { triggerRecordingProcessing } from "@/lib/recordingTrigger";

// AssemblyAI가 전사 완료/실패 시 호출하는 webhook. teacherAuth.ts의 HMAC 세션 서명과
// 달리 여기선 AssemblyAI가 보내는 고정 커스텀 헤더(X-Webhook-Secret)를 서버가 미리
// 발급한 값과 직접 비교한다(submitTranscript가 webhook 제출 시 같은 값을
// webhook_auth_header_value로 넘긴다) — HMAC 서명이 아니라 공유 비밀값 비교인 이유는
// 이 요청의 "사용자"가 AssemblyAI 서버 하나뿐이라 서명 발급/검증의 비대칭성이 필요
//없기 때문이다.
//
// 빠른 응답 + 최소 상태 갱신만 여기서 한다(Talk Time 계산, Claude 평가 생성 같은
// 무거운 작업은 아래에서 Netlify Background Function을 호출해 넘긴다 — 그 처리 자체를
// 이 라우트의 실행 시간 안에서 기다리지 않는다. 호출 실패 시 복구 경로는
// recordingRecovery.ts 참고).
function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const expectedSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET;
  if (!expectedSecret) {
    // 아직 설정되지 않은 환경 — 요청을 수락한 것처럼 보이면 안 되므로 503으로 명확히 거절한다.
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }
  const receivedSecret = request.headers.get("x-webhook-secret");
  if (!receivedSecret || !timingSafeEqualString(receivedSecret, expectedSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const payload = parseTranscriptWebhookPayload(body);
  if (!payload) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const recording = await prisma.audioRecording.findUnique({
    where: { providerTranscriptId: payload.transcriptId },
    select: { id: true },
  });
  if (!recording) {
    // 모르는 transcriptId — 재시도/오발송일 수 있으니 200으로 받되 아무 것도 하지 않는다
    // (AssemblyAI가 4xx/5xx를 받으면 재시도하므로, "우리가 모르는 ID"는 우리 쪽
    // 문제가 아니라 그냥 무시해도 되는 상황이다).
    return NextResponse.json({ ok: true, note: "unknown_transcript_id" });
  }

  if (payload.status === "error") {
    // findUnique+update를 분리하지 않고 where에 상태 조건을 걸어 단일 UPDATE문으로
    // 만든다 — AssemblyAI가 거의 동시에 webhook을 2번 보내는 경우(TOCTOU) 두 요청이
    // 모두 "아직 진행 전"으로 읽고 동시에 다음 단계를 트리거하는 race를 막는다
    // (Postgres가 그 UPDATE문 자체에 대해 행 잠금을 걸어주므로 둘 중 하나만 성공).
    await prisma.audioRecording.updateMany({
      where: { id: recording.id, processingStatus: { notIn: ALREADY_PROGRESSED_STATUSES } },
      data: { processingStatus: "TRANSCRIPTION_FAILED", errorMessage: "AssemblyAI reported status=error" },
    });
    return NextResponse.json({ ok: true });
  }

  if (payload.status !== "completed") {
    // processing/queued 등 중간 상태 — 아직 할 일 없음.
    return NextResponse.json({ ok: true });
  }

  // Idempotency + race 방지 — 이 UPDATE가 실제로 1행을 바꾼 경우에만("아직 진행 전"
  // 상태였던 레코드를 이 요청이 직접 TRANSCRIBED로 전이시킨 경우에만) background
  // trigger를 쏜다. 동시에 도착한 중복 webhook 중 먼저 커밋되는 하나만 count:1을
  // 받고, 나머지는 count:0을 받아 트리거를 쏘지 않는다 — Claude 중복 호출/aiDraft
  // 중복 저장을 이 지점에서 원천 차단한다.
  const transitioned = await prisma.audioRecording.updateMany({
    where: { id: recording.id, processingStatus: { notIn: ALREADY_PROGRESSED_STATUSES } },
    data: { processingStatus: "TRANSCRIBED" },
  });
  if (transitioned.count === 0) {
    return NextResponse.json({ ok: true, note: "already_processed" });
  }

  // 무거운 처리(transcript 조회, Talk Time 계산, Claude 평가 생성)는 별도 Background
  // Function에 넘긴다. Background Function은 즉시 202를 돌려주므로 요청이 실제로
  // 전송·수락될 때까지만 await한다(서버리스 런타임이 응답 후 미전송 fetch를 끊는 것을
  // 막기 위함). 호출이 실패해도 레코드는 TRANSCRIBED에 남고,
  // recover-transcribed-recordings(Netlify Scheduled Function)가 주기적으로 재트리거한다
  // — 재트리거돼도 background 쪽 원자적 ANALYZING 선점 때문에 Claude는 한 번만 호출된다.
  const triggered = await triggerRecordingProcessing(recording.id);

  return NextResponse.json({ ok: true, ...(triggered ? {} : { note: "processing_trigger_deferred_to_recovery" }) });
}
