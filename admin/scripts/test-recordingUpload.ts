// Recording upload: the pure rules (format, size, key, stored reference) and the whole request/complete flow against in-memory fakes.
// No database, no network, no R2, no AssemblyAI: nothing is uploaded, submitted or paid for. Run from admin/: npx tsx scripts/test-recordingUpload.ts
import {
  ABSOLUTE_MAX_RECORDING_BYTES,
  ALLOWED_RECORDING_EXTENSIONS,
  DEFAULT_MAX_RECORDING_BYTES,
  MIN_RECORDING_BYTES,
  UPLOAD_RESTART_AFTER_MS,
  UPLOAD_URL_TTL_SEC,
  checkRecordingSize,
  contentTypeMatchesKey,
  downloadUrlTtlSec,
  formatStoredRef,
  generateRecordingKey,
  maxRecordingBytes,
  parseStoredRef,
  resolveRecordingFormat,
  sanitizeDisplayFileName,
} from "../src/lib/recordingUpload";
import {
  completeRecordingUpload,
  requestRecordingUpload,
  uploadErrorMessage,
  type UploadFlowDeps,
  type UploadSessionView,
} from "../src/lib/recordingUploadFlow";
import type { RecordingStore } from "../src/lib/recordingR2";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

// ── file format ───────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const ok: [string, string, string, string][] = [
    ["lesson.m4a", "audio/x-m4a", "m4a", "audio/mp4"],
    ["lesson.m4a", "audio/mp4", "m4a", "audio/mp4"],
    ["lesson.mp3", "audio/mpeg", "mp3", "audio/mpeg"],
    ["lesson.wav", "audio/wav", "wav", "audio/wav"],
    ["lesson.webm", "audio/webm;codecs=opus", "webm", "audio/webm"],
    ["lesson.M4A", "", "m4a", "audio/mp4"], // browsers that report no type: the extension decides
    ["lesson.mp3", "application/octet-stream", "mp3", "audio/mpeg"],
    ["lesson.flac", "audio/flac", "flac", "audio/flac"],
  ];
  for (const [name, type, ext, canonical] of ok) {
    const f = resolveRecordingFormat(name, type);
    assert(f?.ext === ext && f.contentType === canonical, `format: ${name} (${type || "no type"}) -> ${ext}`);
  }
  const bad: [unknown, unknown][] = [
    ["lesson.exe", "application/x-msdownload"],
    ["lesson.m4a", "video/mp4"], // a real type that is not audio is not rescued by the extension
    ["lesson.m4a", "text/html"],
    ["lesson.svg", "image/svg+xml"],
    ["lesson", ""], // no extension
    ["lesson.", "application/octet-stream"],
    ["lesson.txt", ""],
    ["lesson.m4a.exe", ""],
    [null, "audio/mp4"],
    ["lesson.m4a", null],
    [{}, []],
  ];
  for (const [name, type] of bad) assert(resolveRecordingFormat(name, type) === null, `format: rejects ${JSON.stringify([name, type])}`);
  // the extension of the stored object never comes from the file name
  const spoof = resolveRecordingFormat("../../etc/passwd.exe", "audio/mpeg");
  assert(spoof?.ext === "mp3", "format: the stored extension is chosen from the accepted type, not from the file name");
  assert(ALLOWED_RECORDING_EXTENSIONS.every((e) => /^[a-z0-9]{2,5}$/.test(e)), "format: every allowed extension is a plain lowercase word");
}

