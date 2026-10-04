// Manual verification tool (NOT part of CI, never imported by the app): runs the real evaluation pipeline on one real
// class recording so reading-aloud detection, Talk Time, Student Feedback and Teacher QC can be re-checked by a person.
//
//   cd admin
//   npx tsx scripts/verify-real-recording.ts --audio "<file.m4a>" --lesson-date 2026-08-18 --age-band teen --yes
//   npx tsx scripts/verify-real-recording.ts --transcript "<out>/transcript.json" --no-claude      (offline, free)
//
// What it does: (1) AssemblyAI with the production settings (Universal-2 + speaker_labels, from assemblyai.ts) — or a
// cached transcript; (2) prints speaker mapping, Talk Time and every student turn flagged as reading aloud with its
// timestamp, so the flags can be compared with what was really read; (3) runs generateAIEvaluationDraft (claude-haiku-4-5,
// temperature 0.2, up to 4 attempts) N times and re-validates the results.
//
// Safety: it never touches the database, the webhook or Netlify. Paid API calls (AssemblyAI upload, Claude) only happen
// with --yes. API keys are read from the environment or admin/.env and are never printed. Results are written OUTSIDE the
// repository (default: the OS temp folder) because transcripts and reports contain a real student's speech — delete that
// folder when you are done; do not commit it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchTranscript, submitTranscript, type AssemblyAITranscriptResult } from "../src/lib/assemblyai";
import { generateAIEvaluationDraft, type LessonContext } from "../src/lib/aiEvaluation";
import { validateStudentFeedback, validateTeacherQc } from "../src/lib/evaluationValidation";
import type { AgeBand } from "../src/lib/projectEvaluationRules";
import { formatTimestamp, toRoleUtterances } from "../src/lib/speakerTranscript";
import { inferSpeakerRoles } from "../src/lib/speakerRoles";
import { computeTalkTime } from "../src/lib/talkTime";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Loads only the two API keys from admin/.env when they are not already in the environment (values are never printed). */
function loadKeys() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const key of ["ASSEMBLYAI_API_KEY", "ANTHROPIC_API_KEY"]) {
    if (process.env[key]) continue;
    const m = text.match(new RegExp(`^${key}="?([^"\\r\\n]+)"?`, "m"));
    if (m) process.env[key] = m[1];
  }
}

async function transcribe(audio: string, outDir: string): Promise<AssemblyAITranscriptResult> {
  if (!flag("yes")) throw new Error("Refusing to call the paid AssemblyAI API without --yes");
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("ASSEMBLYAI_API_KEY is not set");
  console.log("Uploading the recording to AssemblyAI (paid) ...");
  const up = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/octet-stream" },
    body: fs.readFileSync(audio),
    signal: AbortSignal.timeout(300_000),
  });
  if (!up.ok) throw new Error(`upload failed with HTTP ${up.status}`);
  const { upload_url } = (await up.json()) as { upload_url: string };
  const submitted = await submitTranscript(upload_url); // production request body: Universal-2 + speaker_labels
  if (!submitted) throw new Error("transcript submit failed");
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const r = await fetchTranscript(submitted.id);
    if (r && (r.status === "completed" || r.status === "error")) {
      if (r.status === "error") throw new Error(`AssemblyAI error: ${r.error ?? "unknown"}`);
      fs.writeFileSync(path.join(outDir, "transcript.json"), JSON.stringify(r));
      return r;
    }
  }
  throw new Error("timed out waiting for the transcript");
}

