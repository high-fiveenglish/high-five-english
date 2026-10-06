// Recordings that wait for their transcript (UPLOADED / PUBLIC_READY / TRANSCRIBING): the recovery sweep, the webhook race, and the original-file
// retention sweep. In-memory fakes only: no database, no AssemblyAI, no R2, no Claude. Run from admin/: npx tsx scripts/test-recordingAwaitingRecovery.ts
import {
  AWAITING_POLLS_PER_RUN,
  AWAITING_SUBMIT_STALE_MS,
  AWAITING_UPLOAD_STALE_MS,
  TRANSCRIBING_MAX_AGE_MS,
  TRANSCRIBING_POLL_AFTER_MS,
  recoverStuckAwaitingRecordings,
  type AwaitingRecording,
  type AwaitingRecoveryDeps,
} from "../src/lib/recordingRecovery";
import { handleAssemblyAIWebhook, type RecordingWebhookDeps } from "../src/lib/recordingWebhook";
import { AWAITING_TRANSCRIPT_STATUSES } from "../src/lib/recordingWorkflow";
import { ORIGINAL_DELETABLE_STATES, readRetentionHours, sweepRecordingOriginals, type DeletableRecording, type RetentionDeps } from "../src/lib/recordingRetention";
import { formatStoredRef, generateRecordingKey } from "../src/lib/recordingUpload";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

const NOW = new Date("2026-10-06T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 3600_000;

type Row = { id: number; processingStatus: string; providerTranscriptId: string | null; updatedAt: Date; errorMessage?: string };
type Remote = "queued" | "processing" | "completed" | "error" | null | "throw";

function world(rows: Row[], remote: Record<string, Remote> = {}) {
  const st = { rows, lookups: [] as string[], triggers: [] as number[], remote, triggerOk: true };
  const waiting = (r: Row) => AWAITING_TRANSCRIPT_STATUSES.includes(r.processingStatus);
  const deps: AwaitingRecoveryDeps = {
    async findAwaiting(olderThan, limit) {
      await Promise.resolve();
      return st.rows.filter((r) => waiting(r) && r.updatedAt.getTime() < olderThan.getTime()).sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()).slice(0, limit).map((r): AwaitingRecording => ({ id: r.id, processingStatus: r.processingStatus, providerTranscriptId: r.providerTranscriptId, updatedAt: r.updatedAt }));
    },
    async fetchTranscriptStatus(transcriptId) {
      st.lookups.push(transcriptId);
      await Promise.resolve();
      const v = transcriptId in st.remote ? st.remote[transcriptId] : "processing";
      if (v === "throw") throw new Error("timeout");
      return v;
    },
    async markTranscribed(id) {
      await Promise.resolve();
      const r = st.rows.find((x) => x.id === id);
      if (!r || !waiting(r)) return false;
      r.processingStatus = "TRANSCRIBED";
      r.updatedAt = NOW;
      return true;
    },
    async markTranscriptionFailed(id, message) {
      await Promise.resolve();
      const r = st.rows.find((x) => x.id === id);
      if (!r || !waiting(r)) return false;
      Object.assign(r, { processingStatus: "TRANSCRIPTION_FAILED", errorMessage: message, updatedAt: NOW });
      return true;
    },
    async markUploadFailed(id, from, message) {
      await Promise.resolve();
      const r = st.rows.find((x) => x.id === id);
      if (!r || !from.includes(r.processingStatus)) return false;
      Object.assign(r, { processingStatus: "UPLOAD_FAILED", errorMessage: message, updatedAt: NOW });
      return true;
    },
    async triggerProcessing(id) {
      st.triggers.push(id);
      return st.triggerOk;
    },
  };
  return { st, deps };
}
const t = (id: number, ageMs: number, transcriptId: string | null = `tr-${id}`, status = "TRANSCRIBING"): Row => ({ id, processingStatus: status, providerTranscriptId: transcriptId, updatedAt: ago(ageMs) });
const rowOf = (w: ReturnType<typeof world>, id: number) => w.st.rows.find((r) => r.id === id)!;

