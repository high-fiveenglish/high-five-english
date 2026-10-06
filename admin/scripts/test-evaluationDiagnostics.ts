// Evaluation diagnostics + the partial-success contract (student report passes, teacher QC does not).
// No database, no network, no Claude: unit checks of the category classifier and static checks of the source. The behaviour of
// generateAIEvaluationDraft / processRecording with fake Claude responses is in test-evaluationQuality.ts (section 14).
// Run from admin/: npx tsx scripts/test-evaluationDiagnostics.ts
import fs from "node:fs";
import path from "node:path";
import {
  EvaluationNotAcceptedError,
  ISSUE_CATEGORIES,
  classifyIssue,
  describeRejection,
  recordAttempt,
  summarizeAttempts,
  type AttemptRecord,
} from "../src/lib/evaluationDiagnostics";
import { MAX_ERROR_MESSAGE_LENGTH, truncateErrorMessage } from "../src/lib/recordingWorkflow";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

// ── the eight categories ──────────────────────────────────────────────────────────────────────────────────────────────
assert(ISSUE_CATEGORIES.join() === "quotation_marks,quote_not_in_transcript,timestamp_mismatch,talk_time_figure,time_grounding,historical_claim,structure,other", "categories: exactly the eight agreed names");

// ── classifier (wording of the real validators; a test in test-evaluationQuality.ts runs the real validators too) ──────
const samples: [string, string, number][] = [
  ['Output 2 contains 4 quotation marks — still in the text: "There were two boys". Output 2 must not quote anyone', "quotation_marks", 4],
  ["Output 2 contains 1 quotation mark. Output 2 must not quote anyone", "quotation_marks", 1],
  ['Output 2: a quotation is not in the transcript: "x y z" — if you cannot copy it exactly, describe it without quotation marks', "quote_not_in_transcript", 1],
  ['Output 1: a ❌ student sentence is not in the transcript: "abc"', "quote_not_in_transcript", 1],
  ['Output 1: a ❌ sentence was said by the Teacher, not the student: "abc"', "quote_not_in_transcript", 1],
  ['Output 1: a ❌ correction targets a passage the student was reading aloud, not spontaneous speech: "abc"', "quote_not_in_transcript", 1],
  ["Output 2: [09:25] is a line where Student speaks, but the sentence says the tutor acted there", "timestamp_mismatch", 1],
  ['Output 2: the time "17:45" does not match any timestamp in the transcript', "time_grounding", 1],
  ['Output 2: the duration "7 minutes" cannot be read from the timestamps (only the 25-minute lesson length may be stated)', "time_grounding", 1],
  ['Output 2: the percentage "58%" is not one of the measured talk-time values', "talk_time_figure", 1],
  ["Output 2 item 1 must state the measured talk time (Teacher 55% / Student 45%) and nothing else", "talk_time_figure", 1],
  ['Output 2: unexpected month "March" mentioned (lessonDate\'s month is October)', "historical_claim", 1],
  ['Output 1: historical-claim pattern matched: "last week"', "historical_claim", 1],
  ['Output 2 has 2 "Tutor Evaluation" titles (expected exactly 1)', "structure", 1],
  ["Output 2 numbered items must be exactly 1 through 10 once each, in order (found: 1,2)", "structure", 1],
  ["Output 1 is missing the section 💬", "structure", 1],
  ["Output 1 repeats a numbered correction marker (①②③...)", "structure", 1],
  ["Output 1 lists 9 corrections; the skill's 25-minute structure allows at most 3", "structure", 1],
  ["something the classifier has never seen", "other", 1],
];
for (const [text, category, weight] of samples) {
  const c = classifyIssue(text);
  assert(c.category === category && c.weight === weight, `classify: ${category}×${weight} <- ${text.slice(0, 60)}`);
}

