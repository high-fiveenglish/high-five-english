// Builds the speaker-labeled, timestamped view of an AssemblyAI transcript that is shown to Claude.
// The raw utterances (what AssemblyAI returned) are never mutated: every function returns new objects, so
// Talk Time and the validators keep working from the original data.
import type { Utterance } from "./talkTime";
import { wordCount } from "./evaluationText";

export type SpeakerRole = "Teacher" | "Student";

export interface RoleUtterance {
  index: number;
  role: SpeakerRole;
  /** AssemblyAI's anonymous label ("A", "B", ...) */
  rawSpeaker: string;
  startMs: number;
  endMs: number;
  text: string;
  /** heuristic: the student is probably reading a passage/script, not speaking spontaneously */
  possibleReadAloud: boolean;
}

export interface SpeakerMapping {
  teacherLabel: string;
  speakerCount: number;
  method: "first-speaker-heuristic";
  /** never "verified": no teacher/student identification data exists yet. "low" when the recording does not have exactly two speakers. */
  confidence: "unverified" | "low";
}

/** "08:22", or "1:02:03" for recordings over an hour. */
export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function describeSpeakerMapping(utterances: Utterance[], teacherLabel: string | null): SpeakerMapping | null {
  if (!teacherLabel) return null;
  const speakerCount = new Set(utterances.map((u) => u.speaker)).size;
  return { teacherLabel, speakerCount, method: "first-speaker-heuristic", confidence: speakerCount === 2 ? "unverified" : "low" };
}

