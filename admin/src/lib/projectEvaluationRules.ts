// PROJECT AI EVALUATION RULES — rules of THIS APPLICATION, not of the English-feedback skill.
//
// The skill "online-english-feedback" is the source of truth for what a good report contains, how it is
// structured, its tone and its prohibitions. It is embedded verbatim in ./skill/onlineEnglishFeedbackSkill.ts
// and is not edited or paraphrased anywhere. This file only holds what the skill cannot say about running as
// a server-side API call, plus a few integrity rules found necessary by real-audio testing:
//
//   Deliberate project-level overrides of the skill's own text:
//   1. Output 1 language: the skill writes Output 1 in the student's language. Here it is written in English
//      and localized by the existing LMS translation pipeline when the teacher publishes it.
//   2. Talk Time: the skill estimates it from the transcript. Here the application measures it from AssemblyAI
//      timestamps and gives it as fact.
//   3. The skill's chat workflow (ask the user a question, present two chat blocks) does not apply to an API call.
//   4. Age band cutoffs (AGE_BAND_POLICY) are this project's decision; the skill infers the learner type from
//      the transcript instead of a number.
//
//   Project-only additions (not in the skill): speaker/quote/timestamp grounding, reading-aloud protection,
//   duplicate protection and the historical-context policy. They are enforced again after generation by the
//   deterministic validators in evaluationValidation.ts.
import { normalizeForMatch, stripQuotedSpans } from "./evaluationText";

export const OUTPUT1_LABELS = {
  title: "Today's Class Feedback",
  content: "Today's Lesson Content",
  expressions: "Key Expressions Covered",
  polish: "A Few Things to Polish",
  standout: "What the Student Really Nailed Today",
} as const;

export type ClassLengthProfile = "25" | "50";

/** The skill defines one structure for a 25-minute class and one for a 50-minute class. */
export function classLengthProfile(lessonDurationMinutes: number): ClassLengthProfile {
  return lessonDurationMinutes <= 37 ? "25" : "50";
}

// ============================================================================
// AGE BAND — PROJECT POLICY, NOT SOURCE SKILL RULE
// ============================================================================
// The skill infers child/teen/adult from transcript content and never states a numeric cutoff. Production has
// Student.birthDate, so numeric cutoffs are unavoidable — those numbers are THIS PROJECT'S decision. Do not
// describe them as "the skill's age rule".
export const AGE_BAND_POLICY = {
  /** At or below this age → "child". Ordinary convention (elementary-age), not from the skill. */
  CHILD_MAX_AGE: 12,
  /** Above CHILD_MAX_AGE and at or below this age → "teen". Not from the skill. */
  TEEN_MAX_AGE: 18,
} as const;

export type AgeBand = "child" | "teen" | "adult" | "unknown";

/** The age band is computed by code from Student.birthDate and passed as a given fact — Claude never guesses age. */
export function ageBandFromBirthDate(birthDate: Date | null, now: Date = new Date()): AgeBand {
  if (!birthDate) return "unknown";
  let age = now.getFullYear() - birthDate.getFullYear();
  const beforeBirthdayThisYear =
    now.getMonth() < birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate());
  if (beforeBirthdayThisYear) age -= 1;
  if (age <= AGE_BAND_POLICY.CHILD_MAX_AGE) return "child";
  if (age <= AGE_BAND_POLICY.TEEN_MAX_AGE) return "teen";
  return "adult";
}

/** States the learner type as an explicit fact so the skill's own "Detecting Learner Profile" shortcut applies
 * ("if the user explicitly states the learner type, use it directly"). The addressing rules themselves live in the skill. */
