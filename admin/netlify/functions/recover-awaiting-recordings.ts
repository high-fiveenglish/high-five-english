// Netlify Scheduled Function — recordings that are still waiting for their transcript (UPLOADED / PUBLIC_READY / TRANSCRIBING) after the webhook
// should long have arrived: a lost webhook, or one that came before the transcript id was saved. Decisions and the reasons for them are in
// recordingRecovery.ts (recoverStuckAwaitingRecordings). This file only wires Prisma and the AssemblyAI status lookup.
//
// It never submits anything to AssemblyAI: a second submission would be a second paid transcription. A finished transcript is handed on with
// the SAME conditional update the webhook uses, then the existing background function takes over.
import { prisma } from "../../src/lib/prisma";
import { fetchTranscript } from "../../src/lib/assemblyai";
import { recoverStuckAwaitingRecordings } from "../../src/lib/recordingRecovery";
import { triggerRecordingProcessing } from "../../src/lib/recordingTrigger";
import { AWAITING_TRANSCRIPT_STATUSES, truncateErrorMessage } from "../../src/lib/recordingWorkflow";

/** A scheduled function has ~30 seconds: one lookup must not take most of them. */
const LOOKUP_TIMEOUT_MS = 6000;

export default async () => {
  const report = await recoverStuckAwaitingRecordings({
    async findAwaiting(olderThan, limit) {
      return prisma.audioRecording.findMany({
        where: { processingStatus: { in: AWAITING_TRANSCRIPT_STATUSES }, updatedAt: { lt: olderThan } },
        select: { id: true, processingStatus: true, providerTranscriptId: true, updatedAt: true },
        orderBy: { updatedAt: "asc" },
        take: limit,
      });
    },
    async fetchTranscriptStatus(transcriptId) {
      const transcript = await fetchTranscript(transcriptId, { timeoutMs: LOOKUP_TIMEOUT_MS });
      return transcript ? transcript.status : null;
    },
    async markTranscribed(id) {
      const res = await prisma.audioRecording.updateMany({
        where: { id, processingStatus: { in: AWAITING_TRANSCRIPT_STATUSES } },
        data: { processingStatus: "TRANSCRIBED" },
      });
      return res.count === 1;
    },
    async markTranscriptionFailed(id, message) {
      const res = await prisma.audioRecording.updateMany({
        where: { id, processingStatus: { in: AWAITING_TRANSCRIPT_STATUSES } },
        data: { processingStatus: "TRANSCRIPTION_FAILED", errorMessage: truncateErrorMessage(message) },
      });
      return res.count === 1;
    },
    async markUploadFailed(id, fromStatuses, message) {
      const res = await prisma.audioRecording.updateMany({
        where: { id, processingStatus: { in: fromStatuses } },
        data: { processingStatus: "UPLOAD_FAILED", errorMessage: truncateErrorMessage(message) },
      });
      return res.count === 1;
    },
    triggerProcessing: triggerRecordingProcessing,
  });
  // ids and counts only: no URL, key, secret or transcript text is ever logged
  console.log("recover-awaiting-recordings", JSON.stringify(report));
  return new Response(JSON.stringify(report), { status: 200 });
};

export const config = {
  schedule: "*/15 * * * *",
};
