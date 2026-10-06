// Recording upload: the pure rules (file format, size, object key, how the key is stored in the database, display file name).
// No database, no network, no environment access except through the explicit `env` parameter — so every rule here is tested offline
// (admin/scripts/test-recordingUpload.ts). The orchestration that uses these rules is recordingUploadFlow.ts.
import { randomUUID } from "node:crypto";

/** What the browser may upload. The extension of the stored object is chosen HERE from this table, never taken from the file name. */
const FORMAT_BY_CONTENT_TYPE: Record<string, { ext: string; contentType: string }> = {
  "audio/mpeg": { ext: "mp3", contentType: "audio/mpeg" },
  "audio/mp3": { ext: "mp3", contentType: "audio/mpeg" },
  "audio/mp4": { ext: "m4a", contentType: "audio/mp4" },
  "audio/x-m4a": { ext: "m4a", contentType: "audio/mp4" },
  "audio/m4a": { ext: "m4a", contentType: "audio/mp4" },
  "audio/wav": { ext: "wav", contentType: "audio/wav" },
  "audio/x-wav": { ext: "wav", contentType: "audio/wav" },
  "audio/wave": { ext: "wav", contentType: "audio/wav" },
  "audio/webm": { ext: "webm", contentType: "audio/webm" },
  "audio/aac": { ext: "aac", contentType: "audio/aac" },
  "audio/ogg": { ext: "ogg", contentType: "audio/ogg" },
  "audio/flac": { ext: "flac", contentType: "audio/flac" },
};
const FORMAT_BY_EXTENSION: Record<string, { ext: string; contentType: string }> = {
  mp3: { ext: "mp3", contentType: "audio/mpeg" },
  m4a: { ext: "m4a", contentType: "audio/mp4" },
  mp4: { ext: "m4a", contentType: "audio/mp4" },
  wav: { ext: "wav", contentType: "audio/wav" },
  webm: { ext: "webm", contentType: "audio/webm" },
  aac: { ext: "aac", contentType: "audio/aac" },
  ogg: { ext: "ogg", contentType: "audio/ogg" },
  flac: { ext: "flac", contentType: "audio/flac" },
};
/** Some browsers report no type, or a generic one, for .m4a/.mp3 files: only then is the extension of the file name consulted. */
const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

export const ALLOWED_RECORDING_EXTENSIONS: readonly string[] = Object.freeze([...new Set(Object.values(FORMAT_BY_CONTENT_TYPE).map((f) => f.ext))]);

export interface RecordingFormat {
  ext: string;
  /** the canonical Content-Type that is signed into the upload URL and that the browser must send */
  contentType: string;
}

/** The format for an upload request, or null when it is not an accepted audio format. */
export function resolveRecordingFormat(fileName: unknown, contentType: unknown): RecordingFormat | null {
  if (typeof contentType !== "string" || typeof fileName !== "string") return null;
  const type = contentType.split(";")[0].trim().toLowerCase();
  const byType = FORMAT_BY_CONTENT_TYPE[type];
  if (byType) return { ...byType };
  if (!GENERIC_TYPES.has(type)) return null;
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return null;
  const byExt = FORMAT_BY_EXTENSION[fileName.slice(dot + 1).trim().toLowerCase()];
  return byExt ? { ...byExt } : null;
}

// ── size ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Below this a file cannot be a real lesson (an empty or truncated upload). */
export const MIN_RECORDING_BYTES = 10 * 1024;
/** Default upper bound: a 50-minute lesson is ~25–60 MB as m4a/mp3 and ~265–530 MB as uncompressed WAV. RECORDING_MAX_BYTES overrides it. */
export const DEFAULT_MAX_RECORDING_BYTES = 300 * 1024 * 1024;
/** Whatever the environment says, never accept more than this. */
export const ABSOLUTE_MAX_RECORDING_BYTES = 1024 * 1024 * 1024;

export function maxRecordingBytes(env: Record<string, string | undefined> = process.env): number {
  const raw = env.RECORDING_MAX_BYTES;
  if (!raw || !/^\d{1,12}$/.test(raw.trim())) return DEFAULT_MAX_RECORDING_BYTES;
  const n = Number(raw.trim());
  if (!Number.isSafeInteger(n) || n < MIN_RECORDING_BYTES) return DEFAULT_MAX_RECORDING_BYTES;
  return Math.min(n, ABSOLUTE_MAX_RECORDING_BYTES);
}