export function ageToneInstruction(band: AgeBand): string {
  switch (band) {
    case "child":
      return `LEARNER TYPE (stated explicitly, so skip the skill's inference): CHILD (elementary-age).
Apply the skill's "Child" addressing: Output 1 is written to the parent, about the child, in the 3rd person
("the student ..."), in the register of a teacher's progress note — never baby-talk, never addressed to the child.`;
    case "teen":
      return `LEARNER TYPE (stated explicitly, so skip the skill's inference): TEEN.
Apply the skill's "Student (teen)" addressing: Output 1 is still written to the parent, in the 3rd person
("the student ..."), as a professional, achievement-framed progress note. Do NOT address the student as "you".`;
    case "adult":
      return `LEARNER TYPE (stated explicitly, so skip the skill's inference): ADULT.
Apply the skill's "Adult" addressing: Output 1 is written directly to the learner, 2nd person, professional-warm.
Do not use any parent-addressed framing.`;
    case "unknown":
      // The skill's own fallback: when the signal is unclear, treat the learner as the primary audience
      // (adult-style, direct address) and flag the assumption outside the report.
      return `LEARNER TYPE: UNKNOWN (no birthDate on file). Use the skill's fallback for an unclear profile:
ADULT-style direct address (2nd person, no parent framing). This is an assumption, not a confirmed fact.`;
  }
}

// Talk Time — replaces the skill's "estimate from turn length" instruction with the measured value.
export function talkTimeOverrideBlock(params: {
  teacherSeconds: number;
  teacherPercentage: number;
  studentSeconds: number;
  studentPercentage: number;
}): string {
  return `
SYSTEM-MEASURED TALK TIME (do not estimate or recalculate):
Teacher: ${params.teacherSeconds}s (${params.teacherPercentage}%)
Student: ${params.studentSeconds}s (${params.studentPercentage}%)
These values were calculated by the application from speaker timestamps. Treat them as
authoritative facts and use them as-is wherever Output 1 or Output 2 needs a talk-time
figure (Output 2 item 1 is "Talk Time Ratio: Teacher ${params.teacherPercentage}% / Student ${params.studentPercentage}%" —
this replaces the skill's "estimated" wording). Do not estimate, recompute, or second-guess them from the
transcript text. Any % figure you write must be one of these two numbers.

Note for Output 2 only: the mapping of "speaker A/B" to "Teacher/Student" used to
produce these numbers is an UNVERIFIED HEURISTIC (first speaker assumed to be the
teacher) pending real-recording validation — if anything in the transcript suggests
the mapping looks backwards, say so explicitly in Output 2's Pacing & Engagement
section rather than silently trusting or silently ignoring it.
`.trim();
}

export interface ProjectRulesInput {
  lessonDurationMinutes: number;
  speakerCount: number;
}

