// Deterministic validation of a generated evaluation. No LLM is involved: every check is a pure function of the
// generated text, the real utterances and the application's measured data.
//
// Checks (see PROJECT AI EVALUATION RULES in projectEvaluationRules.ts):
//   duplicates · quotation grounding · reading-aloud protection · timestamp/duration grounding ·
//   learner addressing (child/teen) · measured Talk Time · historical/date grounding
import { extractQuotedSpans, normalizeForMatch, stripQuotedSpans, wordCount } from "./evaluationText";
import { checkNoUngroundedHistoricalClaims, OUTPUT1_LABELS, type AgeBand } from "./projectEvaluationRules";
import type { RoleUtterance } from "./speakerTranscript";
import type { TalkTimeResult } from "./talkTime";

export interface ValidationContext {
  roles: RoleUtterance[];
  lessonDateISO: string;
  lessonDurationMinutes: number;
  ageBand: AgeBand;
  talkTime: TalkTimeResult;
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n)}…` : s);
const count = (s: string, re: RegExp) => (s.match(re) || []).length;

function transcriptText(roles: RoleUtterance[]): string {
  return roles.map((r) => r.text).join(" ");
}

// ---------------------------------------------------------------------------
// 1. Duplicate / structure
// ---------------------------------------------------------------------------
const OUTPUT1_SECTIONS: { name: string; re: RegExp }[] = [
  { name: `"${OUTPUT1_LABELS.title}" title`, re: /Today['’]s Class Feedback/g },
  { name: `"${OUTPUT1_LABELS.content}"`, re: /Today['’]s Lesson Content/g },
  { name: `"${OUTPUT1_LABELS.expressions}"`, re: /Key Expressions Covered/g },
  { name: `"${OUTPUT1_LABELS.polish}"`, re: /A Few Things to Polish/g },
  { name: `"${OUTPUT1_LABELS.standout}"`, re: /Really Nailed Today/g },
];

export function checkNoDuplicateStructure(studentFeedback: string, teacherQc: string): string[] {
  const issues: string[] = [];

  const titleMarkers = count(studentFeedback, /📘/g);
  if (titleMarkers !== 1) issues.push(`Output 1 has ${titleMarkers} "📘" title markers (expected exactly 1): the report must appear exactly once`);
  for (const s of OUTPUT1_SECTIONS) {
    const n = count(studentFeedback, s.re);
    if (n === 0) issues.push(`Output 1 is missing the section ${s.name}`);
    else if (n > 1) issues.push(`Output 1 repeats the section ${s.name} (${n} times)`);
  }
  const corrections = studentFeedback.match(/^[①②③④⑤⑥⑦⑧⑨⑩]/gm) ?? [];
  if (new Set(corrections).size !== corrections.length) issues.push("Output 1 repeats a numbered correction marker (①②③...)");

  const titles = count(teacherQc, /Tutor Evaluation/g);
  if (titles !== 1) issues.push(`Output 2 has ${titles} "Tutor Evaluation" titles (expected exactly 1)`);
  const items = [...teacherQc.matchAll(/^\s{0,3}(\d{1,2})\.\s/gm)].map((m) => Number(m[1]));
  const expected = Array.from({ length: 10 }, (_, i) => i + 1);
  if (items.length !== 10 || items.some((n, i) => n !== expected[i])) {
    issues.push(`Output 2 numbered items must be exactly 1 through 10 once each, in order (found: ${items.join(",") || "none"}); do not use other numbered lists`);
  }

  if (/Tutor Evaluation/.test(studentFeedback)) issues.push("Output 1 contains Tutor Evaluation content (Teacher QC must never reach the student report)");
  if (/📘|📝|💬|🌟/.test(teacherQc)) issues.push("Output 2 contains student-facing emoji section markers");
  return issues;
}

// ---------------------------------------------------------------------------
// 2. Quotation grounding + reading-aloud protection
// ---------------------------------------------------------------------------
// A quotation preceded by one of these is a suggestion/illustration, not an attributed quote.
const SUGGESTION_CONTEXT = /(e\.g\.|for example|for instance|such as|like|try|say|saying|ask|asking|model|sentence|practice|prompt)\s*[:,]?\s*$/i;
const CORRECTION_WORDS = /\b(error|mistake|correct|corrected|correction|should be|instead of|missed|wrong|incorrect)\b/i;

function fragments(raw: string): string[] {
  return raw.split(/…|\.{3}/).map((f) => f.trim()).filter((f) => normalizeForMatch(f) !== "");
}

/** True when the quote only OMITS words of the utterance (e.g. dropped fillers) and the matched stretch stays compact.
 * Insertions or substitutions never match, so an invented sentence is still rejected. */
function isCompactSubsequence(q: string[], u: string[]): boolean {
  if (q.length === 0) return false;
  const maxExtra = Math.max(2, Math.ceil(q.length * 0.3));
  for (let s = 0; s < u.length; s++) {
    if (u[s] !== q[0]) continue;
    let qi = 1;
    let ui = s + 1;
    while (qi < q.length && ui < u.length) {
      if (u[ui] === q[qi]) qi++;
      ui++;
    }
    if (qi === q.length && ui - s <= q.length + maxExtra) return true;
  }
  return false;
}

function utterancesContaining(fragmentNorm: string, roles: RoleUtterance[]): RoleUtterance[] {
  const q = fragmentNorm.split(" ");
  return roles.filter((r) => {
    const n = normalizeForMatch(r.text);
    return ` ${n} `.includes(` ${fragmentNorm} `) || isCompactSubsequence(q, n.split(" "));
  });
}

export function checkQuotesAndReading(studentFeedback: string, teacherQc: string, roles: RoleUtterance[]): string[] {
  const issues: string[] = [];
  const checkText = (label: string, text: string) => {
    // Sentences inside a "Why this happened:" grammar explanation are illustrations of a rule, not attributed speech.
    let inExplanation = false;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (/^Why this happened/i.test(trimmed)) inExplanation = true;
      if (/^[①②③④⑤⑥⑦⑧⑨⑩🌟]/.test(trimmed)) inExplanation = false;
      if (trimmed.startsWith("✅")) continue; // the corrected sentence is the one place for non-transcript text

      if (trimmed.startsWith("❌")) {
        const claimed = trimmed.replace(/^❌\s*/, "").replace(/^["“]|["”]$/g, "");
        for (const frag of fragments(claimed)) {
          const norm = normalizeForMatch(frag);
          const spoken = utterancesContaining(norm, roles);
          const byStudent = spoken.filter((r) => r.role === "Student");
          if (spoken.length === 0) issues.push(`${label}: a ❌ student sentence is not in the transcript: "${short(frag)}"`);
          else if (byStudent.length === 0) issues.push(`${label}: a ❌ sentence was said by the Teacher, not the student: "${short(frag)}"`);
          else if (byStudent.every((r) => r.possibleReadAloud)) {
            issues.push(`${label}: a ❌ correction targets a passage the student was reading aloud, not spontaneous speech: "${short(frag)}"`);
          }
        }
        continue;
      }

      if (inExplanation) continue;
      for (const q of extractQuotedSpans(line)) {
        if (wordCount(q.text) < 3) continue;
        if (/[+→]/.test(q.text)) continue; // a grammar formula such as "didn't + base verb", not speech
        if (SUGGESTION_CONTEXT.test(line.slice(Math.max(0, q.index - 30), q.index))) continue;
        for (const frag of fragments(q.text)) {
          const norm = normalizeForMatch(frag);
          if (norm.split(" ").length < 3) continue;
          const spoken = utterancesContaining(norm, roles);
          if (spoken.length === 0) {
            issues.push(`${label}: a quotation is not in the transcript: "${short(frag)}" — if you cannot copy it exactly, describe it without quotation marks`);
            continue;
          }
          if (CORRECTION_WORDS.test(line)) {
            const students = spoken.filter((r) => r.role === "Student");
            if (students.length > 0 && students.every((r) => r.possibleReadAloud)) {
              issues.push(`${label}: a correction/missed-correction note targets text the student was reading aloud: "${short(frag)}"`);
            }
          }
        }
      }
    }
  };

  checkText("Output 1", studentFeedback);
  checkText("Output 2", teacherQc);
  return issues;
}

// ---------------------------------------------------------------------------
// 2b. Length limits taken from the skill's own structures
// ---------------------------------------------------------------------------
// The skill lists how many items a 25-minute and a 50-minute report holds (lesson content lines, key expressions,
// corrections). Only the upper limits are enforced: fewer is allowed ("only genuine ones ... depth over count").
const SKILL_LIMITS = {
  "25": { content: 3, expressions: 4, corrections: 3 },
  "50": { content: 5, expressions: 7, corrections: 4 },
} as const;

function sectionBetween(text: string, startRe: RegExp, endRe: RegExp): string {
  const s = startRe.exec(text);
  if (!s) return "";
  const rest = text.slice(s.index + s[0].length);
  const e = endRe.exec(rest);
  return e ? rest.slice(0, e.index) : rest;
}

export function checkSkillStructureLimits(studentFeedback: string, lessonDurationMinutes: number): string[] {
  const limits = SKILL_LIMITS[lessonDurationMinutes <= 37 ? "25" : "50"];
  const profile = lessonDurationMinutes <= 37 ? "25" : "50";
  const topLevelItems = (section: string) => (section.match(/^[-•]\s/gm) ?? []).length;
  const issues: string[] = [];
  const content = topLevelItems(sectionBetween(studentFeedback, /^📝.*$/m, /^💬/m));
  const expressions = topLevelItems(sectionBetween(studentFeedback, /^💬.*$/m, /^✅/m));
  const corrections = (studentFeedback.match(/^[①②③④⑤⑥⑦⑧⑨⑩]/gm) ?? []).length;
  if (content > limits.content) issues.push(`Output 1 lists ${content} lesson-content lines; the skill's ${profile}-minute structure allows at most ${limits.content}`);
  if (expressions > limits.expressions) issues.push(`Output 1 lists ${expressions} key expressions; the skill's ${profile}-minute structure allows at most ${limits.expressions}`);
  if (corrections > limits.corrections) issues.push(`Output 1 lists ${corrections} corrections; the skill's ${profile}-minute structure allows at most ${limits.corrections}`);
  return issues;
}

