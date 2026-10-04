// Speaker-role inference with a confidence gate.
//
// AssemblyAI labels voices "A", "B", ... and never says which one is the teacher. The old rule — "the first speaker is the
// teacher" — failed on a real recording (a student said one word before the teacher greeted her), and with swapped roles
// Talk Time, reading-aloud detection and both reports are wrong. This module looks at several independent kinds of evidence
// in the TEXT of the transcript (it cannot hear anything) and answers with a confidence:
//
//   HIGH -> the roles are used automatically.
//   LOW  -> the application must NOT generate Student Feedback / Teacher QC; the teacher confirms the roles first.
//
// No single signal decides. A speaker is only called the teacher when at least MIN_AGREEING_FAMILIES independent evidence
// families vote for that speaker and none votes for the other one, there are exactly two real voices, and the result agrees
// with the old first-speaker rule. Anything else is LOW — a stopped analysis is safer than a confident report with the roles
// swapped. Thresholds are deliberately conservative and come from a handful of real recordings, so they are named constants.
import type { Utterance } from "./talkTime";

export type EvidenceFamily = "questions" | "management" | "instructions" | "replies" | "opening-closing";

export interface SpeakerFeatures {
  label: string;
  turns: number;
  seconds: number;
  words: number;
  avgWordsPerTurn: number;
  /** sentences that ask something ("...?" or starting with a question word) */
  questions: number;
  /** lesson-management phrases: "let's start", "next question", "very good", "today we're going to ..." */
  management: number;
  /** imperatives at the start of a sentence: "read", "repeat", "tell me", "listen" */
  instructions: number;
  /** own turns of at most SHORT_REPLY_WORDS words that directly answer a turn containing a question */
  shortReplies: number;
  /** own turns that directly follow a turn containing a question */
  repliesToQuestion: number;
  /** teacher-style greetings in the first minute and farewells in the last minute */
  openingClosing: number;
}

export interface SpeakerRoleInference {
  confidence: "HIGH" | "LOW";
  /** Set only when confidence is HIGH. */
  teacherLabel: string | null;
  /** The label the old rule would pick (the first speaker). */
  firstSpeaker: string | null;
  speakerCount: number;
  /** Voices beyond the two main speakers (diarization noise, an audio track, a third person). */
  minorSpeakers: string[];
  /** Which family votes for which speaker as the teacher (null = no vote). */
  votes: Record<EvidenceFamily, string | null>;
  features: SpeakerFeatures[];
  /** Plain-language reasons, safe to show or log (they contain no transcript text). */
  reasons: string[];
}

// ── tunable constants (conservative) ───────────────────────────────────────────────────────────────────────────────
const MIN_AGREEING_FAMILIES = 3;
const MIN_TOTAL: Record<EvidenceFamily, number> = { questions: 6, management: 4, instructions: 3, replies: 8, "opening-closing": 1 };
const MIN_SHARE = 0.65; // a family votes only when one speaker owns at least this share of its evidence
const REPLY_RATE_GAP = 0.25;
const SHORT_REPLY_WORDS = 4;
const MINOR_SPEAKER_MAX_TURNS = 3;
const MINOR_SPEAKER_MAX_SHARE = 0.05;
const EDGE_MS = 75_000; // "first minute" / "last minute"