export function buildProjectRules(input: ProjectRulesInput): string {
  const profile = classLengthProfile(input.lessonDurationMinutes);
  const mappingNote =
    input.speakerCount === 2
      ? "The recording has two speakers."
      : `The recording has ${input.speakerCount} speakers, so the Teacher/Student assignment is LOW confidence.`;
  return `
PROJECT AI EVALUATION RULES
(This application's rules. The skill above is the source of truth for what the reports contain, their structure,
tone and prohibitions. Where this section and the skill differ about HOW THIS RUN WORKS, this section wins.
It never replaces the skill's teaching-content rules.)

1. RUNTIME CONTEXT (replaces the skill's chat workflow)
- You run inside an application, not a chat. Never ask a question and never add a note for the user: the
  language, learner type and date are already decided. Each request asks for ONE of the two outputs; write only that
  one, deliver it only through the tool as plain text, with no wrapper labels such as "Output 1:".
- Write Output 1 in ENGLISH. Do not write it in the student's native language and do not translate it yourself —
  the application localizes it after the teacher publishes it. Keep the skill's section order, emojis and content
  rules, and use these English labels in place of the skill's Korean ones:
    📘 [Date] ... → 📘 [lessonDate from LESSON CONTEXT, e.g. October 2, 2026] ${OUTPUT1_LABELS.title} — [Topic]
    📝 오늘의 학습 내용 → 📝 ${OUTPUT1_LABELS.content}
    💬 오늘 배운 주요 표현 → 💬 ${OUTPUT1_LABELS.expressions}   (and "예문:" → "Example:")
    ✅ 조금만 다듬으면 더 좋아지는 부분 → ✅ ${OUTPUT1_LABELS.polish}   (and "왜 틀렸을까요?" → "Why this happened:")
    🌟 오늘 [학생]이 정말 잘한 점 → 🌟 ${OUTPUT1_LABELS.standout}
- Refer to the learner as "the student". Never guess the student's name from the transcript: speech-to-text
  often misspells names.
- Date: use the lessonDate from LESSON CONTEXT exactly. The title of Output 2 is
  "Tutor Evaluation — [same date] — Tutor".
- Class length: ${profile}-minute profile → use the skill's "${profile}-minute class" structure for Output 1 and the
  matching length scaling for Output 2.

2. SPEAKER GROUNDING
- The transcript is speaker-labeled ("Teacher" / "Student") with [mm:ss] timestamps. Judge each line only by who
  actually said it. ${mappingNote} The labels come from an unverified heuristic (the first speaker is assumed to be
  the teacher). If the content clearly contradicts the labels, do not build conclusions on the roles and say so in
  Output 2 item 2.

3. QUOTE GROUNDING
- Text inside double quotation marks must be copied verbatim from one transcript line. You may start or stop
  mid-line, or use "..." to skip words, but never paraphrase or repair wording inside quotation marks.
- A ❌ line must quote a Student line verbatim. The ✅ corrected sentence is the only place for text that is not in
  the transcript.
- "Example:" lines hold a sentence the student actually said or, if the student produced none, a model sentence the
  tutor actually said. If the transcript has neither for an item, leave the Example line out. Never invent one.
- Output 2 contains NO quotation marks. Support every observation with a [mm:ss] timestamp from the transcript and
  describe what was said in your own words (for example: "at [09:10] the tutor asked why the researchers studied rich
  countries"). Output 1 may quote only: the ❌ student sentence, the Example line, and the one spontaneous student
  sentence in the 🌟 section — each copied word for word.
- Do not quote the tutor's or the student's questions or remarks from memory. If you are not sure of the exact words,
  describe what happened without quotation marks.
- For suggestions, practice sentences or illustrations that are not from the transcript, do not use quotation marks.
- Keep each report within the skill's size for this class length (number of lesson-content lines, key expressions and
  corrections). Fewer items are fine; more are not.

4. TIMESTAMP GROUNDING
- Do not state a duration (minutes or seconds) or a clock time unless it can be read directly from the timestamps.
  When you point to a moment, copy a [mm:ss] timestamp from the transcript. The only duration you may state is the
  lesson length from LESSON CONTEXT. Describe the parts of the lesson in order (for example "a warm-up conversation,
  then a role-play, then vocabulary") without inventing how long each part lasted.
- A suggested practice time (for example "5 minutes a day") is allowed only in the closing practice suggestion of
  the 🌟 section and in Output 2 item 10.

5. READING / SCRIPT PROTECTION
- Lines marked "(possible reading aloud)", and any text the student reads from a textbook, article, script, role-play
  card, sample dialogue, vocabulary example or a sentence the teacher supplied, are NOT spontaneous speech. Never list
  such a sentence as a student error (❌), never present it as the student's own attempt, and never count it as a
  missed correction by the tutor. You may comment on reading fluency or on a mispronounced word.
- If a marker looks wrong because the student is clearly speaking freely, use your judgment — but never present text
  from the reading material as the student's own sentence.

6. DUPLICATE PROTECTION
- Output 1 appears exactly once: one 📘 title line and each of the sections 📝, 💬, ✅, 🌟 exactly once. Output 2 has
  exactly one title and items 1 through 10 exactly once, in order. When the 🌟 section is finished, stop. Never begin
  a second report, a "final version" or a repeat of any section.
- Output 2 never contains the student-facing emoji sections, and Output 1 never contains Tutor Evaluation content.
`.trim();
}

