// speakerConfirmation.ts — Teacher Confirmation of the speaker roles: label validation, authorization, idempotency, the neutral choice list
// and the safety of the migration that stores the choice. Synthetic data only; the end-to-end flow (LOW -> confirm -> analysis from the
// stored transcript, no AssemblyAI call) is in test-recordingProcessing.ts.
import fs from "node:fs";
import path from "node:path";
import {
  CONFIRM_ERROR_MESSAGES,
  confirmTeacherSpeaker,
  parseStoredUtterances,
  projectUtterancesForStorage,
  speakerChoicesFor,
  speakerLabelsOf,
  type ConfirmDeps,
  type ConfirmRecordingView,
} from "../src/lib/speakerConfirmation";
import { inferSpeakerRoles } from "../src/lib/speakerRoles";
import { studentFirstLesson, teacherFirstLesson, threeVoiceLesson } from "./fixtures/syntheticLessons";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

// ── stored utterances come from a JSON column: never trust the shape ───────────────────────────────────────────────────
{
  const good = JSON.parse(JSON.stringify(studentFirstLesson()));
  assert(parseStoredUtterances(good)?.length === good.length, "parse: a valid stored transcript is accepted (JSON round trip)");
  for (const bad of [null, undefined, {}, [], "x", 5, [{}], [{ speaker: "A" }], [{ speaker: "A", start: "0", end: 1, text: "x" }], [{ speaker: "A;", start: 0, end: 1, text: "x" }], [{ speaker: "A", start: 0, end: 1, text: 5 }], [null]]) {
    assert(parseStoredUtterances(bad) === null, `parse: rejects ${JSON.stringify(bad)}`);
  }
  assert(speakerLabelsOf(threeVoiceLesson()).join() === "A,B,C", "labels: the voices that really exist, sorted");
}

