// Recording upload orchestration: "request an upload URL" and "the upload is finished, send it to AssemblyAI". Authorization, the order of the
// checks and every state change are decided HERE; the Server Actions (sessions/[id]/recordingUploadActions.ts) only authenticate the teacher and hand
// this module Prisma-, R2- and AssemblyAI-backed dependencies. admin/scripts/test-recordingUpload.ts runs it against in-memory fakes.
//
// State machine (AudioRecording.processingStatus), the upload part of the existing one:
//   (no row) --request--> UPLOADED --complete--> PUBLIC_READY --AssemblyAI accepted--> TRANSCRIBING --webhook / recovery--> TRANSCRIBED ...
//   UPLOADED/PUBLIC_READY --problem--> UPLOAD_FAILED --teacher uploads again (the SAME row is reused)--> UPLOADED
// Every transition is ONE conditional UPDATE (`where status = <expected>`): of two concurrent requests exactly one wins. The only place that
// submits to AssemblyAI is `complete`, and only the request that wins the UPLOADED -> PUBLIC_READY claim gets to do it.
import { evaluationBlockedReason } from "./recordingPublish";
import type { RecordingStore } from "./recordingR2";
import {
  MIN_RECORDING_BYTES,
  RETRYABLE_UPLOAD_STATES,
  UPLOAD_RESTART_AFTER_MS,
  UPLOAD_URL_TTL_SEC,
  checkRecordingSize,
  contentTypeMatchesKey,
  formatStoredRef,
  generateRecordingKey,
  parseStoredRef,
  resolveRecordingFormat,
  sanitizeDisplayFileName,
} from "./recordingUpload";

export interface UploadSessionView {
  id: number;
  /** ClassSession.teacherId — the teacher who owns this lesson */
  teacherId: number | null;
  status: string;
  scheduledAt: Date;
  deletedAt: Date | null;
  recording: { id: number; processingStatus: string; driveFileId: string | null; updatedAt: Date } | null;
}

export interface UploadFlowDeps {
  findSession(sessionId: number): Promise<UploadSessionView | null>;
  /** Creates the row (status UPLOADED). "exists" when the lesson already has one (unique classSessionId) — never throws for that. */
  createRecording(data: { classSessionId: number; fileName: string; storedRef: string }): Promise<"created" | "exists">;
  /** Re-arms a row for a new upload in ONE conditional UPDATE: `status in fromStatuses` (and updatedAt < olderThan when given). true if it changed the row. */
  reuseRecording(id: number, fromStatuses: string[], olderThan: Date | null, data: { fileName: string; storedRef: string }): Promise<boolean>;
  /** UPLOADED -> PUBLIC_READY. Of two concurrent callers only one gets true. */
  claimForSubmit(id: number): Promise<boolean>;
  /** PUBLIC_READY -> TRANSCRIBING together with the AssemblyAI transcript id. */
  saveTranscribing(id: number, transcriptId: string): Promise<boolean>;
  /** One of `fromStatuses` -> UPLOAD_FAILED (internal message, never shown to the browser). */
  markUploadFailed(id: number, fromStatuses: string[], message: string): Promise<boolean>;
  store: RecordingStore;
  /** The existing submitTranscript(...) with the webhook options. Null when AssemblyAI did not accept the request. */
  submit(audioUrl: string): Promise<{ id: string } | null>;
  maxBytes: number;
  downloadTtlSec: number;
  now(): Date;
  uuid?: () => string;
}

export type UploadFailure =
  | "invalid_request"
  | "not_found"
  | "blocked"
  | "unsupported_format"
  | "invalid_size"
  | "too_small"
  | "too_large"
  | "already_exists"
  | "in_progress"
  | "no_upload"
  | "upload_missing"
  | "upload_invalid"
  | "not_retryable"
  | "storage_unavailable"
  | "submit_failed";