// 2026-10-01 실제 Claude API E2E 테스트에서 발견된 구체적 환각을 막기 위해 추가한 규칙
// ("...a meaningful step forward from his earlier February sessions." — transcript 어디에도 없는 과거
// 수업 이력을 생성함). "이번 수업 내부 비교는 허용, 수업 밖 비교는 금지"라는 원칙이다.
export const HISTORICAL_CONTEXT_POLICY = `
HISTORICAL CONTEXT POLICY:
You are given exactly two kinds of information: (1) today's transcript and (2) the
LESSON CONTEXT block (date, duration, age band, region, measured talk time). You are
NOT given any information about any other lesson — not this student's history, not
their past performance, not whether they've had lessons before. Historical context is
explicitly marked "NOT PROVIDED" in this MVP.

Therefore:
A. Do not state or imply anything about a previous lesson, an earlier session, a prior
   class, "last month," or any lesson other than the one in today's transcript.
B. Do not make comparisons like "improved from before," "continued progress," "a step
   forward from earlier sessions," or similar — you have no baseline to compare against.
C. Do not guess or invent the lesson date. Use the lessonDate given in LESSON CONTEXT
   exactly as given, in the [Date] placeholders in Output 1 and Output 2. Never write a
   different date, and never write "today's date" as if you know what today is.
D. Do not guess the student's past achievements or past weaknesses.
E. This restriction applies ONLY to claims that reach outside today's transcript. It
   does NOT apply to describing change WITHIN this same lesson — e.g. "the student
   first said X, and after the tutor's correction said Y" is fine, since both X and Y
   are from today's transcript. The distinction is: current-lesson-internal evidence is
   always fine; any claim that implies knowledge of a DIFFERENT lesson is not, because
   that information was never given to you.
F. If you have no basis to describe growth or change, simply describe what happened in
   today's lesson as a standalone observation — do not manufacture a trend.
`.trim();

const HISTORICAL_CLAIM_PATTERNS: RegExp[] = [
  /\b(previous|earlier|prior)\s+(lesson|session|class)\b/i,
  /\blast\s+month\b/i,
  /\bsince\s+(last|the\s+last|previous)\s+(lesson|session|class)\b/i,
  /compared\s+(to|with)\s+(before|previous|earlier)/i,
  /\b(improved|improvement|progress)\s+from\s+(previous|earlier|prior|before)/i,
  /continued\s+progress\s+from\s+(previous|prior|earlier)/i,
  /\b(his|her|their)\s+(earlier|previous|prior)\s+\w*\s*sessions?\b/i,
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface GroundingCheckResult {
  ok: boolean;
  issues: string[];
}

/** Rejects claims that reach outside today's transcript: references to other lessons, a month or year that is
 * neither the lesson's nor present in the transcript. When `transcriptText` is given, anything that the transcript
 * itself contains is legitimate (a teacher who really asks "will it be in September?" may be reported), and quoted
 * text is left to the quote-grounding validator. Without it, the check is strict (used by the unit tests). */
export function checkNoUngroundedHistoricalClaims(text: string, lessonDateISO: string, transcriptText?: string): GroundingCheckResult {
  const issues: string[] = [];
  const hasTranscript = transcriptText !== undefined;
  const prose = hasTranscript ? stripQuotedSpans(text) : text;
  const transcriptNorm = hasTranscript ? ` ${normalizeForMatch(transcriptText)} ` : "";
  const inTranscript = (phrase: string) => hasTranscript && transcriptNorm.includes(` ${normalizeForMatch(phrase)} `);

  for (const pattern of HISTORICAL_CLAIM_PATTERNS) {
    const m = prose.match(pattern);
    if (m && !inTranscript(m[0])) issues.push(`historical-claim pattern matched: "${m[0]}"`);
  }

  const lessonMonthName = MONTH_NAMES[new Date(`${lessonDateISO}T00:00:00Z`).getUTCMonth()];
  for (const month of MONTH_NAMES) {
    if (month === lessonMonthName) continue;
    const re = new RegExp(`\\b${month}\\b`);
    if (re.test(prose) && !(hasTranscript && new RegExp(`\\b${month}\\b`, "i").test(transcriptText))) {
      issues.push(`unexpected month "${month}" mentioned (lessonDate's month is ${lessonMonthName})`);
    }
  }

  const lessonYear = lessonDateISO.slice(0, 4);
  for (const year of new Set(prose.match(/\b(?:19|20)\d{2}\b/g) ?? [])) {
    if (year !== lessonYear && !(hasTranscript && transcriptText.includes(year))) {
      issues.push(`unexpected year "${year}" mentioned (lessonDate's year is ${lessonYear})`);
    }
  }

  return { ok: issues.length === 0, issues };
}