// ── attempt records and summaries hold no text ────────────────────────────────────────────────────────────────────────
{
  const a1 = recordAttempt(1, ['Output 2 contains 7 quotation marks — still in the text: "private student words". Output 2 must not quote anyone', "Output 2 numbered items must be exactly 1 through 10"]);
  assert(!a1.ok && a1.categories.quotation_marks === 7 && a1.categories.structure === 1 && Object.keys(a1).sort().join() === "attempt,categories,ok", "record: category counts only (quotation marks counted by the validator's number)");
  assert(!JSON.stringify(a1).includes("private student words"), "record: the quoted words are not kept");
  assert(recordAttempt(2, []).ok === true && recordAttempt(2, null, "response_empty").ok === false && recordAttempt(3, null, "response_cut_off").stop === "response_cut_off", "record: ok / stop reasons");
  const four: AttemptRecord[] = [1, 2, 3, 4].map((n) => recordAttempt(n, ['Output 2 contains 4 quotation marks — still in the text: "There were two boys"']));
  assert(summarizeAttempts(four) === "a1 quotation_marks×4; a2 quotation_marks×4; a3 quotation_marks×4; a4 quotation_marks×4", "summary: the format used in errorMessage");
  const message = describeRejection("Output 2 (teacher QC)", four);
  assert(message === "Output 2 (teacher QC) rejected after 4 attempts — a1 quotation_marks×4; a2 quotation_marks×4; a3 quotation_marks×4; a4 quotation_marks×4" && !/two boys/i.test(message), "summary: the whole message, with none of the quoted words");
  assert(new EvaluationNotAcceptedError("Output 2 (teacher QC)", four).message === message && new EvaluationNotAcceptedError("x", four).records === four, "error: carries the message and the records");
  assert(describeRejection("L", [recordAttempt(1, ["x"]), recordAttempt(2, null, "time_budget")]).startsWith("L not accepted within the time budget after 1 attempts — a1 other×1; a2 time_budget"), "summary: the time budget case");
  assert(summarizeAttempts([recordAttempt(1, null, "response_cut_off"), recordAttempt(2, [])]) === "a1 response_cut_off; a2 ok", "summary: attempts without a report");
  // the worst realistic case still fits the 500-character column once truncated, and the start (the useful part) is kept
  const wide = [1, 2, 3, 4].map((n) => recordAttempt(n, ISSUE_CATEGORIES.map((c) => (c === "quotation_marks" ? "Output 2 contains 12 quotation marks" : `${c} issue`))));
  const stored = truncateErrorMessage(describeRejection("Output 2 (teacher QC)", wide));
  assert(stored.length <= MAX_ERROR_MESSAGE_LENGTH && stored.startsWith("Output 2 (teacher QC) rejected after 4 attempts — a1 quotation_marks×12"), "summary: the 500-character limit is kept");
}

// ── static checks of the source ───────────────────────────────────────────────────────────────────────────────────────
const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sessionDir = "src/app/teacher/(dashboard)/sessions/[id]";
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

{
  const diag = read("src/lib/evaluationDiagnostics.ts");
  assert(!/^import /m.test(strip(diag)), "diagnostics module: imports nothing (it can not reach a report or a transcript)");
  const ai = read("src/lib/aiEvaluation.ts");
  assert(/const MODEL = "claude-haiku-4-5";/.test(ai) && /const TEMPERATURE = 0\.2;/.test(ai) && /const MAX_ATTEMPTS = 4;/.test(ai), "unchanged: claude-haiku-4-5, temperature 0.2, 4 attempts");
  assert(ai.includes("NO quotation marks at all") && /validateTeacherQc\(text, validationContext\)/.test(ai), "unchanged: the QC quotation instruction and the QC validation call");
  assert(/checkTeacherQcNoQuotations\(teacherQc\)/.test(read("src/lib/evaluationValidation.ts")), "unchanged: validateTeacherQc still enforces checkTeacherQcNoQuotations");
  assert(read("src/lib/projectEvaluationRules.ts").includes("Output 2 contains NO quotation marks"), "unchanged: QUOTE GROUNDING rule text");
  assert(!/issues\.join/.test(strip(ai).slice(strip(ai).indexOf("async function generateOne"))), "aiEvaluation: no validator sentence is joined into an error message any more");
}