export const UPLOAD_ERROR_MESSAGES: Record<Exclude<UploadFailure, "blocked">, string> = {
  invalid_request: "The upload request was not valid.",
  not_found: "You can only upload recordings for your own classes.",
  unsupported_format: "This file type is not supported. Please upload an audio file (mp3, m4a, wav, webm, aac, ogg or flac).",
  invalid_size: "The file looks empty. Please choose the recording again.",
  too_small: "The file is too small to be a class recording.",
  too_large: "The file is too large. Please choose a smaller recording.",
  already_exists: "A recording already exists for this class.",
  in_progress: "A recording for this class is already being uploaded or processed.",
  no_upload: "There is no upload to finish for this class.",
  upload_missing: "The recording was not found in storage yet. Please try the upload again.",
  upload_invalid: "The uploaded file could not be accepted. Please upload it again.",
  not_retryable: "This recording can not be uploaded again.",
  storage_unavailable: "Recording storage is temporarily unavailable. Please try again in a moment.",
  submit_failed: "The recording was uploaded but could not be sent for transcription. Please upload it again.",
};

export type RequestUploadResult =
  | { ok: true; uploadUrl: string; contentType: string; expiresInSec: number }
  | { ok: false; error: UploadFailure; message?: string };

function ownLiveSession(session: UploadSessionView | null, teacherId: number): session is UploadSessionView {
  // A lesson of another teacher, a deleted lesson and a lesson that does not exist all get the SAME answer.
  return !!session && !session.deletedAt && session.teacherId !== null && session.teacherId === teacherId;
}

function validSessionId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export async function requestRecordingUpload(
  deps: UploadFlowDeps,
  input: { teacherId: number; sessionId: unknown; fileName: unknown; contentType: unknown; size: unknown },
): Promise<RequestUploadResult> {
  // 1. shape of the request (no database yet)
  if (!validSessionId(input.sessionId)) return { ok: false, error: "invalid_request" };
  const sessionId = input.sessionId;
  const format = resolveRecordingFormat(input.fileName, input.contentType);
  if (!format) return { ok: false, error: "unsupported_format" };
  const sizeProblem = checkRecordingSize(input.size, deps.maxBytes);
  if (sizeProblem) return { ok: false, error: sizeProblem === "invalid" ? "invalid_size" : sizeProblem };

  // 2. authorization and class state
  const session = await deps.findSession(sessionId);
  if (!ownLiveSession(session, input.teacherId)) return { ok: false, error: "not_found" };
  const now = deps.now();
  const blocked = evaluationBlockedReason(session, now);
  if (blocked) return { ok: false, error: "blocked", message: blocked };

  // 3. the new object key and its (offline) upload URL are made BEFORE any row is touched, so a failure can not leave a half-made row behind
  const key = generateRecordingKey(sessionId, format.ext, deps.uuid);
  const storedRef = formatStoredRef(key);
  const fileName = sanitizeDisplayFileName(input.fileName, format.ext);
  const uploadUrl = await deps.store.presignUpload(key, format.contentType, UPLOAD_URL_TTL_SEC);

  // 4. one recording per lesson: create it, or re-arm a failed / abandoned one
  const existing = session.recording;
  if (!existing) {
    const created = await deps.createRecording({ classSessionId: sessionId, fileName, storedRef });
    if (created === "exists") return { ok: false, error: "in_progress" }; // a concurrent request created it first
  } else {
    let reused = false;
    if (RETRYABLE_UPLOAD_STATES.includes(existing.processingStatus)) {
      reused = await deps.reuseRecording(existing.id, [existing.processingStatus], null, { fileName, storedRef });
    } else if (existing.processingStatus === "UPLOADED") {
      // an upload that was requested and never finished: only once its URL has expired
      const cutoff = new Date(now.getTime() - UPLOAD_RESTART_AFTER_MS);
      reused = existing.updatedAt.getTime() < cutoff.getTime() && (await deps.reuseRecording(existing.id, ["UPLOADED"], cutoff, { fileName, storedRef }));
      if (!reused) return { ok: false, error: "in_progress" };
    } else if (["PUBLIC_READY", "TRANSCRIBING"].includes(existing.processingStatus)) {
      return { ok: false, error: "in_progress" };
    } else {
      return { ok: false, error: existing.processingStatus === "ANALYSIS_FAILED" ? "not_retryable" : "already_exists" };
    }
    if (!reused) return { ok: false, error: "in_progress" };
    // the previous object of this row (if any) is no longer referenced: remove it, best effort (the bucket lifecycle rule is the safety net)
    const oldKey = parseStoredRef(existing.driveFileId, sessionId);
    if (oldKey) await deps.store.remove(oldKey).catch(() => undefined);
  }
  return { ok: true, uploadUrl, contentType: format.contentType, expiresInSec: UPLOAD_URL_TTL_SEC };
}

