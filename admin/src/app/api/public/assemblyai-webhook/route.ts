import { prisma } from "@/lib/prisma";
import { AWAITING_TRANSCRIPT_STATUSES } from "@/lib/recordingWorkflow";
import { triggerRecordingProcessing } from "@/lib/recordingTrigger";
import { handleAssemblyAIWebhook, type RecordingWebhookDeps } from "@/lib/recordingWebhook";

// AssemblyAI가 전사 완료/실패 시 호출하는 webhook. teacherAuth.ts의 HMAC 세션 서명과
// 달리 여기선 AssemblyAI가 보내는 고정 커스텀 헤더(X-Webhook-Secret)를 서버가 미리
// 발급한 값과 직접 비교한다(submitTranscript가 webhook 제출 시 같은 값을
// webhook_auth_header_value로 넘긴다) — 이 요청의 "사용자"가 AssemblyAI 서버 하나뿐이라
// 서명 발급/검증의 비대칭성이 필요 없기 때문이다.
//
// 처리 로직(인증, 잘못된 요청 거절, 중복 webhook idempotency)은 recordingWebhook.ts에
// 있고 admin/scripts/test-recordingWebhook.ts로 검증한다 — 여기서는 Prisma 기반 deps만
// 조립한다. 무거운 처리(Talk Time, Claude 평가)는 Netlify Background Function으로 넘긴다
// (호출 실패 시 복구 경로는 recordingRecovery.ts 참고).
const prismaDeps: RecordingWebhookDeps = {
  async findByTranscriptId(transcriptId) {
    return prisma.audioRecording.findUnique({ where: { providerTranscriptId: transcriptId }, select: { id: true } });
  },
  async markTranscriptionFailed(id) {
    const res = await prisma.audioRecording.updateMany({
      where: { id, processingStatus: { in: AWAITING_TRANSCRIPT_STATUSES } },
      data: { processingStatus: "TRANSCRIPTION_FAILED", errorMessage: "AssemblyAI reported status=error" },
    });
    return res.count === 1;
  },
  async markTranscribed(id) {
    const res = await prisma.audioRecording.updateMany({
      where: { id, processingStatus: { in: AWAITING_TRANSCRIPT_STATUSES } },
      data: { processingStatus: "TRANSCRIBED" },
    });
    return res.count === 1;
  },
  triggerProcessing: triggerRecordingProcessing,
};

export async function POST(request: Request) {
  return handleAssemblyAIWebhook(request, process.env.ASSEMBLYAI_WEBHOOK_SECRET, prismaDeps);
}
