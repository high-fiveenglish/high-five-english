// Deleting the ORIGINAL recording file from the private bucket. The transcript and the evaluation stay in the database; only the audio goes.
//
// The retention period is NOT decided in code. RECORDING_ORIGINAL_RETENTION_HOURS (hours since the upload, 0 = as soon as the transcript has been
// taken) must be set on purpose; when it is unset or malformed the sweep does nothing. The bucket's own lifecycle rule (Cloudflare) is the safety net
// that deletes whatever this sweep missed. A file is never deleted while AssemblyAI may still need to read it (UPLOADED / PUBLIC_READY / TRANSCRIBING).
import { parseStoredRef } from "./recordingUpload";

/** States in which AssemblyAI has already fetched the audio (or never will): the original may be deleted once the retention period is over. */
export const ORIGINAL_DELETABLE_STATES: readonly string[] = Object.freeze([
  "TRANSCRIBED",
  "NEEDS_SPEAKER_CONFIRMATION",
  "TEACHER_SPEAKER_CONFIRMED",
  "ANALYZING",
  "NEEDS_REVIEW",
  "PUBLISHED",
  "COMPLETED",
  "UPLOAD_FAILED",
  "TRANSCRIPTION_FAILED",
  "ANALYSIS_FAILED",
  "SAVE_FAILED",
]);
export const MAX_RETENTION_HOURS = 24 * 365;
export const SWEEP_BATCH_SIZE = 10;

/** The configured retention in hours, or null when it is not configured (the sweep is then disabled). */
export function readRetentionHours(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.RECORDING_ORIGINAL_RETENTION_HOURS?.trim();
  if (!raw || !/^\d{1,5}(\.\d{1,2})?$/.test(raw)) return null;
  const hours = Number(raw);
  return Number.isFinite(hours) && hours >= 0 && hours <= MAX_RETENTION_HOURS ? hours : null;
}

export interface DeletableRecording {
  id: number;
  classSessionId: number;
  driveFileId: string | null;
}

export interface RetentionDeps {
  /** deletedAt is null, driveFileId starts with "r2:", status in ORIGINAL_DELETABLE_STATES, uploadedAt <= uploadedBefore; oldest first. */
  findDeletable(uploadedBefore: Date, limit: number): Promise<DeletableRecording[]>;
  /** Deletes the object (an object that is already gone is not an error). Throws on a real failure. */
  removeObject(key: string): Promise<void>;
  /** deletedAt = now, only where it is still null. */
  markDeleted(id: number, at: Date): Promise<boolean>;
}

export interface RetentionReport {
  disabled: boolean;
  deleted: number[];
  failed: number[];
  invalidReference: number[];
}

export async function sweepRecordingOriginals(deps: RetentionDeps, retentionHours: number | null, now: Date = new Date(), limit: number = SWEEP_BATCH_SIZE): Promise<RetentionReport> {
  const report: RetentionReport = { disabled: retentionHours === null, deleted: [], failed: [], invalidReference: [] };
  if (retentionHours === null) return report;
  const cutoff = new Date(now.getTime() - retentionHours * 3600 * 1000);
  for (const rec of await deps.findDeletable(cutoff, limit)) {
    // The key comes out of the database: use it only if it has exactly the shape this code generates, for this very lesson.
    const key = parseStoredRef(rec.driveFileId, rec.classSessionId);
    if (!key) {
      report.invalidReference.push(rec.id);
      continue;
    }
    try {
      await deps.removeObject(key);
    } catch {
      report.failed.push(rec.id); // retried by the next run; the bucket lifecycle rule is the safety net
      continue;
    }
    if (await deps.markDeleted(rec.id, now)) report.deleted.push(rec.id);
  }
  return report;
}