{
  const bg = read("netlify/functions/process-recording-background.ts");
  const save = bg.slice(bg.indexOf("async saveDraft"), bg.indexOf("generateDraft:"));
  assert(/teacherQcDraft: result\.teacherQc,/.test(save) && /processingStatus: "ANALYZING"/.test(save) && /processingStatus: "NEEDS_REVIEW"/.test(save), "saveDraft: still one conditional update from ANALYZING to NEEDS_REVIEW; a null QC is stored as null");
  assert(/\.\.\.\(result\.teacherQcFailure \? \{ errorMessage: truncateErrorMessage\(result\.teacherQcFailure\) \} : \{\}\)/.test(save), "saveDraft: the failure summary is stored only when the QC failed, truncated to the column limit");
  const logs = strip(bg).match(/console\.log\([^\n]*/g) ?? [];
  assert(logs.length === 2 && logs.every((l) => /ai-evaluation-(saved|attempts)/.test(l)), "background function: exactly the two diagnostic log lines");
  assert(!logs.some((l) => /studentFeedback|teacherQc\b|aiDraft|utterance|transcript|errorMessage/.test(l.replace(/teacherQc: result\.teacherQc === null/, ""))), "background function: the log lines name no report or transcript field");
}

{
  const page = read(`${sessionDir}/page.tsx`);
  assert(/teacherQcUnavailable: session\.audioRecording\.processingStatus === "NEEDS_REVIEW" && session\.audioRecording\.teacherQcDraft === null/.test(page), "page: the flag is derived on the server from the status and a null QC");
  assert(/errorMessage: safeRecordingFailureMessage\(/.test(page) && !/errorMessage: true/.test(page), "page: the raw errorMessage (which holds the internal failure summary) is still never selected or sent");
  const panel = read(`${sessionDir}/ClassRecordingPanel.tsx`);
  assert(/recording\.processingStatus === "NEEDS_REVIEW" && recording\.teacherQcUnavailable/.test(panel) && panel.includes("The Teacher QC report could not be generated for this class."), "panel: the notice shows only for a NEEDS_REVIEW recording whose QC is unavailable");
  assert(/\{recording\.teacherQcDraft && \(/.test(panel) && !/teacherQcDraft\.(length|trim|split|slice)/.test(panel), "panel: a null QC is never dereferenced (the QC block renders only when it exists)");
  assert(!/teacherQcFailure/.test(panel + page), "panel/page: the internal failure summary is not referenced");
  assert(/recording\.processingStatus === "NEEDS_REVIEW" && recording\.aiDraft && \(/.test(panel), "panel: the draft review and Publish form depend on the student draft only");
}

{
  // Publish: the contract is unchanged — it needs NEEDS_REVIEW and the student draft's content, and never looks at the QC
  const actions = strip(read(`${sessionDir}/recordingActions.ts`));
  const publish = actions.slice(actions.indexOf("export async function publishAIDraft"), actions.indexOf("export async function confirmTeacherSpeakerAction"));
  assert(publish.includes('processingStatus !== "NEEDS_REVIEW"') && !/teacherQc/.test(publish) && !/teacherQc/.test(strip(read("src/lib/recordingPublish.ts"))), "publish: requires NEEDS_REVIEW, never reads or writes the QC (so a null QC changes nothing)");
  assert(/aiDraft/.test(strip(read(`${sessionDir}/page.tsx`))) && /commitAIDraftPublish/.test(publish), "publish: still goes through the conditional transaction");
}

{
  // Students and the public API never see the QC or any failure reason
  const studentFiles = walk(path.join(root, "src", "app", "student"));
  const publicFiles = walk(path.join(root, "src", "app", "api", "public")).filter((f) => !f.includes("assemblyai-webhook"));
  assert(studentFiles.length > 0 && publicFiles.length > 0, "student API: there are files to scan");
  for (const f of studentFiles.concat(publicFiles, [path.join(root, "src", "lib", "studentEvaluation.ts")])) {
    const code = fs.readFileSync(f, "utf8");
    assert(!/teacherQc|evaluationDiagnostics|teacherQcFailure|teacherQcUnavailable/.test(code), `student/public: no QC or diagnostics in ${path.relative(root, f).split(path.sep).join("/")}`);
  }
}

{
  // scope of this change: nothing of R2, AssemblyAI, speaker mapping or Talk Time was touched by the new module or the save path
  const changed = ["src/lib/evaluationDiagnostics.ts"];
  for (const f of changed) assert(!/recordingR2|assemblyai|speakerRoles|talkTime/i.test(strip(read(f))), `scope: ${f} does not reference R2, AssemblyAI, speaker mapping or Talk Time`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