async function main() {
  loadKeys();
  const outDir = arg("out") ?? path.join(os.tmpdir(), "hifive-real-recording-check");
  fs.mkdirSync(outDir, { recursive: true });
  const cached = arg("transcript");
  const audio = arg("audio");
  if (!cached && !audio) {
    console.log('Usage: --audio "<file>" --yes   or   --transcript "<transcript.json>"   [--lesson-date YYYY-MM-DD] [--age-band child|teen|adult] [--runs N] [--no-claude] [--out dir]');
    process.exit(2);
  }
  const tr: AssemblyAITranscriptResult = cached ? JSON.parse(fs.readFileSync(cached, "utf8")) : await transcribe(audio!, outDir);
  const utterances = tr.utterances ?? [];
  if (utterances.length === 0) throw new Error("the transcript has no utterances");

  // ── speaker mapping, Talk Time, reading flags ──────────────────────────────────────────────────────────────────
  // The same role inference and confidence gate the background function uses. LOW confidence stops here (no Claude call), exactly as
  // the application would; --teacher <label> simulates the teacher's manual confirmation so the rest of the pipeline can still be checked.
  const inference = inferSpeakerRoles(utterances);
  console.log(`\nspeaker roles (transcript-based inference, NOT aurally verified): ${inference.confidence}${inference.teacherLabel ? " teacher=" + inference.teacherLabel : ""}`);
  console.log(`  first speaker: ${inference.firstSpeaker} | voices: ${inference.speakerCount}${inference.minorSpeakers.length ? " (minor: " + inference.minorSpeakers.join(",") + ")" : ""}`);
  for (const f of inference.features) {
    console.log(`  ${f.label}: turns ${f.turns}, ${Math.round(f.seconds)}s, avg ${f.avgWordsPerTurn} words | questions ${f.questions}, management ${f.management}, instructions ${f.instructions}, short replies ${f.shortReplies}/${f.repliesToQuestion}, open/close ${f.openingClosing}`);
  }
  console.log(`  votes: ${JSON.stringify(inference.votes)}`);
  console.log(`  reasons: ${inference.reasons.join("; ")}`);
  const override = arg("teacher");
  const teacherLabel = override ?? inference.teacherLabel;
  if (!teacherLabel) {
    console.log("\nSTOPPED: roles not confirmed (LOW confidence). In the application this record becomes NEEDS_SPEAKER_CONFIRMATION and no AI report is generated.");
    console.log("Re-run with --teacher <label> to simulate the teacher's confirmation.");
    return;
  }
  if (override) console.log(`  (manual override: teacher = ${override})`);
  const talkTime = computeTalkTime(utterances, teacherLabel);
  const roles = toRoleUtterances(utterances, teacherLabel);
  console.log(`\nduration: ${tr.audio_duration ?? "?"}s | utterances: ${utterances.length} | speaker labels: ${[...new Set(utterances.map((u) => u.speaker))].join(", ")}`);
  console.log(`teacher label used: ${teacherLabel}  (CHECK BY EAR that this voice really is the teacher)`);
  console.log(`Talk Time: Teacher ${talkTime.teacherTalkPercentage}% (${talkTime.teacherSpeakingSeconds}s) / Student ${talkTime.studentTalkPercentage}% (${talkTime.studentSpeakingSeconds}s)`);
  const flagged = roles.filter((r) => r.possibleReadAloud);
  console.log(`\nStudent turns flagged as possible reading aloud: ${flagged.length} of ${roles.filter((r) => r.role === "Student").length}`);
  for (const r of flagged) console.log(`  [${formatTimestamp(r.startMs)}] #${r.index} ${r.text.split(/\s+/).length}w  ${r.text.slice(0, 80)}`);
  console.log("Compare this list with what the student really read: a missed reading and a wrongly flagged free answer are both findings.");
  console.log("Longest unflagged student turns (check these are really spontaneous):");
  for (const r of roles.filter((x) => x.role === "Student" && !x.possibleReadAloud).sort((a, b) => b.endMs - b.startMs - (a.endMs - a.startMs)).slice(0, 5)) {
    console.log(`  [${formatTimestamp(r.startMs)}] #${r.index} ${r.text.split(/\s+/).length}w  ${r.text.slice(0, 80)}`);
  }

  if (flag("no-claude")) return;
  if (!flag("yes")) throw new Error("Refusing to call the paid Claude API without --yes (use --no-claude for an offline check)");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

  // ── Student Feedback + Teacher QC, exactly as the background function generates them ───────────────────────────
  const lessonDate = arg("lesson-date") ?? new Date().toISOString().slice(0, 10);
  const ageBand = (arg("age-band") ?? "teen") as AgeBand;
  const lesson: LessonContext = {
    lessonDate,
    lessonDurationMinutes: Math.round((tr.audio_duration ?? 1500) / 60),
    studentAgeBand: ageBand,
    studentRegion: arg("region") ?? "KOREA",
    textbookName: null,
    classMethod: null,
  };
  const runs = Number(arg("runs") ?? 1);
  for (let n = 1; n <= runs; n++) {
    console.log(`\n===== RUN ${n}/${runs} (claude-haiku-4-5, temperature 0.2, up to 4 attempts per report) =====`);
    try {
      const draft = await generateAIEvaluationDraft({ utterances, teacherSpeakerLabel: teacherLabel, talkTime, lessonContext: lesson });
      if (!draft) throw new Error("no draft (missing API key or no utterances)");
      const ctx = { roles, lessonDateISO: lessonDate, lessonDurationMinutes: lesson.lessonDurationMinutes, ageBand, talkTime };
      const s = validateStudentFeedback(draft.studentFeedback, ctx);
      const q = validateTeacherQc(draft.teacherQc, ctx);
      fs.writeFileSync(path.join(outDir, `run${n}_student_feedback.txt`), draft.studentFeedback);
      fs.writeFileSync(path.join(outDir, `run${n}_teacher_qc.txt`), draft.teacherQc);
      console.log(`attempts: student ${draft.attempts?.studentFeedback ?? "?"} / QC ${draft.attempts?.teacherQc ?? "?"} | re-validation: student ${s.ok ? "PASS" : "FAIL"} / QC ${q.ok ? "PASS" : "FAIL"}`);
      for (const issue of [...s.issues, ...q.issues]) console.log(`  - ${issue}`);
      console.log(`reports written to ${outDir} (run${n}_student_feedback.txt, run${n}_teacher_qc.txt)`);
      const corrections = [...draft.studentFeedback.matchAll(/❌\s*"([^"]+)"/g)].map((m) => m[1]);
      console.log(`❌ sentences to check against the audio: ${corrections.length === 0 ? "none" : ""}`);
      for (const u of corrections) console.log(`  ❌ "${u.slice(0, 100)}"`);
    } catch (err) {
      // Same outcome the pipeline has in production: the draft is rejected and the record would become ANALYSIS_FAILED.
      console.log(`FAILED: ${(err instanceof Error ? err.message : String(err)).slice(0, 300)}`);
    }
  }
  console.log(`\nOutput folder: ${outDir}  — contains a real student's speech. Delete it when finished; never commit it.`);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e).slice(0, 300));
  process.exit(1);
});