// ── the choice list is neutral ────────────────────────────────────────────────────────────────────────────────────────
{
  const lesson = studentFirstLesson();
  const choices = speakerChoicesFor(lesson);
  assert(choices.map((c) => c.label).join() === "A,B", "choices: alphabetical, one per real voice");
  assert(Object.keys(choices[0]).sort().join() === "excerpts,label,minutes,turns", "choices: only label, size and excerpts — no score, no recommendation, no inferred role");
  assert(choices.every((c) => c.excerpts.length <= 2 && c.excerpts.every((e) => e.text.length <= 70 && /^\d\d:\d\d$/.test(e.at))), "choices: at most two short excerpts with a timestamp");
  const inference = inferSpeakerRoles(lesson);
  const serialized = JSON.stringify(choices);
  assert(!/teacher|student|recommend|suggest|confidence|HIGH|LOW/i.test(serialized.replace(/"text":"[^"]*"/g, "")), "choices: the structure never names a role or a confidence");
  assert(inference.confidence === "LOW" && !serialized.includes(JSON.stringify(inference.votes)), "choices: the inference result is not part of what the screen receives");
  assert(speakerChoicesFor(threeVoiceLesson()).length === 3, "choices: three voices -> three options (C can be chosen)");
  const exact = speakerChoicesFor([{ speaker: "A", start: 0, end: 1000, text: "Hi." }, { speaker: "B", start: 1000, end: 3000, text: "A much longer sentence that has plenty of words in it for the excerpt." }]);
  assert(exact[0].excerpts.length === 0 && exact[1].excerpts.length === 1, "choices: very short lines (< 3 words) are not used as excerpts");
}

// ── confirmation logic with in-memory deps ────────────────────────────────────────────────────────────────────────────
function world(initial: Partial<ConfirmRecordingView> & { teacherId?: number; noRecording?: boolean } = {}) {
  const state = {
    sessionTeacherId: initial.teacherId ?? 7,
    rec: initial.noRecording
      ? null
      : ({
          id: 1,
          processingStatus: initial.processingStatus ?? "NEEDS_SPEAKER_CONFIRMATION",
          confirmedTeacherSpeaker: initial.confirmedTeacherSpeaker ?? null,
          utterances: initial.utterances ?? JSON.parse(JSON.stringify(studentFirstLesson())),
        } as ConfirmRecordingView),
    markCalls: 0,
    triggers: 0,
    confirmedBy: null as number | null,
  };
  const deps: ConfirmDeps = {
    async findSession(id) {
      if (id !== 10) return null;
      return { sessionTeacherId: state.sessionTeacherId, recording: state.rec ? { ...state.rec } : null };
    },
    async markConfirmed(_id, label, teacherId) {
      state.markCalls++;
      if (!state.rec || state.rec.processingStatus !== "NEEDS_SPEAKER_CONFIRMATION") return false;
      state.rec.processingStatus = "TEACHER_SPEAKER_CONFIRMED";
      state.rec.confirmedTeacherSpeaker = label;
      state.confirmedBy = teacherId;
      return true;
    },
    async triggerProcessing() {
      state.triggers++;
      return true;
    },
  };
  return { state, deps };
}
const ask = (w: ReturnType<typeof world>, teacherId: number, label: unknown, sessionId = 10) => confirmTeacherSpeaker(w.deps, { teacherId, sessionId, label });

async function main() {
  {
    const w = world();
    const r = await ask(w, 7, "B");
    assert(r.ok && r.state === "confirmed" && r.triggered, "confirm: the owner selects B -> confirmed, analysis triggered");
    assert(w.state.rec!.processingStatus === "TEACHER_SPEAKER_CONFIRMED" && w.state.rec!.confirmedTeacherSpeaker === "B" && w.state.confirmedBy === 7, "confirm: label and teacher id are recorded");
  }
  {
    const w = world({ utterances: JSON.parse(JSON.stringify(threeVoiceLesson())) });
    const r = await ask(w, 7, "C");
    assert(r.ok && w.state.rec!.confirmedTeacherSpeaker === "C", "confirm: with three voices the teacher can pick C");
  }
  {
    // authorization
    const w = world();
    const r = await ask(w, 8, "B");
    assert(!r.ok && r.error === "not_found" && w.state.markCalls === 0 && w.state.triggers === 0, "authorization: another teacher -> rejected before any write");
    assert(!(await ask(w, 7, "B", 99)).ok, "authorization: unknown lesson -> rejected");
    const noRec = world({ noRecording: true });
    const r2 = await ask(noRec, 7, "B");
    assert(!r2.ok && r2.error === "not_found", "authorization: a lesson without a recording -> rejected");
    const mine = world({ teacherId: -1 });
    assert(!(await ask(mine, 7, "B")).ok, "authorization: a lesson without an assigned teacher cannot be confirmed by anyone");
    assert((await ask(w, 8, "B")).ok === false && JSON.stringify(await ask(w, 8, "B")) === JSON.stringify(await ask(w, 8, "Z")), "authorization: a stranger gets the same answer whatever label is sent (no information leak)");
  }
  {
    // label validation: must be a voice that exists in the STORED transcript
    const w = world();
    for (const bad of ["C", "Z", "", "b", " B", "B ", "A,B", "A\nB", "../A", "'; DROP", "x".repeat(50), 0, true, null, undefined, {}, ["B"]]) {
      const r = await ask(w, 7, bad);
      assert(!r.ok && r.error === "invalid_label", `label ${JSON.stringify(bad)} is rejected`);
    }
    assert(w.state.markCalls === 0 && w.state.triggers === 0 && w.state.rec!.processingStatus === "NEEDS_SPEAKER_CONFIRMATION", "label: nothing is written for an invalid label");
    const broken = world({ utterances: [{ speaker: "A" }] });
    const r = await ask(broken, 7, "A");
    assert(!r.ok && r.error === "invalid_label", "label: corrupted stored transcript -> rejected, never trusted");
  }
  {
    // states
    for (const status of ["UPLOADED", "TRANSCRIBING", "TRANSCRIBED", "NEEDS_REVIEW", "PUBLISHED", "COMPLETED", "ANALYSIS_FAILED", "ANALYZING", "TEACHER_SPEAKER_CONFIRMED"]) {
      const w = world({ processingStatus: status });
      const r = await ask(w, 7, "B");
      assert(!r.ok && r.error === "not_waiting" && w.state.markCalls === 0, `state ${status} without a confirmation: nothing to confirm`);
    }
    for (const status of ["TEACHER_SPEAKER_CONFIRMED", "ANALYZING", "NEEDS_REVIEW", "PUBLISHED", "COMPLETED", "ANALYSIS_FAILED"]) {
      const w = world({ processingStatus: status, confirmedTeacherSpeaker: "B" });
      const same = await ask(w, 7, "B");
      assert(same.ok && same.state === "already_confirmed", `state ${status}: the same choice is idempotent`);
      assert(same.ok && same.triggered === (status === "TEACHER_SPEAKER_CONFIRMED"), `state ${status}: only a record still waiting for the background function is re-triggered`);
      const diff = await ask(w, 7, "A");
      assert(!diff.ok && diff.error === "different_label", `state ${status}: a different choice is refused, the analysis is never changed afterwards`);
      assert(w.state.rec!.confirmedTeacherSpeaker === "B" && w.state.markCalls === 0, `state ${status}: nothing is overwritten`);
    }
  }
  {
    // concurrency: two requests at once, one wins
    const w = world();
    const [a, b] = await Promise.all([ask(w, 7, "B"), ask(w, 7, "B")]);
    assert(a.ok && b.ok && [a, b].filter((x) => x.ok && x.state === "confirmed").length === 1 && [a, b].filter((x) => x.ok && x.state === "already_confirmed").length === 1, "concurrent identical requests: one confirms, one is already_confirmed");
    assert(w.state.triggers === 1, "concurrent identical requests: the analysis is triggered once");
    const v = world();
    const [x, y] = await Promise.all([ask(v, 7, "A"), ask(v, 7, "B")]);
    assert([x, y].filter((r) => r.ok && r.state === "confirmed").length === 1 && [x, y].filter((r) => !r.ok && r.error === "different_label").length === 1, "concurrent different requests: one wins, the other is refused");
    assert(Object.keys(CONFIRM_ERROR_MESSAGES).length === 4 && Object.values(CONFIRM_ERROR_MESSAGES).every((m) => !/prisma|stack|secret/i.test(m)), "messages: fixed text, nothing internal");
  }

  // ── data minimization: only speaker/start/end/text are stored ─────────────────────────────────────────────────────────────────
  {
    const raw = [
      { speaker: "A", start: 0, end: 900, text: "Hello there", confidence: 0.93, channel: "1", words: [{ text: "Hello", start: 0, end: 400, confidence: 0.99, speaker: "A" }, { text: "there", start: 450, end: 900, confidence: 0.91, speaker: "A" }], vendorField: { nested: true } },
      { speaker: "B", start: 1000, end: 1500, text: "Hi", words: [], extra: null },
    ];
    const before = JSON.stringify(raw);
    const kept = projectUtterancesForStorage(raw);
    assert(JSON.stringify(raw) === before, "projection: the input is not mutated");
    assert(kept.length === 2 && kept.every((u) => Object.keys(u).sort().join() === "end,speaker,start,text"), "projection: exactly speaker/start/end/text per utterance");
    assert(kept[0].text === "Hello there" && kept[0].start === 0 && kept[0].end === 900 && kept[1].speaker === "B", "projection: values and order are preserved");
    assert(!/words|confidence|channel|vendorField|extra/.test(JSON.stringify(kept)), "projection: word-level data and every other field are gone (whitelist, not blacklist)");
    assert(JSON.stringify(projectUtterancesForStorage(kept)) === JSON.stringify(kept), "projection: idempotent (projecting twice changes nothing)");
    assert(projectUtterancesForStorage([]).length === 0, "projection: an empty list stays empty");
    assert(parseStoredUtterances(JSON.parse(JSON.stringify(kept)))?.length === 2, "projection: parseStoredUtterances accepts the projected data after a JSON round trip");
    const malformed = projectUtterancesForStorage([{ speaker: "A", start: 0, end: 1 } as never]);
    assert(parseStoredUtterances(JSON.parse(JSON.stringify(malformed))) === null, "projection: a missing value is not invented — the malformed record is still rejected on read");
  }
  {
    // both places that write the column go through the projection
    const bg = fs.readFileSync(path.resolve(__dirname, "../netlify/functions/process-recording-background.ts"), "utf8");
    assert(/transcriptUtterances:\s*projectUtterancesForStorage\(/.test(bg), "background function: the column is written from the projection, never from the raw object");
    assert(!/transcriptUtterances:\s*snapshot\.utterances/.test(bg), "background function: the raw snapshot is not written directly");
    const proc = fs.readFileSync(path.resolve(__dirname, "../src/lib/recordingProcessing.ts"), "utf8");
    assert(/utterances:\s*projectUtterancesForStorage\(transcript\.utterances\)/.test(proc), "processRecording: the snapshot handed to the store is already projected");
  }

  // ── the migration only ADDS nullable columns (no data is rewritten or dropped) ───────────────────────────────────────────
  {
    const dir = path.resolve(__dirname, "../prisma/migrations");
    const name = fs.readdirSync(dir).find((d) => d.endsWith("_add_speaker_confirmation"));
    const sql = name ? fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8") : "";
    assert(!!name && sql.startsWith("-- AlterTable"), "migration: exists and starts with plain SQL (no tool output on line 1)");
    assert(!/\b(DROP|DELETE|UPDATE|TRUNCATE|RENAME|SET NOT NULL|NOT NULL|DEFAULT)\b/i.test(sql), "migration: no drop/delete/update/rename and no NOT NULL/DEFAULT (existing rows are untouched)");
    const columns = [...sql.matchAll(/ADD COLUMN\s+"(\w+)"\s+(\w+)/g)].map((m) => `${m[1]}:${m[2]}`).sort();
    assert(columns.join() === "confirmedTeacherSpeaker:TEXT,speakerConfirmedAt:TIMESTAMP,speakerConfirmedByTeacherId:INTEGER,speakerMappingStatus:TEXT,transcriptUtterances:JSONB", `migration: exactly the five nullable columns (${columns.join()})`);
    assert(/ALTER TABLE "audio_recordings"/.test(sql) && !/class_sessions|teachers|lesson_evaluations/.test(sql), "migration: touches only audio_recordings");
    const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");
    for (const f of ["speakerMappingStatus", "transcriptUtterances", "confirmedTeacherSpeaker", "speakerConfirmedAt", "speakerConfirmedByTeacherId"]) {
      assert(new RegExp(`\\b${f}\\s+\\w+\\??`).test(schema), `schema: ${f} is declared`);
    }
  }

  // teacherFirstLesson stays a HIGH-confidence lesson: it must not be offered for confirmation by mistake
  assert(inferSpeakerRoles(teacherFirstLesson()).confidence === "HIGH", "regression: a clear lesson is still HIGH (no confirmation screen)");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
