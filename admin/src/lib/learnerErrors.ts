// Pattern detector for CLEAR learner errors in spontaneous Student speech — high precision, deliberately low recall.
//
// Why it exists: on a real 25-minute recording the Student Feedback listed three corrections, one of which was a correct sentence
// ("It's not safe." offered as a tense error) while four unmistakable errors went unmentioned (a plural after "every", "there was"
// + a plural, "didn't" + a past form, "is there" + a plural). A language model cannot be made to notice them reliably, and a
// validator cannot judge whether an arbitrary sentence is correct — but it CAN recognise a short list of textbook errors by
// pattern. They are used twice: shown to the model as candidates ("choose from these first") and checked afterwards ("at least
// one ❌ must be one of them"), see evaluationValidation.ts. Nothing here calls a model.
//
// Only Student turns that are not possible reading aloud are scanned, and a turn that stops where the speaker label changes (a
// diarization split) is skipped, exactly like the ❌ validator does.
import { normalizeForMatch } from "./evaluationText";
import { formatTimestamp, type RoleUtterance } from "./speakerTranscript";

export interface LearnerErrorCandidate {
  /** start of the Student turn that contains the error (a valid [mm:ss] label) */
  startMs: number;
  ts: string;
  rule: string;
  /** the matching words, normalised like normalizeForMatch (lower case, no punctuation) */
  phrase: string;
}

const IRREGULAR_PAST = new Set([
  "had", "went", "saw", "ate", "got", "made", "took", "came", "said", "knew", "felt", "did", "bought", "was", "were", "gave", "found",
  "told", "thought", "wrote", "ran", "spoke", "drove", "slept", "woke", "brought", "caught", "taught", "heard", "met", "paid", "sat",
  "stood", "understood", "wore", "won", "began", "broke", "chose", "drank", "flew", "forgot", "grew", "held", "kept", "left", "lost",
  "meant", "sent", "spent", "built", "fell", "sang", "swam", "threw", "ate",
]);
const ADVERBS = "(?:actually |really |even |just |also |still |always |ever |usually |quite |very |only )*";
// Words that end in "-s"/"-ed" but are not a plural / a past form in the pattern below.
const SINGULAR_S_WORDS = new Set([
  "news", "physics", "mathematics", "economics", "politics", "athletics", "series", "species", "lens", "christmas", "canvas", "atlas",
  "gas", "bias", "alias", "chaos", "texas", "paris", "james", "thomas", "lewis", "charles", "jess", "always", "perhaps", "sometimes",
  "besides", "towards", "afterwards", "yes", "plus", "this", "his", "its", "has", "does", "was", "is", "us", "as", "means",
  "headquarters", "crossroads", "barracks",
]);

interface Rule {
  id: string;
  re: RegExp;
  /** extra check on the captured group(s); returning false drops the match */
  ok?: (m: RegExpMatchArray) => boolean;
}

const COUNTABLE_PLURALS = "(?:reasons|ways|things|people|students|problems|rules|questions|friends|boys|girls|kids|others)";
const NUMBERS = "(?:two|three|four|five|six|seven|eight|nine|ten|many|several)";

const RULES: Rule[] = [
  // "there was two boys", "there is many people"
  { id: "there-be + plural", re: new RegExp(`\\bthere (?:was|is) ${NUMBERS}`) },
  // "is there three reasons"
  { id: "is there + plural", re: new RegExp(`\\bis there (?:${NUMBERS}|${COUNTABLE_PLURALS})`) },
  // "almost every boys have", "each others"
  {
    id: "every/each + plural noun",
    re: /\b(?:every|each) ([a-z]*[a-hj-rt-z]s)\b/,
    ok: (m) => !SINGULAR_S_WORDS.has(m[1]),
  },
  // "I didn't actually had a headache", "she didn't went"
  {
    id: "did not + past form",
    re: new RegExp(`\\b(?:didn't|did not|don't|do not|can't|cannot|won't|couldn't|wouldn't|shouldn't) ${ADVERBS}([a-z]+)\\b`),
    ok: (m) => IRREGULAR_PAST.has(m[1]) || (/^[a-z]{3,}ed$/.test(m[1]) && !/eed$/.test(m[1])),
  },
  // "he doesn't likes"
  {
    id: "does not + verb-s",
    re: new RegExp(`\\b(?:doesn't|does not) ${ADVERBS}([a-z]+)\\b`),
    ok: (m) => m[1] === "has" || (/[a-z]{3,}s$/.test(m[1]) && !/(?:ss|us|is)$/.test(m[1]) && !SINGULAR_S_WORDS.has(m[1])),
  },
  // "she don't know"
  { id: "he/she don't", re: /\b(?:he|she) (?:don't|do not)\b/ },
  // "I'm agree"
  { id: "am agree", re: /\b(?:i am|i'm) agree\b/ },
  // "people is", "people was"
  { id: "people + singular verb", re: /\bpeople (?:is|was|has|does)\b/ },
  // "everyone have", "everybody are"
  { id: "everyone + plural verb", re: /\b(?:everyone|everybody|someone|somebody|nobody) (?:have|are|were|don't)\b/ },
];

/** A Student turn that stops mid-sentence where the next Teacher turn starts in lower case: one sentence split by the speaker labels. */
function splitByDiarization(turn: RoleUtterance, roles: RoleUtterance[]): boolean {
  if (/[.?!…]["”']?\s*$/.test(turn.text.trim())) return false;
  const next = roles[roles.indexOf(turn) + 1];
  return !!next && next.role === "Teacher" && /^[a-z]/.test(next.text.trim());
}

export function detectLearnerErrors(roles: RoleUtterance[], max = 8): LearnerErrorCandidate[] {
  const out: LearnerErrorCandidate[] = [];
  const seen = new Set<string>();
  for (const turn of roles) {
    if (turn.role !== "Student" || turn.possibleReadAloud || splitByDiarization(turn, roles)) continue;
    // sentence by sentence, so a pattern never spans two sentences
    for (const sentence of turn.text.split(/(?<=[.!?])\s+/)) {
      const norm = normalizeForMatch(sentence);
      for (const rule of RULES) {
        const m = norm.match(rule.re);
        if (!m || (rule.ok && !rule.ok(m))) continue;
        const phrase = m[0].trim();
        if (phrase.split(" ").length < 2) continue;
        const key = `${turn.index}|${phrase}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ startMs: turn.startMs, ts: formatTimestamp(turn.startMs), rule: rule.id, phrase });
      }
    }
  }
  return out.slice(0, max);
}

/** The block shown to the model (Output 1 only): which sentences contain a clear error, found by a fixed pattern rather than judged by a model. */
export function formatLearnerErrorBlock(candidates: LearnerErrorCandidate[]): string {
  if (candidates.length === 0) return "";
  return [
    "CLEAR LEARNER ERRORS FOUND BY FIXED GRAMMAR PATTERNS (spontaneous Student speech; matched by pattern, not judged by a model):",
    ...candidates.map((c) => `- [${c.ts}] "...${c.phrase}..." (${c.rule})`),
    "Check each against the transcript line that starts at its [mm:ss]. If one is a genuine error, prefer it for a ❌ item: copy the whole Student sentence that contains it.",
    "At least one ❌ item must be one of these. Do not add a ❌ item you are not sure is wrong — fewer corrections is better than a doubtful one.",
  ].join("\n");
}