// ── size ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  assert(checkRecordingSize(30 * 1024 * 1024) === null, "size: a normal lesson is accepted");
  assert(checkRecordingSize(MIN_RECORDING_BYTES) === null && checkRecordingSize(MIN_RECORDING_BYTES - 1) === "too_small", "size: the lower bound");
  assert(checkRecordingSize(DEFAULT_MAX_RECORDING_BYTES) === null && checkRecordingSize(DEFAULT_MAX_RECORDING_BYTES + 1) === "too_large", "size: the default upper bound");
  for (const v of [0, -5, 1.5, NaN, Infinity, "5000000", null, undefined, {}, Number.MAX_SAFE_INTEGER + 2]) assert(checkRecordingSize(v) === "invalid", `size: rejects ${String(v)}`);
  assert(maxRecordingBytes({}) === DEFAULT_MAX_RECORDING_BYTES, "size: no setting -> default");
  assert(maxRecordingBytes({ RECORDING_MAX_BYTES: "52428800" }) === 52428800, "size: RECORDING_MAX_BYTES is honoured");
  assert(maxRecordingBytes({ RECORDING_MAX_BYTES: "99999999999" }) === ABSOLUTE_MAX_RECORDING_BYTES, "size: never above the absolute cap");
  for (const v of ["abc", "-1", "1e9", "", "12", "0"]) assert(maxRecordingBytes({ RECORDING_MAX_BYTES: v }) === DEFAULT_MAX_RECORDING_BYTES, `size: malformed setting "${v}" -> default`);
  assert(downloadUrlTtlSec({}) === 1800 && downloadUrlTtlSec({ RECORDING_DOWNLOAD_URL_TTL_SEC: "10" }) === 300 && downloadUrlTtlSec({ RECORDING_DOWNLOAD_URL_TTL_SEC: "999999" }) === 21600 && downloadUrlTtlSec({ RECORDING_DOWNLOAD_URL_TTL_SEC: "x" }) === 1800, "signed GET lifetime: default 30 min, clamped to 5 min .. 6 h");
}

// ── object key ────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const keys = new Set<string>();
  for (let i = 0; i < 2000; i++) keys.add(generateRecordingKey(10, "m4a"));
  assert(keys.size === 2000, "key: 2000 keys for the same lesson are all different (unpredictable UUIDs)");
  const sample = [...keys][0];
  assert(/^recordings\/10\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.m4a$/.test(sample), "key: recordings/{sessionId}/{uuid v4}.{ext}");
  assert(!/lesson|student|teacher|name/i.test(sample), "key: contains nothing the user typed");
  assert(generateRecordingKey(7, "wav", () => "11111111-1111-4111-8111-111111111111") === "recordings/7/11111111-1111-4111-8111-111111111111.wav", "key: shape with an injected UUID");
  for (const [id, ext] of [[0, "m4a"], [-1, "m4a"], [1.5, "m4a"], [NaN, "m4a"], [10, "exe"], [10, "../x"], [10, "M4A"], [10, ""]] as [number, string][]) {
    let threw = false;
    try {
      generateRecordingKey(id, ext);
    } catch {
      threw = true;
    }
    assert(threw, `key: refuses session ${id} / extension "${ext}"`);
  }
  let threw = false;
  try {
    generateRecordingKey(10, "m4a", () => "../../../etc/passwd");
  } catch {
    threw = true;
  }
  assert(threw, "key: a generator that returns something that is not a UUID can not produce a key");
}

// ── stored reference (driveFileId = "r2:recordings/...") ───────────────────────────────────────────────────────────────
{
  const key = generateRecordingKey(10, "mp3");
  const ref = formatStoredRef(key);
  assert(ref === `r2:${key}` && parseStoredRef(ref) === key && parseStoredRef(ref, 10) === key, "ref: round trip");
  assert(parseStoredRef(ref, 11) === null, "ref: a key of another lesson is refused");
  const bad: unknown[] = [null, undefined, 5, "", key, `r2:${key}x`, `R2:${key}`, "r2:recordings/10/../../x.mp3", "r2:recordings/10/abc.mp3", `r2:recordings/10/${key.slice(-39)}`, "drive:abc", `r2:other/10/${key.split("/")[2]}`, `r2:recordings/10/${key.split("/")[2].replace(".mp3", ".exe")}`, `r2:recordings/10/${key.split("/")[2].toUpperCase()}`, `${ref}\n`];
  for (const b of bad) assert(parseStoredRef(b) === null, `ref: rejects ${JSON.stringify(b)}`);
  let threw = false;
  try {
    formatStoredRef("recordings/10/not-a-uuid.mp3");
  } catch {
    threw = true;
  }
  assert(threw, "ref: formatStoredRef refuses a malformed key");
  assert(contentTypeMatchesKey(key, "audio/mpeg") && contentTypeMatchesKey(key, "audio/mp3; charset=x") && !contentTypeMatchesKey(key, "audio/mp4") && !contentTypeMatchesKey(key, "text/html") && !contentTypeMatchesKey(key, null), "ref: the reported Content-Type must fit the key's format");
}