// ---------------------------------------------------------------------------
// 3. Timestamp / duration grounding
// ---------------------------------------------------------------------------
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60,
};
const DURATION_RE = new RegExp(`\\b(\\d+(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).join("|")})[\\s-]*(minutes?|mins?|seconds?|secs?)\\b`, "gi");
const CLOCK_RE = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;

function cutAt(text: string, re: RegExp): { kept: string; rest: string } {
  const m = re.exec(text);
  return m ? { kept: text.slice(0, m.index), rest: text.slice(m.index) } : { kept: text, rest: "" };
}

export function checkTimeGrounding(studentFeedback: string, teacherQc: string, ctx: ValidationContext): string[] {
  const issues: string[] = [];
  const lastEndMs = ctx.roles.reduce((max, r) => Math.max(max, r.endMs), 0);
  const recordingMin = lastEndMs / 60000;
  const allowedMinutes = new Set([ctx.lessonDurationMinutes, Math.round(recordingMin), Math.floor(recordingMin), Math.ceil(recordingMin)]);
  const startSeconds = ctx.roles.map((r) => Math.floor(r.startMs / 1000));
  const totalSeconds = Math.round(lastEndMs / 1000);

  const scan = (label: string, text: string) => {
    const prose = stripQuotedSpans(text)
      .split("\n")
      .filter((l) => !/^\s*[❌✅]/.test(l))
      .join("\n");
    for (const m of prose.matchAll(DURATION_RE)) {
      const raw = m[1].toLowerCase();
      const value = Number.isNaN(Number(raw)) ? NUMBER_WORDS[raw] : Number(raw);
      const isSeconds = /^s/i.test(m[2]);
      if (isSeconds || !allowedMinutes.has(value)) {
        issues.push(`${label}: the duration "${m[0]}" cannot be read from the timestamps (only the ${ctx.lessonDurationMinutes}-minute lesson length may be stated)`);
      }
    }
    for (const m of prose.matchAll(CLOCK_RE)) {
      const h = m[3] !== undefined ? Number(m[1]) : 0;
      const min = m[3] !== undefined ? Number(m[2]) : Number(m[1]);
      const sec = m[3] !== undefined ? Number(m[3]) : Number(m[2]);
      const at = h * 3600 + min * 60 + sec;
      const matchesUtterance = startSeconds.some((s) => Math.abs(s - at) <= 2) || Math.abs(totalSeconds - at) <= 2;
      if (!matchesUtterance) issues.push(`${label}: the time "${m[0]}" does not match any timestamp in the transcript`);
    }
  };

  // Suggested practice time is allowed in the closing 🌟 section and in Output 2 item 10.
  scan("Output 1", cutAt(studentFeedback, /^🌟/m).kept);
  scan("Output 2", cutAt(teacherQc, /^\s{0,3}10\.\s/m).kept);
  return issues;
}

