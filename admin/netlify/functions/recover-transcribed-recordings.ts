// Netlify Scheduled Function — assemblyai-webhook의 background 호출이 도달하지 못해
// TRANSCRIBED에 멈춘 AudioRecording을 주기적으로 다시 집어 process-recording-background를
// 재트리거한다. 판단 로직과 idempotency 근거는 recordingRecovery.ts 참고 — 여기서는
// Prisma 기반 deps만 조립한다. Scheduled Function은 실행 시간이 짧으므로(30초) 직접
// Claude를 부르지 않고, 즉시 202를 돌려주는 Background Function 호출만 한다.
import { prisma } from "../../src/lib/prisma";
import { recoverStuckTranscribedRecordings } from "../../src/lib/recordingRecovery";
import { triggerRecordingProcessing } from "../../src/lib/recordingTrigger";

export default async () => {
  const report = await recoverStuckTranscribedRecordings({
    async findStuckTranscribed(olderThan) {
      return prisma.audioRecording.findMany({
        where: { processingStatus: "TRANSCRIBED", updatedAt: { lt: olderThan } },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "asc" },
        take: 20,
      });
    },
    async markRecoveryExhausted(id, errorMessage) {
      await prisma.audioRecording.updateMany({
        where: { id, processingStatus: "TRANSCRIBED" },
        data: { processingStatus: "ANALYSIS_FAILED", errorMessage },
      });
    },
    triggerProcessing: triggerRecordingProcessing,
  });
  console.log("recover-transcribed-recordings", JSON.stringify(report));
  return new Response(JSON.stringify(report), { status: 200 });
};

export const config = {
  schedule: "*/15 * * * *",
};