export type SizeProblem = "invalid" | "too_small" | "too_large";
export function checkRecordingSize(size: unknown, max: number = maxRecordingBytes()): SizeProblem | null {
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) return "invalid";
  if (size < MIN_RECORDING_BYTES) return "too_small";
  if (size > max) return "too_large";
  return null;
}

// ── URL lifetimes (seconds) ────────────────────────────────────────────────────────────────────────────────────────────
/** The browser must START the upload within this time. The URL allows writing exactly one object key and nothing else. */
export const UPLOAD_URL_TTL_SEC = 600;
export const DEFAULT_DOWNLOAD_URL_TTL_SEC = 1800;
/** The URL handed to AssemblyAI (read one object). Short: it only has to live until AssemblyAI has fetched the file. */
export function downloadUrlTtlSec(env: Record<string, string | undefined> = process.env): number {
  const raw = env.RECORDING_DOWNLOAD_URL_TTL_SEC;
  if (!raw || !/^\d{1,6}$/.test(raw.trim())) return DEFAULT_DOWNLOAD_URL_TTL_SEC;
  return Math.min(Math.max(Number(raw.trim()), 300), 6 * 3600);
}

// ── object key ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const KEY_PATTERN = new RegExp(`^recordings/(\\d{1,10})/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\\.(${ALLOWED_RECORDING_EXTENSIONS.join("|")})$`);
export const STORED_REF_PREFIX = "r2:";

/** `recordings/{sessionId}/{uuid}.{ext}`: generated on the server, unpredictable (random UUID v4), contains nothing the user typed. */
export function generateRecordingKey(sessionId: number, ext: string, uuid: () => string = randomUUID): string {
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) throw new Error("invalid session id");
  if (!ALLOWED_RECORDING_EXTENSIONS.includes(ext)) throw new Error("invalid extension");
  const key = `recordings/${sessionId}/${uuid()}.${ext}`;
  if (!KEY_PATTERN.test(key)) throw new Error("generated key has an unexpected shape");
  return key;
}

/** The MVP stores the object key in AudioRecording.driveFileId as `r2:recordings/...` (no migration; the prefix says which store it is). */
export function formatStoredRef(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error("not a recording key");
  return `${STORED_REF_PREFIX}${key}`;
}

/** The object key from a stored reference, only if it has exactly the shape this code generates; anything else is null (never used). */
export function parseStoredRef(ref: unknown, expectedSessionId?: number): string | null {
  if (typeof ref !== "string" || !ref.startsWith(STORED_REF_PREFIX)) return null;
  const key = ref.slice(STORED_REF_PREFIX.length);
  const m = KEY_PATTERN.exec(key);
  if (!m) return null;
  if (expectedSessionId !== undefined && Number(m[1]) !== expectedSessionId) return null;
  return key;
}

/** The format an existing object is expected to have, from its key's extension. */
export function contentTypeForKey(key: string): string | null {
  const ext = key.slice(key.lastIndexOf(".") + 1);
  return FORMAT_BY_EXTENSION[ext]?.contentType ?? null;
}

/** Does the Content-Type R2 reports for the uploaded object fit the key's extension (any accepted alias of that format)? */
export function contentTypeMatchesKey(key: string, reported: string | undefined | null): boolean {
  const expected = contentTypeForKey(key);
  if (!expected || !reported) return false;
  const type = reported.split(";")[0].trim().toLowerCase();
  const format = FORMAT_BY_CONTENT_TYPE[type];
  return !!format && format.contentType === expected;
}

// ── display name ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const MAX_DISPLAY_NAME_LENGTH = 120;
/** The file name is shown to the teacher only. It is never part of the object key and never used as a path. */
export function sanitizeDisplayFileName(name: unknown, ext: string): string {
  const fallback = `recording.${ext}`;
  if (typeof name !== "string") return fallback;
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned || /^\.+$/.test(cleaned)) return fallback;
  return cleaned.length > MAX_DISPLAY_NAME_LENGTH ? cleaned.slice(0, MAX_DISPLAY_NAME_LENGTH) : cleaned;
}

// ── state rules ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Failed states from which the teacher may upload again (the row is reused, see recordingUploadFlow.ts). ANALYSIS_FAILED is not one:
 * the transcript already exists and re-uploading would pay for a second transcription. */
export const RETRYABLE_UPLOAD_STATES: readonly string[] = Object.freeze(["UPLOAD_FAILED", "TRANSCRIPTION_FAILED"]);
/** An UPLOADED row older than this (the upload URL has expired by then) may be restarted by the teacher. */
export const UPLOAD_RESTART_AFTER_MS = (UPLOAD_URL_TTL_SEC + 300) * 1000;
