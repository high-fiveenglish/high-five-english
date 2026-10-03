// speakerRoles.ts — role inference with a confidence gate. Synthetic transcripts only (scripts/fixtures/syntheticLessons.ts);
// no real recording, student or teacher text is in this repository.
import { computeSpeakerFeatures, inferSpeakerRoles, summarizeInference } from "../src/lib/speakerRoles";
import type { Utterance } from "../src/lib/talkTime";
import {
  monologueLesson,
  studentFirstLesson,
  studentLabelledFirstLesson,
  symmetricLesson,
  teacherFirstLesson,
  threeVoiceLesson,
} from "./fixtures/syntheticLessons";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

// ── baseline: the shape the old rule assumed still works, with HIGH confidence ───────────────────────────────────────
{
  const r = inferSpeakerRoles(teacherFirstLesson());
  assert(r.confidence === "HIGH" && r.teacherLabel === "A", "baseline: teacher speaks first -> HIGH, teacher = A");
  assert(r.firstSpeaker === "A" && r.speakerCount === 2 && r.minorSpeakers.length === 0, "baseline: two voices, first speaker A");
  const agreeing = Object.values(r.votes).filter((v) => v === "A").length;
  assert(agreeing >= 3 && Object.values(r.votes).every((v) => v === null || v === "A"), "baseline: at least three independent families agree and none disagrees");
}

// ── the real failure shape: a student word first, the teacher is B ──────────────────────────────────────────────────
{
  const r = inferSpeakerRoles(studentFirstLesson());
  assert(r.confidence === "LOW" && r.teacherLabel === null, "student first: LOW, no teacher is assigned");
  assert(r.firstSpeaker === "A", "student first: the first speaker is A (the student)");
  assert(Object.values(r.votes).filter((v) => v === "B").length >= 3, "student first: the evidence families point at B");
  assert(r.reasons.some((x) => /different speaker than the first speaker/.test(x)), "student first: the conflict with the first speaker is the stated reason");
  const r2 = inferSpeakerRoles(studentLabelledFirstLesson());
  assert(r2.confidence === "LOW" && r2.teacherLabel === null, "student speaks first in every pair: LOW");
}

// ── extra voices ──────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const r = inferSpeakerRoles(threeVoiceLesson());
  assert(r.confidence === "LOW" && r.speakerCount === 3 && r.minorSpeakers.join() === "C", "three voices: LOW, C is a minor voice");
  assert(r.reasons.some((x) => /3 voices detected/.test(x) && /audio track/.test(x)), "three voices: the played-audio-track hint is reported");
}

// ── not enough or conflicting evidence ──────────────────────────────────────────────────────────────────────────────
{
  const mono = inferSpeakerRoles(monologueLesson());
  assert(mono.confidence === "LOW", "monologue with 'yes' replies: LOW (not enough independent evidence)");
  const sym = inferSpeakerRoles(symmetricLesson());
  assert(sym.confidence === "LOW" && sym.teacherLabel === null, "two peers who ask equally: LOW");
  const tiny: Utterance[] = [{ speaker: "A", start: 0, end: 4000, text: "Hello." }, { speaker: "B", start: 4000, end: 6000, text: "Hi." }];
  assert(inferSpeakerRoles(tiny).confidence === "LOW", "two-line transcript: LOW");
  assert(inferSpeakerRoles([]).confidence === "LOW", "empty transcript: LOW");
  assert(inferSpeakerRoles([{ speaker: "A", start: 0, end: 5000, text: "Only one voice. Do you hear me?" }]).confidence === "LOW", "a single voice: LOW");
}

// ── no single rule decides ──────────────────────────────────────────────────────────────────────────────────────────
{
  // Only the first-speaker rule is true here (teacher first) but the evidence is symmetric: must NOT be HIGH.
  assert(inferSpeakerRoles(symmetricLesson())[ "confidence" ] === "LOW", "first speaker alone never gives HIGH");
  // Only questions favour A; every other family abstains or disagrees: must NOT be HIGH.
  const questionsOnly: Utterance[] = Array.from({ length: 16 }, (_, i) => ({
    speaker: i % 2 === 0 ? "A" : "B",
    start: i * 4000,
    end: i * 4000 + 3000,
    text: i % 2 === 0 ? "What do you think about that story?" : "I think it is interesting and I liked the end of the story a lot.",
  }));
  const q = inferSpeakerRoles(questionsOnly);
  assert(q.confidence === "LOW", "many questions alone (one family) never give HIGH");
  // The speaker who talks most is not automatically the teacher.
  const f = computeSpeakerFeatures(studentFirstLesson());
  assert(f.length === 2 && f[0].turns >= f[1].turns, "features are ranked by number of turns, not by who talks longest");
  const withAudio = computeSpeakerFeatures(threeVoiceLesson());
  assert(withAudio[2].label === "C" && withAudio[2].seconds > withAudio[1].seconds, "a long audio track has the most speaking time of the minor voices but is still ranked last");
}

// ── hygiene ────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const lesson = studentFirstLesson();
  const before = JSON.stringify(lesson);
  const r = inferSpeakerRoles(lesson);
  assert(JSON.stringify(lesson) === before, "the input utterances are not mutated");
  const allText = lesson.map((u) => u.text).join(" ");
  const summary = summarizeInference(r);
  const leaks = lesson.filter((u) => u.text.length > 12 && summary.includes(u.text));
  assert(leaks.length === 0 && !summary.includes(allText.slice(0, 30)), "the summary contains evidence counts, never transcript text");
  assert(/^LOW: /.test(summary), "the summary starts with the confidence");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