// ── display name ──────────────────────────────────────────────────────────────────────────────────────────────────────
{
  assert(sanitizeDisplayFileName("Lei lesson 10-06.m4a", "m4a") === "Lei lesson 10-06.m4a", "name: a normal name is kept");
  assert(sanitizeDisplayFileName("C:\\Users\\a\\..\\secret\\lesson.m4a", "m4a") === "lesson.m4a" && sanitizeDisplayFileName("../../x/lesson.m4a", "m4a") === "lesson.m4a", "name: path parts are dropped");
  assert(sanitizeDisplayFileName("a\u0000b\u001f<c>.m4a", "m4a") === "abc.m4a", "name: control characters and markup characters are removed");
  assert(sanitizeDisplayFileName("..", "m4a") === "recording.m4a" && sanitizeDisplayFileName("   ", "wav") === "recording.wav" && sanitizeDisplayFileName(42, "mp3") === "recording.mp3", "name: nothing usable -> a neutral name");
  assert(sanitizeDisplayFileName("x".repeat(500) + ".m4a", "m4a").length === 120, "name: length is capped");
}

// ── flow: in-memory world ─────────────────────────────────────────────────────────────────────────────────────────────
const NOW = new Date("2026-10-06T11:00:00.000Z");
const CLASS_START = new Date("2026-10-06T10:30:00.000Z");
const FIFTY_MB = 50 * 1024 * 1024;
type Row = { id: number; processingStatus: string; driveFileId: string | null; updatedAt: Date; fileName: string; providerTranscriptId: string | null; provider: string | null; errorMessage: string | null; deletedAt: Date | null };

function world(opts: { teacherId?: number | null; status?: string; scheduledAt?: Date; deletedAt?: Date | null; recording?: Partial<Row> | null; headFails?: boolean; submit?: "ok" | "null" | "throw" } = {}) {
  const st = {
    session: { id: 10, teacherId: opts.teacherId === undefined ? 7 : opts.teacherId, status: opts.status ?? "SCHEDULED", scheduledAt: opts.scheduledAt ?? CLASS_START, deletedAt: opts.deletedAt ?? null },
    row: (opts.recording === null || opts.recording === undefined
      ? null
      : { id: 1, processingStatus: "UPLOADED", driveFileId: null, updatedAt: new Date(NOW.getTime() - 60_000), fileName: "old.m4a", providerTranscriptId: null, provider: null, errorMessage: null, deletedAt: null, ...opts.recording }) as Row | null,
    nextId: 100,
    objects: new Map<string, { size: number; contentType: string | null }>(),
    removed: [] as string[],
    uploadPresigns: [] as { key: string; contentType: string; ttl: number }[],
    downloadPresigns: [] as { key: string; ttl: number }[],
    submits: [] as string[],
    findCalls: 0,
    headCalls: 0,
  };
  const store: RecordingStore = {
    async presignUpload(key, contentType, ttl) {
      st.uploadPresigns.push({ key, contentType, ttl });
      return `https://upload.invalid/${key}?sig=u`;
    },
    async presignDownload(key, ttl) {
      st.downloadPresigns.push({ key, ttl });
      return `https://download.invalid/${key}?sig=d`;
    },
    async head(key) {
      st.headCalls++;
      await Promise.resolve();
      if (opts.headFails) throw new Error("R2 down");
      return st.objects.get(key) ?? null;
    },
    async remove(key) {
      st.removed.push(key);
      st.objects.delete(key);
    },
  };
  const deps: UploadFlowDeps = {
    async findSession(id) {
      st.findCalls++;
      await Promise.resolve();
      if (id !== st.session.id) return null;
      const r = st.row;
      const view: UploadSessionView = { ...st.session, recording: r ? { id: r.id, processingStatus: r.processingStatus, driveFileId: r.driveFileId, updatedAt: r.updatedAt } : null };
      return view;
    },
    async createRecording({ classSessionId, fileName, storedRef }) {
      await Promise.resolve();
      if (st.row || classSessionId !== st.session.id) return "exists"; // unique classSessionId
      st.row = { id: st.nextId++, processingStatus: "UPLOADED", driveFileId: storedRef, updatedAt: NOW, fileName, providerTranscriptId: null, provider: null, errorMessage: null, deletedAt: null };
      return "created";
    },
    async reuseRecording(id, fromStatuses, olderThan, { fileName, storedRef }) {
      await Promise.resolve();
      const r = st.row;
      if (!r || r.id !== id || !fromStatuses.includes(r.processingStatus) || (olderThan && !(r.updatedAt.getTime() < olderThan.getTime()))) return false;
      Object.assign(r, { processingStatus: "UPLOADED", driveFileId: storedRef, fileName, errorMessage: null, provider: null, providerTranscriptId: null, deletedAt: null, updatedAt: NOW });
      return true;
    },
    async claimForSubmit(id) {
      await Promise.resolve();
      const r = st.row;
      if (!r || r.id !== id || r.processingStatus !== "UPLOADED") return false;
      r.processingStatus = "PUBLIC_READY";
      return true;
    },
    async saveTranscribing(id, transcriptId) {
      await Promise.resolve();
      const r = st.row;
      if (!r || r.id !== id || r.processingStatus !== "PUBLIC_READY") return false;
      Object.assign(r, { processingStatus: "TRANSCRIBING", provider: "assemblyai", providerTranscriptId: transcriptId });
      return true;
    },
    async markUploadFailed(id, from, message) {
      await Promise.resolve();
      const r = st.row;
      if (!r || r.id !== id || !from.includes(r.processingStatus)) return false;
      Object.assign(r, { processingStatus: "UPLOAD_FAILED", errorMessage: message });
      return true;
    },
    store,
    async submit(url) {
      st.submits.push(url);
      await Promise.resolve();
      if (opts.submit === "throw") throw new Error("socket hang up");
      if (opts.submit === "null") return null;
      return { id: `tr-${st.submits.length}` };
    },
    maxBytes: DEFAULT_MAX_RECORDING_BYTES,
    downloadTtlSec: 1800,
    now: () => NOW,
  };
  /** an object as the browser would have uploaded it for the key currently stored on the row */
  const putObject = (size = FIFTY_MB, contentType: string | null = "audio/mp4") => {
    const key = parseStoredRef(st.row?.driveFileId, 10);
    if (!key) throw new Error("no key on the row");
    st.objects.set(key, { size, contentType });
    return key;
  };
  return { st, deps, putObject };
}
const REQ = { teacherId: 7, sessionId: 10, fileName: "lesson.m4a", contentType: "audio/mp4", size: FIFTY_MB };