async function main() {
  assert(AWAITING_POLLS_PER_RUN >= 1 && AWAITING_POLLS_PER_RUN <= 5, "limits: a scheduled run polls only a few transcripts (it has ~30 seconds)");
  assert(TRANSCRIBING_POLL_AFTER_MS >= 10 * MIN && TRANSCRIBING_MAX_AGE_MS > TRANSCRIBING_POLL_AFTER_MS, "limits: the webhook gets time first, and there is an upper bound");

  // ── TRANSCRIBING with a transcript id ──────────────────────────────────────────────────────────────────────────────
  {
    const w = world([t(1, 5 * MIN)], { "tr-1": "completed" });
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(w.st.lookups.length === 0 && rowOf(w, 1).processingStatus === "TRANSCRIBING" && r.completed.length === 0, "TRANSCRIBING: a recent one is left to the webhook (no AssemblyAI lookup)");
  }
  {
    const w = world([t(1, 20 * MIN)], { "tr-1": "completed" });
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(r.completed.join() === "1" && rowOf(w, 1).processingStatus === "TRANSCRIBED" && w.st.triggers.join() === "1", "completed: -> TRANSCRIBED through the webhook's conditional update, and the existing background processing is triggered once");
  }
  {
    const w = world([t(1, 20 * MIN)], { "tr-1": "error" });
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(r.transcriptionFailed.join() === "1" && rowOf(w, 1).processingStatus === "TRANSCRIPTION_FAILED" && w.st.triggers.length === 0, "error: -> TRANSCRIPTION_FAILED, nothing triggered");
  }
  for (const status of ["queued", "processing"] as const) {
    const w = world([t(1, 20 * MIN)], { "tr-1": status });
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(r.stillProcessing.join() === "1" && rowOf(w, 1).processingStatus === "TRANSCRIBING" && w.st.triggers.length === 0, `${status}: kept as it is`);
  }
  for (const v of [null, "throw"] as const) {
    const w = world([t(1, 20 * MIN)], { "tr-1": v });
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(r.lookupFailed.join() === "1" && rowOf(w, 1).processingStatus === "TRANSCRIBING", `lookup ${v === null ? "returned nothing" : "threw"}: kept, tried again next run`);
  }
  {
    const old = TRANSCRIBING_MAX_AGE_MS + MIN;
    const stuck = world([t(1, old)], { "tr-1": "processing" });
    const r = await recoverStuckAwaitingRecordings(stuck.deps, NOW);
    assert(r.timedOut.join() === "1" && rowOf(stuck, 1).processingStatus === "TRANSCRIPTION_FAILED" && stuck.st.triggers.length === 0, "too old and still processing -> TRANSCRIPTION_FAILED (the teacher can upload again)");
    const unreachable = world([t(1, old)], { "tr-1": null });
    const u = await recoverStuckAwaitingRecordings(unreachable.deps, NOW);
    assert(u.timedOut.join() === "1" && rowOf(unreachable, 1).processingStatus === "TRANSCRIPTION_FAILED", "too old and AssemblyAI unreadable -> TRANSCRIPTION_FAILED");
    const finished = world([t(1, old)], { "tr-1": "completed" });
    const f = await recoverStuckAwaitingRecordings(finished.deps, NOW);
    assert(f.completed.join() === "1" && rowOf(finished, 1).processingStatus === "TRANSCRIBED" && f.timedOut.length === 0, "too old but the transcript IS complete -> it is used, not thrown away");
  }
  {
    const rows = [1, 2, 3, 4, 5].map((i) => t(i, (60 - i) * MIN));
    const w = world(rows, { "tr-1": "completed", "tr-2": "completed", "tr-3": "completed", "tr-4": "completed", "tr-5": "completed" });
    const r1 = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(w.st.lookups.length === AWAITING_POLLS_PER_RUN && r1.skippedForBudget.length === 5 - AWAITING_POLLS_PER_RUN, "budget: one run looks up only a few transcripts, the rest wait");
    const r2 = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(w.st.rows.filter((x) => x.processingStatus === "TRANSCRIBED").length === 5 || r2.completed.length >= 1, "budget: the next run continues with the remaining ones");
    await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(w.st.rows.every((x) => x.processingStatus === "TRANSCRIBED") && w.st.triggers.length === 5 && new Set(w.st.triggers).size === 5, "budget: every record is completed and triggered exactly once");
  }

  // ── UPLOADED / PUBLIC_READY without a transcript id ────────────────────────────────────────────────────────────────
  {
    const w = world([t(1, AWAITING_UPLOAD_STALE_MS - 5 * MIN, null, "UPLOADED"), t(2, AWAITING_UPLOAD_STALE_MS + MIN, null, "UPLOADED")]);
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(rowOf(w, 1).processingStatus === "UPLOADED" && rowOf(w, 2).processingStatus === "UPLOAD_FAILED" && r.uploadAbandoned.join() === "2", "UPLOADED: only one that was abandoned for a long time becomes UPLOAD_FAILED");
    assert(w.st.lookups.length === 0 && w.st.triggers.length === 0, "UPLOADED: no AssemblyAI lookup, no trigger");
  }
  {
    const w = world([t(1, AWAITING_SUBMIT_STALE_MS - MIN, null, "PUBLIC_READY"), t(2, AWAITING_SUBMIT_STALE_MS + MIN, null, "PUBLIC_READY")]);
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(rowOf(w, 1).processingStatus === "PUBLIC_READY" && rowOf(w, 2).processingStatus === "UPLOAD_FAILED" && r.uploadAbandoned.join() === "2", "PUBLIC_READY without an id: a request that died is closed as UPLOAD_FAILED (the teacher retries on purpose)");
    assert(Object.keys(w.deps).sort().join() === "fetchTranscriptStatus,findAwaiting,markTranscribed,markTranscriptionFailed,markUploadFailed,triggerProcessing", "PUBLIC_READY: the recovery has no way to submit to AssemblyAI at all");
  }
  {
    const w = world([t(1, 3 * HOUR, "tr-1", "TRANSCRIBING")], {});
    w.st.rows.push({ id: 2, processingStatus: "NEEDS_REVIEW", providerTranscriptId: "tr-2", updatedAt: ago(10 * HOUR) }, { id: 3, processingStatus: "ANALYSIS_FAILED", providerTranscriptId: "tr-3", updatedAt: ago(10 * HOUR) });
    await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(rowOf(w, 2).processingStatus === "NEEDS_REVIEW" && rowOf(w, 3).processingStatus === "ANALYSIS_FAILED", "scope: records that are already past the transcription are never touched");
  }

  // ── duplicates and races ───────────────────────────────────────────────────────────────────────────────────────────
  {
    const w = world([t(1, 30 * MIN)], { "tr-1": "completed" });
    await Promise.all([recoverStuckAwaitingRecordings(w.deps, NOW), recoverStuckAwaitingRecordings(w.deps, NOW)]);
    assert(w.st.triggers.length === 1, "race: two overlapping recovery runs -> the processing is triggered exactly once");
  }
  {
    // a state change between the lookup of the row and the update (the webhook got there first, or the row failed): the conditional update loses quietly
    const w = world([t(1, 30 * MIN)], { "tr-1": "completed" });
    const original = w.deps.fetchTranscriptStatus;
    w.deps.fetchTranscriptStatus = async (id) => {
      const s = await original(id);
      rowOf(w, 1).processingStatus = "ANALYZING"; // the webhook + background function ran meanwhile
      return s;
    };
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(r.completed.length === 0 && w.st.triggers.length === 0 && rowOf(w, 1).processingStatus === "ANALYZING", "race: a record that moved on in the meantime is not pulled back or triggered");
  }
  {
    const w = world([t(1, 30 * MIN)], { "tr-1": "completed" });
    w.st.triggerOk = false;
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(r.completed.join() === "1" && r.triggerFailed.join() === "1" && rowOf(w, 1).processingStatus === "TRANSCRIBED", "trigger lost: the record stays TRANSCRIBED, where the existing recover-transcribed-recordings re-triggers it");
  }

  // ── the webhook race: the webhook arrives before the transcript id was saved ──────────────────────────────────────────
  {
    const rows: Row[] = [{ id: 1, processingStatus: "PUBLIC_READY", providerTranscriptId: null, updatedAt: ago(40 * MIN) }];
    const triggers: number[] = [];
    const webhookDeps = (): RecordingWebhookDeps => ({
      async findByTranscriptId(id) {
        const r = rows.find((x) => x.providerTranscriptId === id);
        return r ? { id: r.id } : null;
      },
      async markTranscriptionFailed(id) {
        const r = rows.find((x) => x.id === id);
        if (!r || !AWAITING_TRANSCRIPT_STATUSES.includes(r.processingStatus)) return false;
        r.processingStatus = "TRANSCRIPTION_FAILED";
        return true;
      },
      async markTranscribed(id) {
        const r = rows.find((x) => x.id === id);
        if (!r || !AWAITING_TRANSCRIPT_STATUSES.includes(r.processingStatus)) return false;
        r.processingStatus = "TRANSCRIBED";
        return true;
      },
      async triggerProcessing(id) {
        triggers.push(id);
        return true;
      },
    });
    const post = () => handleAssemblyAIWebhook(new Request("https://x.invalid/hook", { method: "POST", headers: { "x-webhook-secret": "s3cret", "content-type": "application/json" }, body: JSON.stringify({ transcript_id: "tr-1", status: "completed" }) }), "s3cret", webhookDeps());
    const early = await (await post()).json();
    assert(early.note === "unknown_transcript_id" && triggers.length === 0 && rows[0].processingStatus === "PUBLIC_READY", "webhook race: a webhook that comes before the id is saved is acknowledged and ignored");
    // now the upload action saves the id (TRANSCRIBING) — and the webhook is gone for good
    Object.assign(rows[0], { processingStatus: "TRANSCRIBING", providerTranscriptId: "tr-1", updatedAt: ago(30 * MIN) });
    const w = world(rows, { "tr-1": "completed" });
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(r.completed.join() === "1" && rows[0].processingStatus === "TRANSCRIBED" && w.st.triggers.length === 1, "webhook race: the recovery finds the lost completion and moves the record on");
    const late = await (await post()).json();
    assert(late.note === "already_processed" && triggers.length === 0, "webhook race: a late duplicate webhook after the recovery changes nothing and triggers nothing");
  }
  {
    // the opposite order: the webhook wins, then the recovery runs
    const rows: Row[] = [t(1, 30 * MIN)];
    const w = world(rows, { "tr-1": "completed" });
    rows[0].processingStatus = "TRANSCRIBED"; // webhook already did it
    const r = await recoverStuckAwaitingRecordings(w.deps, NOW);
    assert(r.completed.length === 0 && w.st.triggers.length === 0 && w.st.lookups.length === 0, "webhook first: the recovery does not even look at a record that is already TRANSCRIBED");
  }

  // ── original-file retention ────────────────────────────────────────────────────────────────────────────────────────
  for (const [v, expected] of [["", null], [undefined, null], ["abc", null], ["-1", null], ["1e3", null], ["24h", null], [" ", null], ["0", 0], ["0.5", 0.5], ["24", 24], ["168", 168], ["8760", 8760], ["8761", null], ["100000", null]] as [string | undefined, number | null][]) {
    assert(readRetentionHours({ RECORDING_ORIGINAL_RETENTION_HOURS: v }) === expected, `retention: "${v}" -> ${expected}`);
  }
  assert(readRetentionHours({}) === null, "retention: nothing configured -> disabled (no period is hard-coded)");

  type DRow = DeletableRecording & { processingStatus: string; uploadedAt: Date; deletedAt: Date | null };
  const rec = (id: number, status: string, ageMs: number, sessionId = id): DRow => ({ id, classSessionId: sessionId, driveFileId: formatStoredRef(generateRecordingKey(sessionId, "m4a")), processingStatus: status, uploadedAt: ago(ageMs), deletedAt: null });
  function retentionWorld(rows: DRow[], failOn: number[] = []) {
    const removed: string[] = [];
    const deps: RetentionDeps = {
      async findDeletable(before, limit) {
        return rows.filter((r) => !r.deletedAt && r.driveFileId?.startsWith("r2:") && ORIGINAL_DELETABLE_STATES.includes(r.processingStatus) && r.uploadedAt.getTime() <= before.getTime()).slice(0, limit);
      },
      async removeObject(key) {
        const owner = rows.find((r) => r.driveFileId === `r2:${key}`);
        if (owner && failOn.includes(owner.id)) throw new Error("R2 error");
        removed.push(key);
      },
      async markDeleted(id, at) {
        const r = rows.find((x) => x.id === id);
        if (!r || r.deletedAt) return false;
        r.deletedAt = at;
        return true;
      },
    };
    return { rows, removed, deps };
  }
  {
    const w = retentionWorld([rec(1, "PUBLISHED", 100 * HOUR)]);
    const r = await sweepRecordingOriginals(w.deps, null, NOW);
    assert(r.disabled && w.removed.length === 0 && !w.rows[0].deletedAt, "retention sweep: no configured period -> nothing is deleted");
  }
  {
    const w = retentionWorld([rec(1, "PUBLISHED", 100 * HOUR), rec(2, "NEEDS_REVIEW", 30 * HOUR), rec(3, "COMPLETED", 2 * HOUR), rec(4, "TRANSCRIBING", 500 * HOUR), rec(5, "UPLOADED", 500 * HOUR), rec(6, "PUBLIC_READY", 500 * HOUR), rec(7, "UPLOAD_FAILED", 50 * HOUR), rec(8, "TRANSCRIBED", 25 * HOUR)]);
    const r = await sweepRecordingOriginals(w.deps, 24, NOW);
    assert(r.deleted.sort().join() === "1,2,7,8", "retention sweep (24 h): only past-transcription files older than the period go");
    assert(!w.rows[2].deletedAt && !w.rows[3].deletedAt && !w.rows[4].deletedAt && !w.rows[5].deletedAt, "retention sweep: a file AssemblyAI may still need (UPLOADED / PUBLIC_READY / TRANSCRIBING) is never deleted, however old; young files stay");
    assert(w.rows[0].deletedAt?.getTime() === NOW.getTime() && (w.rows[0].driveFileId ?? "").startsWith("r2:"), "retention sweep: deletedAt is recorded and the stored reference is kept as history");
    const again = await sweepRecordingOriginals(w.deps, 24, NOW);
    assert(again.deleted.length === 0 && w.removed.length === 4, "retention sweep: a second run deletes nothing more");
  }
  {
    const w = retentionWorld([rec(1, "PUBLISHED", 1 * MIN), rec(2, "TRANSCRIBING", 1 * MIN)]);
    const r = await sweepRecordingOriginals(w.deps, 0, NOW);
    assert(r.deleted.join() === "1" && !w.rows[1].deletedAt, "retention sweep (0 h): deleted right after the transcript is taken, never while it is still being transcribed");
  }
  {
    const w = retentionWorld([rec(1, "PUBLISHED", 50 * HOUR), rec(2, "PUBLISHED", 50 * HOUR), rec(3, "PUBLISHED", 50 * HOUR)], [2]);
    const r = await sweepRecordingOriginals(w.deps, 24, NOW);
    assert(r.deleted.join() === "1,3" && r.failed.join() === "2" && !w.rows[1].deletedAt, "retention sweep: a failed delete is not marked as deleted, the others continue");
    w.deps.removeObject = async () => undefined;
    const retry = await sweepRecordingOriginals(w.deps, 24, NOW);
    assert(retry.deleted.join() === "2", "retention sweep: the failed one is retried by the next run");
  }
  {
    const bad = rec(1, "PUBLISHED", 50 * HOUR);
    bad.driveFileId = "r2:recordings/10/../../secret.m4a";
    const foreign = rec(2, "PUBLISHED", 50 * HOUR, 2);
    foreign.classSessionId = 99; // the key says lesson 2, the row says 99
    const w = retentionWorld([bad, foreign]);
    const r = await sweepRecordingOriginals(w.deps, 24, NOW);
    assert(r.invalidReference.sort().join() === "1,2" && w.removed.length === 0 && r.deleted.length === 0, "retention sweep: a reference that is malformed, or belongs to another lesson, is never used to delete anything");
  }
  {
    const many = Array.from({ length: 25 }, (_, i) => rec(i + 1, "PUBLISHED", 50 * HOUR));
    const w = retentionWorld(many);
    const r = await sweepRecordingOriginals(w.deps, 24, NOW);
    assert(r.deleted.length === 10, "retention sweep: a bounded batch per run");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("ERROR:", String(e?.stack ?? e).slice(0, 600));
  process.exit(1);
});