const QUESTION_START = /^(?:what|why|how|when|where|who|which|whose|do you|did you|does|can you|could you|would you|will you|are you|were you|is it|is there|are there|have you|has|should we|shall we|any)\b/i;
const MANAGEMENT: RegExp[] = [
  /\b(?:let'?s|let us)\s+(?:start|begin|go|move|read|look|continue|try|talk|see|check|do|review|listen|watch|finish|stop|proceed)\b/gi,
  /\bnext\s+(?:question|one|page|part|sentence|line|word|lesson|time|item|exercise|unit|step)\b/gi,
  /\bnow\s+(?:we|let'?s|you|please|i want|read|look|listen|can you|it'?s your turn)\b/gi,
  /\bplease\s+(?:read|repeat|say|look|listen|try|tell|answer|write|proceed|continue|wait)\b/gi,
  /\b(?:very good|good job|well done|great job|excellent|that'?s (?:right|correct|good|great)|perfect)\b/gi,
  /\b(?:our|this|today'?s)\s+(?:lesson|class|unit|topic|activity|story|article|exercise)\b/gi,
  /\btoday\s+we(?:'re| are| will)\b/gi,
  /\b(?:any|do you have (?:any )?)\s*questions?\b/gi,
  /\bdo you (?:understand|know the (?:word|meaning))\b/gi,
  /\b(?:on )?page\s+\d+\b/gi,
  /\bhomework\b/gi,
];
const INSTRUCTION = /(?:^|[.!?]\s+)(?:read|repeat|say|listen|look|try|tell me|write|choose|fill|match|answer|describe|check|think about|use|make|complete|spell|point|circle|finish|continue|proceed|wait|go ahead|again)\b/gi;
const TEACHER_OPENING = /\b(?:how are you|how'?s your day|how was your|good (?:morning|afternoon|evening)|how have you been|what did you do)\b/i;
const TEACHER_CLOSING = /\b(?:see you (?:next|on|tomorrow|later|again|then)|have a (?:great|nice|good|wonderful) (?:day|night|evening|weekend|one)|thank you for (?:your time|today|joining|coming)|that'?s all for today|we'?ll (?:continue|stop) (?:here|next))\b/i;
const MENTIONS_AUDIO = /\b(?:audio|listen|listening|video|recording|play(?:ing)? (?:it|the))\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}
function countMatches(text: string, res: RegExp[]): number {
  return res.reduce((n, re) => n + (text.match(re)?.length ?? 0), 0);
}
function containsQuestion(text: string): boolean {
  return sentences(text).some((s) => s.endsWith("?") || QUESTION_START.test(s));
}

function emptyFeatures(label: string): SpeakerFeatures {
  return { label, turns: 0, seconds: 0, words: 0, avgWordsPerTurn: 0, questions: 0, management: 0, instructions: 0, shortReplies: 0, repliesToQuestion: 0, openingClosing: 0 };
}

export function computeSpeakerFeatures(utterances: Utterance[]): SpeakerFeatures[] {
  const byLabel = new Map<string, SpeakerFeatures>();
  const first = utterances[0]?.start ?? 0;
  const last = utterances[utterances.length - 1]?.end ?? 0;
  utterances.forEach((u, i) => {
    const f = byLabel.get(u.speaker) ?? emptyFeatures(u.speaker);
    byLabel.set(u.speaker, f);
    const words = u.text.split(/\s+/).filter(Boolean).length;
    f.turns++;
    f.seconds += Math.max(0, u.end - u.start) / 1000;
    f.words += words;
    f.questions += sentences(u.text).filter((s) => s.endsWith("?") || QUESTION_START.test(s)).length;
    f.management += countMatches(u.text, MANAGEMENT);
    f.instructions += u.text.match(INSTRUCTION)?.length ?? 0;
    if (u.start - first <= EDGE_MS && TEACHER_OPENING.test(u.text)) f.openingClosing++;
    if (last - u.end <= EDGE_MS && TEACHER_CLOSING.test(u.text)) f.openingClosing++;
    const prev = utterances[i - 1];
    if (prev && prev.speaker !== u.speaker && containsQuestion(prev.text)) {
      f.repliesToQuestion++;
      if (words <= SHORT_REPLY_WORDS) f.shortReplies++;
    }
  });
  const list = [...byLabel.values()];
  for (const f of list) f.avgWordsPerTurn = f.turns === 0 ? 0 : Math.round((f.words / f.turns) * 10) / 10;
  // The two main voices are the two with the most turns: a long played audio track must not outrank a student who answers briefly.
  return list.sort((a, b) => b.turns - a.turns || b.seconds - a.seconds);
}

/** Votes for the speaker who owns at least MIN_SHARE of an evidence family (null = not enough evidence). */
function shareVote(a: SpeakerFeatures, b: SpeakerFeatures, pick: (f: SpeakerFeatures) => number, family: EvidenceFamily): string | null {
  const x = pick(a);
  const y = pick(b);
  if (x + y < MIN_TOTAL[family]) return null;
  if (x / (x + y) >= MIN_SHARE) return a.label;
  if (y / (x + y) >= MIN_SHARE) return b.label;
  return null;
}

/** Students answer briefly: the speaker whose replies to questions are clearly shorter is the student, so the other is the teacher. */
function repliesVote(a: SpeakerFeatures, b: SpeakerFeatures): string | null {
  if (a.repliesToQuestion + b.repliesToQuestion < MIN_TOTAL.replies) return null;
  if (a.repliesToQuestion < 3 || b.repliesToQuestion < 3) return null;
  const ra = a.shortReplies / a.repliesToQuestion;
  const rb = b.shortReplies / b.repliesToQuestion;
  if (rb - ra >= REPLY_RATE_GAP) return a.label;
  if (ra - rb >= REPLY_RATE_GAP) return b.label;
  return null;
}

export function inferSpeakerRoles(utterances: Utterance[]): SpeakerRoleInference {
  const features = computeSpeakerFeatures(utterances);
  const firstSpeaker = utterances[0]?.speaker ?? null;
  const reasons: string[] = [];
  const noVotes: Record<EvidenceFamily, string | null> = { questions: null, management: null, instructions: null, replies: null, "opening-closing": null };
  const low = (why: string, votes = noVotes, minorSpeakers: string[] = []): SpeakerRoleInference => ({
    confidence: "LOW",
    teacherLabel: null,
    firstSpeaker,
    speakerCount: features.length,
    minorSpeakers,
    votes,
    features,
    reasons: [...reasons, why],
  });

  if (features.length < 2) return low(`only ${features.length} voice detected`);

  // Voices beyond the two main speakers: tiny speakers are diarization noise, a playback track or a third person.
  const totalTurns = features.reduce((n, f) => n + f.turns, 0);
  const [main1, main2] = features;
  const minor = features.slice(2).map((f) => f.label);
  const minorIsAudio = features
    .slice(2)
    .some((f) => utterances.some((u, i) => u.speaker === f.label && i > 0 && MENTIONS_AUDIO.test(utterances[i - 1].text)));
  if (minor.length > 0) {
    reasons.push(`${features.length} voices detected${minorIsAudio ? " (one looks like a played audio track)" : ""}`);
  }
  const tinyMain = [main1, main2].some((f) => f.turns <= MINOR_SPEAKER_MAX_TURNS || f.turns / totalTurns < MINOR_SPEAKER_MAX_SHARE);
  if (tinyMain) reasons.push("one of the two main voices has almost no turns");

  const votes: Record<EvidenceFamily, string | null> = {
    questions: shareVote(main1, main2, (f) => f.questions, "questions"),
    management: shareVote(main1, main2, (f) => f.management, "management"),
    instructions: shareVote(main1, main2, (f) => f.instructions, "instructions"),
    replies: repliesVote(main1, main2),
    "opening-closing": shareVote(main1, main2, (f) => f.openingClosing, "opening-closing"),
  };
  const tally = new Map<string, number>();
  for (const v of Object.values(votes)) if (v) tally.set(v, (tally.get(v) ?? 0) + 1);
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const [leader, leaderVotes] = ranked[0] ?? [null, 0];
  const opposing = ranked[1]?.[1] ?? 0;

  if (!leader || leaderVotes < MIN_AGREEING_FAMILIES) {
    reasons.push(`only ${leaderVotes} independent evidence families identify a teacher (${MIN_AGREEING_FAMILIES} needed)`);
  }
  if (opposing > 0) reasons.push("the evidence families disagree about who the teacher is");
  if (leader && leader !== firstSpeaker) reasons.push("the evidence points at a different speaker than the first speaker");

  const ok = minor.length === 0 && !tinyMain && !!leader && leaderVotes >= MIN_AGREEING_FAMILIES && opposing === 0 && leader === firstSpeaker;
  if (!ok) {
    return { ...low("roles cannot be confirmed automatically", votes, minor), reasons };
  }
  reasons.push(`${leaderVotes} independent evidence families agree on the teacher and match the first speaker`);
  return { confidence: "HIGH", teacherLabel: leader, firstSpeaker, speakerCount: features.length, minorSpeakers: [], votes, features, reasons };
}

/** One short line for logs and the teacher-facing status. Contains no transcript text. */
export function summarizeInference(r: SpeakerRoleInference): string {
  return `${r.confidence}: ${r.reasons.join("; ")}`;
}