// ---------------------------------------------------------------------------
// 4. Learner addressing (child / teen → parent, 3rd person)
// ---------------------------------------------------------------------------
export function checkLearnerAddressing(studentFeedback: string, ageBand: AgeBand): string[] {
  if (ageBand !== "child" && ageBand !== "teen") return [];
  // The explanation block of the corrections is allowed to use a generic "you" in grammar rules; everything else
  // (summary, lesson content, expression comments, closing note) is the report's voice.
  const polish = /^✅\s*A Few Things to Polish/m.exec(studentFeedback);
  const standout = /^🌟/m.exec(studentFeedback);
  let voice = studentFeedback;
  if (polish && standout && standout.index > polish.index) voice = studentFeedback.slice(0, polish.index) + studentFeedback.slice(standout.index);
  const prose = stripQuotedSpans(voice)
    .split("\n")
    .filter((l) => !/^\s*(❌|✅|Example:)/.test(l))
    .join("\n");
  const hits = prose.match(/\b(?:you|your|yours|yourself)\b/gi) ?? [];
  if (hits.length === 0) return [];
  return [`Output 1 addresses the learner directly as "you" (${hits.length} times) but a ${ageBand} learner's report must be written to the parent in the 3rd person ("the student ...")`];
}

// ---------------------------------------------------------------------------
// 5. Measured Talk Time
// ---------------------------------------------------------------------------
export function checkTalkTimeFigures(studentFeedback: string, teacherQc: string, talkTime: TalkTimeResult): string[] {
  const issues: string[] = [];
  const allowed = new Set([talkTime.teacherTalkPercentage, talkTime.studentTalkPercentage]);

  const item1 = /^\s{0,3}1\.\s.*$/m.exec(teacherQc)?.[0] ?? "";
  const item1Numbers = [...item1.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  if (item1Numbers.length !== 2 || !item1Numbers.every((n) => allowed.has(n))) {
    issues.push(`Output 2 item 1 must state the measured talk time (Teacher ${talkTime.teacherTalkPercentage}% / Student ${talkTime.studentTalkPercentage}%) and nothing else`);
  }
  for (const [label, text] of [["Output 1", studentFeedback], ["Output 2", teacherQc]] as const) {
    for (const m of stripQuotedSpans(text).matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
      if (!allowed.has(Number(m[1]))) issues.push(`${label}: the percentage "${m[0]}" is not one of the measured talk-time values`);
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// All checks
// ---------------------------------------------------------------------------
export function validateEvaluationOutput(output: { studentFeedback: string; teacherQc: string }, ctx: ValidationContext): ValidationResult {
  const { studentFeedback, teacherQc } = output;
  const transcript = transcriptText(ctx.roles);
  const historical1 = checkNoUngroundedHistoricalClaims(studentFeedback, ctx.lessonDateISO, transcript).issues.map((i) => `Output 1: ${i}`);
  const historical2 = checkNoUngroundedHistoricalClaims(teacherQc, ctx.lessonDateISO, transcript).issues.map((i) => `Output 2: ${i}`);
  const issues = [
    ...checkNoDuplicateStructure(studentFeedback, teacherQc),
    ...checkQuotesAndReading(studentFeedback, teacherQc, ctx.roles),
    ...checkSkillStructureLimits(studentFeedback, ctx.lessonDurationMinutes),
    ...checkTimeGrounding(studentFeedback, teacherQc, ctx),
    ...checkLearnerAddressing(studentFeedback, ctx.ageBand),
    ...checkTalkTimeFigures(studentFeedback, teacherQc, ctx.talkTime),
    ...historical1,
    ...historical2,
  ];
  return { ok: issues.length === 0, issues: [...new Set(issues)].slice(0, 14) };
}
