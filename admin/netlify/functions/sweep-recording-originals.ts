// Netlify Scheduled Function — deletes ORIGINAL recording files from the private R2 bucket once their retention period is over.
// The retention period is configuration (RECORDING_ORIGINAL_RETENTION_HOURS), not code: without it this function does nothing, and the bucket's
// own lifecycle rule remains the safety net. Rules and reasons: recordingRetention.ts.
import { prisma } from "../../src/lib/prisma";
import { getRecordingStore } from "../../src/lib/recordingR2";
import { ORIGINAL_DELETABLE_STATES, readRetentionHours, sweepRecordingOriginals } from "../../src/lib/recordingRetention";

export default async () => {
  const retentionHours = readRetentionHours();
  const store = getRecordingStore();
  if (retentionHours === null || !store) {
    console.log("sweep-recording-originals", JSON.stringify({ skipped: true, retentionConfigured: retentionHours !== null, storageConfigured: !!store }));
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }
  const report = await sweepRecordingOriginals(
    {
      async findDeletable(uploadedBefore, limit) {
        return prisma.audioRecording.findMany({
          where: {
            deletedAt: null,
            driveFileId: { startsWith: "r2:" },
            processingStatus: { in: [...ORIGINAL_DELETABLE_STATES] },
            uploadedAt: { lte: uploadedBefore },
          },
          select: { id: true, classSessionId: true, driveFileId: true },
          orderBy: { uploadedAt: "asc" },
          take: limit,
        });
      },
      removeObject: (key) => store.remove(key),
      async markDeleted(id, at) {
        const res = await prisma.audioRecording.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: at } });
        return res.count === 1;
      },
    },
    retentionHours,
  );
  console.log("sweep-recording-originals", JSON.stringify(report)); // ids and counts only
  return new Response(JSON.stringify(report), { status: 200 });
};

export const config = {
  schedule: "*/30 * * * *",
};