async function main() {
  // ── request: the happy path ────────────────────────────────────────────────────────────────────────────────────────
  {
    const w = world();
    const r = await requestRecordingUpload(w.deps, REQ);
    assert(r.ok === true, "request: a normal request for an own, started lesson is accepted");
    const key = w.st.uploadPresigns[0]?.key;
    assert(!!w.st.row && w.st.row.processingStatus === "UPLOADED" && w.st.row.driveFileId === `r2:${key}`, "request: one row, UPLOADED, with the key stored as r2:recordings/...");
    assert(/^recordings\/10\/[0-9a-f-]{36}\.m4a$/.test(key), "request: the key was generated by the server");
    assert(w.st.uploadPresigns.length === 1 && w.st.uploadPresigns[0].contentType === "audio/mp4" && w.st.uploadPresigns[0].ttl === UPLOAD_URL_TTL_SEC && UPLOAD_URL_TTL_SEC <= 900, "request: the URL is signed for that key and type with a short lifetime");
    assert(r.ok && Object.keys(r).sort().join() === "contentType,expiresInSec,ok,uploadUrl", "request: the browser gets only the URL, the type and the lifetime");
    assert(r.ok && !("key" in r) && !("storedRef" in r), "request: the object key is not returned as a field");
    assert(w.st.submits.length === 0 && w.st.downloadPresigns.length === 0, "request: nothing is sent to AssemblyAI and no read URL exists yet");
    assert(w.st.row?.fileName === "lesson.m4a", "request: the display name is stored");
  }
  // the stored key never comes from the request
  {
    const w = world();
    await requestRecordingUpload(w.deps, { ...REQ, fileName: "../../../etc/passwd.m4a" });
    assert(w.st.row?.fileName === "passwd.m4a" && /^r2:recordings\/10\/[0-9a-f-]{36}\.m4a$/.test(w.st.row?.driveFileId ?? ""), "request: a hostile file name changes neither the key nor the folder");
  }

  // ── request: input validation happens before any database access ───────────────────────────────────────────────────
  {
    const w = world();
    const bad: [string, Record<string, unknown>, string][] = [
      ["session id as text", { sessionId: "10" }, "invalid_request"],
      ["session id NaN", { sessionId: NaN }, "invalid_request"],
      ["session id 0", { sessionId: 0 }, "invalid_request"],
      ["session id negative", { sessionId: -3 }, "invalid_request"],
      ["session id fractional", { sessionId: 1.5 }, "invalid_request"],
      ["unsupported type", { contentType: "application/pdf", fileName: "a.pdf" }, "unsupported_format"],
      ["size 0", { size: 0 }, "invalid_size"],
      ["size text", { size: "50" }, "invalid_size"],
      ["size NaN", { size: NaN }, "invalid_size"],
      ["too small", { size: 100 }, "too_small"],
      ["too large", { size: DEFAULT_MAX_RECORDING_BYTES + 1 }, "too_large"],
    ];
    for (const [label, patch, code] of bad) {
      const r = await requestRecordingUpload(w.deps, { ...REQ, ...patch });
      assert(!r.ok && r.error === code, `request: rejects ${label} (${code})`);
    }
    assert(w.st.findCalls === 0 && !w.st.row && w.st.uploadPresigns.length === 0, "request: invalid input touches neither the database nor the storage");
  }

  // ── request: ownership and class state ─────────────────────────────────────────────────────────────────────────────
  {
    const other = world();
    const a = await requestRecordingUpload(other.deps, { ...REQ, teacherId: 8 });
    const missing = await requestRecordingUpload(other.deps, { ...REQ, sessionId: 999 });
    assert(!a.ok && a.error === "not_found" && !missing.ok && missing.error === "not_found", "request: another teacher's lesson gets the same answer as a lesson that does not exist");
    assert(!other.st.row && other.st.uploadPresigns.length === 0, "request: another teacher's call creates no row and issues no URL");
    const noTeacher = await requestRecordingUpload(world({ teacherId: null }).deps, REQ);
    assert(!noTeacher.ok && noTeacher.error === "not_found", "request: a lesson without a teacher is not uploadable by anyone");
    const deleted = await requestRecordingUpload(world({ deletedAt: new Date() }).deps, REQ);
    assert(!deleted.ok && deleted.error === "not_found", "request: a deleted lesson is 'not found'");

    const early = world({ scheduledAt: new Date(NOW.getTime() + 3600_000) });
    const e = await requestRecordingUpload(early.deps, REQ);
    assert(!e.ok && e.error === "blocked" && /class time/.test(uploadErrorMessage(e.error, e.message)) && !early.st.row && early.st.uploadPresigns.length === 0, "request: before the class starts -> blocked, no row, no URL");
    for (const status of ["CANCELLED", "LEAVE", "HOLD"]) {
      const w = world({ status });
      const r = await requestRecordingUpload(w.deps, REQ);
      assert(!r.ok && r.error === "blocked" && !w.st.row && w.st.uploadPresigns.length === 0, `request: a ${status} class is blocked`);
    }
    const done = world({ status: "COMPLETED" });
    assert((await requestRecordingUpload(done.deps, REQ)).ok, "request: a COMPLETED class may still get its recording");
  }

  // ── request: one recording per lesson ──────────────────────────────────────────────────────────────────────────────
  {
    const w = world();
    const [a, b] = await Promise.all([requestRecordingUpload(w.deps, REQ), requestRecordingUpload(w.deps, REQ)]);
    assert([a, b].filter((r) => r.ok).length === 1 && [a, b].filter((r) => !r.ok && r.error === "in_progress").length === 1, "request: two simultaneous requests -> exactly one wins, the other 'in progress'");
    assert(w.st.row?.processingStatus === "UPLOADED", "request: the lesson has exactly one row");

    for (const status of ["PUBLIC_READY", "TRANSCRIBING"]) {
      const x = world({ recording: { processingStatus: status } });
      const r = await requestRecordingUpload(x.deps, REQ);
      assert(!r.ok && r.error === "in_progress" && x.st.uploadPresigns.length === 1 && x.st.removed.length === 0, `request: a ${status} recording is not replaced`);
    }
    for (const status of ["TRANSCRIBED", "NEEDS_REVIEW", "PUBLISHED", "COMPLETED", "NEEDS_SPEAKER_CONFIRMATION", "ANALYZING"]) {
      const x = world({ recording: { processingStatus: status } });
      const r = await requestRecordingUpload(x.deps, REQ);
      assert(!r.ok && r.error === "already_exists" && x.st.row?.processingStatus === status, `request: a ${status} recording can not be uploaded over`);
    }
    const analysisFailed = world({ recording: { processingStatus: "ANALYSIS_FAILED" } });
    const af = await requestRecordingUpload(analysisFailed.deps, REQ);
    assert(!af.ok && af.error === "not_retryable" && analysisFailed.st.row?.processingStatus === "ANALYSIS_FAILED", "request: ANALYSIS_FAILED is not re-uploaded (the transcript exists; a second transcription would be paid twice)");
  }

  // ── request: a failed row is reused ────────────────────────────────────────────────────────────────────────────────
  {
    const oldKey = generateRecordingKey(10, "m4a");
    for (const status of ["UPLOAD_FAILED", "TRANSCRIPTION_FAILED"]) {
      const w = world({ recording: { id: 5, processingStatus: status, driveFileId: formatStoredRef(oldKey), providerTranscriptId: "tr-old", provider: "assemblyai", errorMessage: "x", fileName: "old.m4a" } });
      w.st.objects.set(oldKey, { size: FIFTY_MB, contentType: "audio/mp4" });
      const r = await requestRecordingUpload(w.deps, REQ);
      const row = w.st.row!;
      assert(r.ok && row.id === 5 && row.processingStatus === "UPLOADED", `retry: the ${status} row is reused (same id, back to UPLOADED)`);
      assert(row.driveFileId !== formatStoredRef(oldKey) && row.providerTranscriptId === null && row.provider === null && row.errorMessage === null, `retry: ${status} -> new key, old transcript id and error cleared`);
      assert(w.st.removed.includes(oldKey), `retry: the previous object of the ${status} row is deleted`);
    }
    // two simultaneous retries: the conditional update lets only one through
    const w = world({ recording: { id: 5, processingStatus: "UPLOAD_FAILED", driveFileId: formatStoredRef(oldKey) } });
    const [a, b] = await Promise.all([requestRecordingUpload(w.deps, REQ), requestRecordingUpload(w.deps, REQ)]);
    assert([a, b].filter((r) => r.ok).length === 1 && [a, b].filter((r) => !r.ok && r.error === "in_progress").length === 1, "retry: two simultaneous retries -> exactly one wins");
    assert(w.st.removed.filter((k) => k === oldKey).length === 1, "retry: the old object is removed once");
    // an UPLOADED row is only restarted once its URL has expired
    const fresh = world({ recording: { processingStatus: "UPLOADED", updatedAt: new Date(NOW.getTime() - 60_000), driveFileId: formatStoredRef(oldKey) } });
    const rf = await requestRecordingUpload(fresh.deps, REQ);
    assert(!rf.ok && rf.error === "in_progress" && fresh.st.row?.driveFileId === formatStoredRef(oldKey), "retry: a fresh UPLOADED row is left alone");
    const stale = world({ recording: { processingStatus: "UPLOADED", updatedAt: new Date(NOW.getTime() - UPLOAD_RESTART_AFTER_MS - 1000), driveFileId: formatStoredRef(oldKey) } });
    const rs = await requestRecordingUpload(stale.deps, REQ);
    assert(rs.ok && stale.st.row?.driveFileId !== formatStoredRef(oldKey), "retry: an UPLOADED row whose URL has expired can be restarted");
    assert(UPLOAD_RESTART_AFTER_MS > UPLOAD_URL_TTL_SEC * 1000, "retry: the restart window is longer than the URL lifetime");
  }

  // ── complete: the happy path ───────────────────────────────────────────────────────────────────────────────────────
  {
    const w = world();
    await requestRecordingUpload(w.deps, REQ);
    const key = w.putObject();
    const r = await completeRecordingUpload(w.deps, { teacherId: 7, sessionId: 10 });
    assert(r.ok && r.state === "submitted", "complete: an uploaded file is submitted");
    assert(w.st.submits.length === 1 && w.st.submits[0] === `https://download.invalid/${key}?sig=d`, "complete: AssemblyAI gets the short-lived read URL of exactly this object");
    assert(w.st.downloadPresigns.length === 1 && w.st.downloadPresigns[0].key === key && w.st.downloadPresigns[0].ttl === 1800, "complete: the read URL is issued once, for that key, with the configured lifetime");
    assert(w.st.row?.processingStatus === "TRANSCRIBING" && w.st.row.providerTranscriptId === "tr-1" && w.st.row.provider === "assemblyai", "complete: TRANSCRIBING with the transcript id");
    assert(!JSON.stringify(r).includes("download.invalid") && !JSON.stringify(r).includes(key), "complete: the read URL and the key are not in the answer to the browser");
    assert(w.st.removed.length === 0, "complete: the original is kept until the retention rule removes it");
  }

  // ── complete: duplicates ───────────────────────────────────────────────────────────────────────────────────────────
  {
    const w = world();
    await requestRecordingUpload(w.deps, REQ);
    w.putObject();
    const results = await Promise.all([1, 2, 3, 4].map(() => completeRecordingUpload(w.deps, { teacherId: 7, sessionId: 10 })));
    assert(w.st.submits.length === 1, "complete: four simultaneous complete requests -> AssemblyAI is called exactly once");
    assert(results.every((r) => r.ok), "complete: the others are answered as 'already submitted', not as errors");
    const again = await completeRecordingUpload(w.deps, { teacherId: 7, sessionId: 10 });
    assert(again.ok && again.state === "already_submitted" && w.st.submits.length === 1, "complete: a later repeat is a no-op");
    for (const status of ["TRANSCRIBED", "NEEDS_REVIEW", "PUBLISHED"]) {
      const x = world({ recording: { processingStatus: status, driveFileId: formatStoredRef(generateRecordingKey(10, "m4a")) } });
      const r = await completeRecordingUpload(x.deps, { teacherId: 7, sessionId: 10 });
      assert(r.ok && r.state === "already_submitted" && x.st.submits.length === 0 && x.st.headCalls === 0, `complete: a ${status} recording is never submitted again`);
    }
  }

  // ── complete: authorization ────────────────────────────────────────────────────────────────────────────────────────
  {
    const w = world();
    await requestRecordingUpload(w.deps, REQ);
    w.putObject();
    const other = await completeRecordingUpload(w.deps, { teacherId: 8, sessionId: 10 });
    assert(!other.ok && other.error === "not_found" && w.st.submits.length === 0 && w.st.headCalls === 0, "complete: another teacher can not submit this lesson's recording");
    for (const bad of ["10", NaN, -1, 0, 2.5, null, undefined]) {
      const r = await completeRecordingUpload(w.deps, { teacherId: 7, sessionId: bad });
      assert(!r.ok && r.error === "invalid_request", `complete: rejects session id ${String(bad)}`);
    }
    const none = world();
    const r = await completeRecordingUpload(none.deps, { teacherId: 7, sessionId: 10 });
    assert(!r.ok && r.error === "no_upload" && none.st.submits.length === 0, "complete: no upload was requested -> nothing to finish");
    const cancelled = world({ status: "CANCELLED", recording: { driveFileId: formatStoredRef(generateRecordingKey(10, "m4a")) } });
    const c = await completeRecordingUpload(cancelled.deps, { teacherId: 7, sessionId: 10 });
    assert(!c.ok && c.error === "blocked" && cancelled.st.submits.length === 0, "complete: a class cancelled in the meantime is not submitted");
  }

  // ── complete: the object in the bucket does not match ──────────────────────────────────────────────────────────────
  {
    const missing = world();
    await requestRecordingUpload(missing.deps, REQ);
    const m = await completeRecordingUpload(missing.deps, { teacherId: 7, sessionId: 10 });
    assert(!m.ok && m.error === "upload_missing" && missing.st.row?.processingStatus === "UPLOADED" && missing.st.submits.length === 0, "HEAD: the object is not there -> error, the row stays UPLOADED, nothing is submitted");
    const key = missing.putObject();
    const later = await completeRecordingUpload(missing.deps, { teacherId: 7, sessionId: 10 });
    assert(later.ok && missing.st.submits.length === 1 && missing.st.objects.has(key), "HEAD: once the upload has really finished the same row completes");

    const cases: [string, number, string | null][] = [
      ["empty object", 0, "audio/mp4"],
      ["tiny object", 100, "audio/mp4"],
      ["oversized object", DEFAULT_MAX_RECORDING_BYTES + 1, "audio/mp4"],
      ["wrong Content-Type (html)", FIFTY_MB, "text/html"],
      ["wrong format (mp3 for an m4a key)", FIFTY_MB, "audio/mpeg"],
      ["no Content-Type", FIFTY_MB, null],
    ];
    for (const [label, size, type] of cases) {
      const w = world();
      await requestRecordingUpload(w.deps, REQ);
      const k = w.putObject(size, type);
      const r = await completeRecordingUpload(w.deps, { teacherId: 7, sessionId: 10 });
      assert(!r.ok && r.error === "upload_invalid", `HEAD: ${label} is refused`);
      assert(w.st.row?.processingStatus === "UPLOAD_FAILED" && w.st.removed.includes(k) && w.st.submits.length === 0, `HEAD: ${label} -> UPLOAD_FAILED, object deleted, nothing submitted`);
      const retry = await requestRecordingUpload(w.deps, REQ);
      assert(retry.ok && w.st.row?.processingStatus === "UPLOADED", `HEAD: after ${label} the teacher can upload again`);
    }
    const down = world({ headFails: true });
    await requestRecordingUpload(down.deps, REQ);
    const d = await completeRecordingUpload(down.deps, { teacherId: 7, sessionId: 10 });
    assert(!d.ok && d.error === "storage_unavailable" && down.st.row?.processingStatus === "UPLOADED" && down.st.submits.length === 0, "HEAD: the storage being down changes nothing and submits nothing");
  }

  // ── complete: the stored reference is untrusted ────────────────────────────────────────────────────────────────────
  {
    const foreign = formatStoredRef(generateRecordingKey(99, "m4a"));
    for (const ref of [foreign, "r2:recordings/10/../../x.m4a", "drive:abc", "", null]) {
      const w = world({ recording: { processingStatus: "UPLOADED", driveFileId: ref } });
      const r = await completeRecordingUpload(w.deps, { teacherId: 7, sessionId: 10 });
      assert(!r.ok && r.error === "upload_invalid" && w.st.headCalls === 0 && w.st.removed.length === 0 && w.st.submits.length === 0 && w.st.downloadPresigns.length === 0, `reference: ${JSON.stringify(ref)} is refused before any storage call`);
    }
  }

  // ── complete: AssemblyAI does not take it ──────────────────────────────────────────────────────────────────────────
  {
    for (const mode of ["null", "throw"] as const) {
      const w = world({ submit: mode });
      await requestRecordingUpload(w.deps, REQ);
      w.putObject();
      const r = await completeRecordingUpload(w.deps, { teacherId: 7, sessionId: 10 });
      assert(!r.ok && r.error === "submit_failed", `submit (${mode}): reported as a failure`);
      assert(w.st.row?.processingStatus === "UPLOAD_FAILED" && w.st.row.providerTranscriptId === null && w.st.submits.length === 1, `submit (${mode}): UPLOAD_FAILED, no transcript id, exactly one attempt (never retried automatically)`);
      const again = await completeRecordingUpload(w.deps, { teacherId: 7, sessionId: 10 });
      assert(!again.ok && again.error === "no_upload" && w.st.submits.length === 1, `submit (${mode}): finishing again does not submit again`);
      const retry = await requestRecordingUpload(w.deps, REQ);
      assert(retry.ok && w.st.row?.processingStatus === "UPLOADED", `submit (${mode}): the teacher's deliberate retry re-arms the same row`);
    }
  }

  // ── error messages never carry internals ───────────────────────────────────────────────────────────────────────────
  {
    const all = (["invalid_request", "not_found", "unsupported_format", "invalid_size", "too_small", "too_large", "already_exists", "in_progress", "no_upload", "upload_missing", "upload_invalid", "not_retryable", "storage_unavailable", "submit_failed"] as const).map((c) => uploadErrorMessage(c));
    assert(all.every((m) => m.length > 10 && !/r2|bucket|assemblyai|key|secret|http|recordings\//i.test(m)), "messages: fixed English texts without storage, vendor or key names");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("ERROR:", String(e?.stack ?? e).slice(0, 600));
  process.exit(1);
});