export type CompleteUploadResult =
  | { ok: true; state: "submitted" | "already_submitted" }
  | { ok: false; error: UploadFailure; message?: string };

export async function completeRecordingUpload(
  deps: UploadFlowDeps,
  input: { teacherId: number; sessionId: unknown },
): Promise<CompleteUploadResult> {
  if (!validSessionId(input.sessionId)) return { ok: false, error: "invalid_request" };
  const sessionId = input.sessionId;

  const session = await deps.findSession(sessionId);
  if (!ownLiveSession(session, input.teacherId)) return { ok: false, error: "not_found" };
  const blocked = evaluationBlockedReason(session, deps.now());
  if (blocked) return { ok: false, error: "blocked", message: blocked };

  const rec = session.recording;
  if (!rec) return { ok: false, error: "no_upload" };
  if (rec.processingStatus !== "UPLOADED") {
    // A second click, a refresh, or a request that lost the race: nothing is submitted again.
    if (["PUBLIC_READY", "TRANSCRIBING", "TRANSCRIBED", "NEEDS_SPEAKER_CONFIRMATION", "TEACHER_SPEAKER_CONFIRMED", "ANALYZING", "NEEDS_REVIEW", "PUBLISHED", "COMPLETED"].includes(rec.processingStatus)) {
      return { ok: true, state: "already_submitted" };
    }
    return { ok: false, error: "no_upload" };
  }

  const key = parseStoredRef(rec.driveFileId, sessionId);
  if (!key) {
    await deps.markUploadFailed(rec.id, ["UPLOADED"], "stored reference is not a recording key");
    return { ok: false, error: "upload_invalid" };
  }

  // The file must really be in the bucket, with a plausible size and type. (The URL signed the key and the type, not the length.)
  let head: { size: number; contentType: string | null } | null;
  try {
    head = await deps.store.head(key);
  } catch {
    return { ok: false, error: "storage_unavailable" };
  }
  if (!head) return { ok: false, error: "upload_missing" }; // stays UPLOADED: the browser may still be finishing, or the teacher uploads again
  if (head.size < MIN_RECORDING_BYTES || head.size > deps.maxBytes || !contentTypeMatchesKey(key, head.contentType)) {
    await deps.store.remove(key).catch(() => undefined);
    await deps.markUploadFailed(rec.id, ["UPLOADED"], "uploaded object failed the size/type check");
    return { ok: false, error: "upload_invalid" };
  }

  // Exactly one request gets past this line for a given upload: that request is the only one that talks to AssemblyAI.
  if (!(await deps.claimForSubmit(rec.id))) return { ok: true, state: "already_submitted" };

  let transcriptId: string | null = null;
  try {
    const audioUrl = await deps.store.presignDownload(key, deps.downloadTtlSec);
    const submitted = await deps.submit(audioUrl);
    transcriptId = submitted?.id ?? null;
  } catch {
    // Not knowing whether AssemblyAI accepted the request is treated as a failure: nothing is retried automatically (that could be a second paid transcription).
    transcriptId = null;
  }
  if (!transcriptId) {
    await deps.markUploadFailed(rec.id, ["PUBLIC_READY"], "AssemblyAI did not accept the submission");
    return { ok: false, error: "submit_failed" };
  }
  await deps.saveTranscribing(rec.id, transcriptId);
  return { ok: true, state: "submitted" };
}

export function uploadErrorMessage(error: UploadFailure, message?: string): string {
  return error === "blocked" ? message ?? "Recordings can not be uploaded for this class right now." : UPLOAD_ERROR_MESSAGES[error];
}