// An explicit teacher instruction to read something aloud ("please read the title", "can you read Role B", "we're gonna
// read the first paragraph"). Deliberately does not match thanks/praise such as "thank you for reading", and does not
// match a question about the text ("what is the title of lesson 48?"): the answer to a question is the student's own words.
const READ_REQUEST =
  /\b(?:please read|can you read|could you read|you can read|you read|let'?s read|(?:gonna|going to|will|want you to) read|go ahead and read|start reading|read (?:the|this|that|it|all|out|aloud|role|first|second|next|paragraph|sentence|line|here))\b/i;
// The teacher points at written material without saying "read" ("look at the dialogue on page 12").
const TEXT_REFERENCE =
  /\b(?:page \d+|passage|paragraph|article|text ?book|workbook|worksheet|dialog(?:ue)?|script|story|role [a-z]|line \d+)\b/i;
// A question that asks for the student's own answer, even if it mentions the text ("what is the passage about?").
const OPEN_QUESTION = /\b(?:what|why|how|who|where|when|which|do you think|did you|have you|tell me)\b/i;
// The teacher asked or prompted the student, so a long fluent reply is an answer, not a passage. Found on a real recording:
// a 30-word fluent answer about academic pressure was flagged as reading aloud only because it had no filler words, which
// hid the one real grammar error in the lesson from the feedback.
const PROMPT = /\?|\b(?:you|your|tell me)\b/i;
// Lets a read segment carry on across a short teacher interjection ("okay", "good", "next", "keep going") that is not a question.
// Only a cue that means "read on" continues a segment: "continue", "keep going", "go on", "carry on", "next", or a bare
// "okay". A short reaction that merely evaluates the reading ("Good.", "That's right.", "Very good.", "Correct.") does not:
// what the student says after it is usually their own answer.
const CONTINUE_CUE = /\b(?:continue|keep going|go on|carry on|next)\b/i;
const BARE_OKAY = /^\s*(?:ok|okay)[\s.,!]*$/i;
const DISFLUENCY = /\b(?:um+|uh+|er+|hmm+|like|you know|i mean)\b/i;
// More signs of free speech used ONLY by the weak prose fallback (a cue such as "please read" still wins): a word said twice
// in a row ("when when", "expect expect"), conversational acknowledgements inside the turn ("yeah", "okay"), and choppy
// delivery (many one- or two-word sentences). Found on a real recording: three fluent-looking retelling answers full of real
// grammar errors were flagged as reading aloud by the fallback, which then made the validator reject the very corrections
// the report needed.
const REPEATED_WORD = /\b([a-z']{2,})\s+\1\b/i;
const CONVERSATIONAL = /\b(?:yeah|yep|uh-huh|mm-hmm|okay|ok)\b/i;
const CHOPPY_SENTENCE_MAX_WORDS = 2;
const CHOPPY_SHARE = 0.25;

function soundsLikeFreeSpeech(text: string): boolean {
  if (DISFLUENCY.test(text) || REPEATED_WORD.test(text) || CONVERSATIONAL.test(text)) return true;
  const sentences = text.split(/[.!?]+/).map((x) => x.trim()).filter(Boolean);
  const choppy = sentences.filter((x) => wordCount(x) <= CHOPPY_SENTENCE_MAX_WORDS).length;
  return choppy >= 2 && choppy / sentences.length >= CHOPPY_SHARE;
}
const PROSE_LIKE_MIN_WORDS = 30;
const READ_ALOUD_MIN_WORDS = 4;

// A short teacher turn that only names the text to be read ("Role B.", "page 12", "the dialogue") is an instruction to read it.
// A long turn that merely mentions the text, or any open question about it, is not.
const NAMES_TEXT_MAX_WORDS = 12;
function namesTextToRead(teacherText: string): boolean {
  return TEXT_REFERENCE.test(teacherText) && !OPEN_QUESTION.test(teacherText) && wordCount(teacherText) <= NAMES_TEXT_MAX_WORDS;
}

function continuesReading(teacherText: string): boolean {
  return !teacherText.includes("?") && (CONTINUE_CUE.test(teacherText) || BARE_OKAY.test(teacherText));
}

/** Flags student turns that probably read written material, using the teacher turn before them as evidence:
 * (1) the turn(s) right after an explicit read instruction (or a short turn naming the text/role to read), until the next teacher turn;
 * (2) the continuation of a flagged read segment across a short, non-question teacher interjection;
 * (3) long prose-like turns with no speech disfluencies, unless the teacher had just asked or prompted the student
 * (a pointer to the textbook/passage that is not an open question counts as evidence for reading, not as a prompt).
 * The student's own words (first-person pronouns etc.) are not used: scripted text says "I"/"my" too.
 * Conservative on purpose — a wrong flag only hides one sentence from being used as an "error". */
function detectReadAloud(base: Omit<RoleUtterance, "possibleReadAloud">[]): boolean[] {
  const flags = new Array<boolean>(base.length).fill(false);
  let teacherText: string | null = null;
  let readRequested = false;
  let continuing = false;
  let lastStudentFlagged = false;
  let reactedToReading = false;
  base.forEach((u, i) => {
    if (u.role === "Teacher") {
      teacherText = u.text;
      readRequested = READ_REQUEST.test(u.text) || namesTextToRead(u.text);
      continuing = lastStudentFlagged && continuesReading(u.text);
      // The teacher answered a reading with something other than "read on" ("Good.", "That's right."): what the student
      // says next is a reply, so even a long fluent turn is not treated as more reading by the weak prose fallback.
      reactedToReading = lastStudentFlagged && !continuing && !readRequested;
      return;
    }
    const words = wordCount(u.text);
    const pointsAtText = teacherText !== null && TEXT_REFERENCE.test(teacherText) && !OPEN_QUESTION.test(teacherText);
    const prompted = teacherText !== null && PROMPT.test(teacherText) && !pointsAtText;
    // A continuation is a bare "okay"/"next": a reply with disfluencies after it is the student talking, not reading on.
    if (readRequested && words >= READ_ALOUD_MIN_WORDS) flags[i] = true;
    else if (continuing && words >= READ_ALOUD_MIN_WORDS && !DISFLUENCY.test(u.text)) flags[i] = true;
    else if (words >= PROSE_LIKE_MIN_WORDS && !soundsLikeFreeSpeech(u.text) && !prompted && !reactedToReading) flags[i] = true;
    lastStudentFlagged = flags[i];
  });
  return flags;
}

/** Everything that is not the teacher's label is "Student" — the same rule computeTalkTime applies. */
export function toRoleUtterances(utterances: Utterance[], teacherLabel: string | null): RoleUtterance[] {
  if (!teacherLabel) return [];
  const base = utterances.map((u, index) => ({
    index,
    role: (u.speaker === teacherLabel ? "Teacher" : "Student") as SpeakerRole,
    rawSpeaker: u.speaker,
    startMs: u.start,
    endMs: u.end,
    text: u.text.trim(),
  }));
  const flags = detectReadAloud(base);
  return base.map((u, i) => ({ ...u, possibleReadAloud: flags[i] }));
}

export function renderSpeakerTranscript(roles: RoleUtterance[]): string {
  return roles
    .map((r) => `[${formatTimestamp(r.startMs)}] ${r.role}${r.possibleReadAloud ? " (possible reading aloud)" : ""}: ${r.text}`)
    .join("\n");
}

export function recordingLengthMs(roles: RoleUtterance[]): number {
  return roles.reduce((max, r) => Math.max(max, r.endMs), 0);
}
