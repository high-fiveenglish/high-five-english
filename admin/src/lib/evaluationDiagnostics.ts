// Why did a generated report fail validation? — recorded as CATEGORIES AND COUNTS ONLY.
//
// The validators (evaluationValidation.ts, projectEvaluationRules.ts) return sentences, and many of them quote the transcript
// ("a quotation is not in the transcript: ...", "still in the text: ..."). A transcript is a real student's speech, so those sentences must
// never reach a log line or the database column AudioRecording.errorMessage. They are still sent to Claude in the retry notice (that is how
// the model learns what to fix) — this module only decides what is KEPT: for each attempt, how many problems of which kind.
//
// Nothing here reads or returns any text of a report or of the transcript.
export type IssueCategory =
  | "quotation_marks"
  | "quote_not_in_transcript"
  | "timestamp_mismatch"
  | "talk_time_figure"
  | "time_grounding"
  | "historical_claim"
  | "structure"
  | "other";

export const ISSUE_CATEGORIES: readonly IssueCategory[] = Object.freeze([
  "quotation_marks",
  "quote_not_in_transcript",
  "timestamp_mismatch",
  "talk_time_figure",
  "time_grounding",
  "historical_claim",
  "structure",
  "other",
]);

/** Why an attempt produced no report to validate at all. */
export type AttemptStop = "response_cut_off" | "response_empty" | "time_budget";

export interface AttemptRecord {
  /** 1-based */
  attempt: number;
  /** true when the report passed validation */
  ok: boolean;
  stop?: AttemptStop;
  /** number of problems per category (for quotation_marks: the number of quotation marks the validator counted) */
  categories: Partial<Record<IssueCategory, number>>;
}

export interface GenerationDiagnostics {
  student: AttemptRecord[];
  teacherQc: AttemptRecord[];
}

/** Which kind of problem a validator sentence describes. Matches on the validator's own wording; anything unknown is "other"
 * (a test runs the real validators over defective reports and fails if a known defect lands in "other"). */
export function classifyIssue(issue: string): { category: IssueCategory; weight: number } {
  const marks = /contains (\d+) quotation marks?/.exec(issue);
  if (marks) return { category: "quotation_marks", weight: Math.max(1, Number(marks[1])) };
  if (/a quotation is not in the transcript|student sentence is not in the transcript|said by the Teacher, not the student|reading aloud|stops where the speaker label changes|missed-correction/.test(issue)) {
    return { category: "quote_not_in_transcript", weight: 1 };
  }
  if (/\] is a line where/.test(issue)) return { category: "timestamp_mismatch", weight: 1 };
  if (/does not match any timestamp|cannot be read from the timestamps/.test(issue)) return { category: "time_grounding", weight: 1 };
  if (/percentage|talk time/i.test(issue)) return { category: "talk_time_figure", weight: 1 };
  if (/historical-claim|unexpected month|unexpected year/.test(issue)) return { category: "historical_claim", weight: 1 };
  if (/title marker|"Tutor Evaluation" title|numbered|emoji section|missing the section|repeats the section|repeats a numbered|lists \d+ |Tutor Evaluation content|exactly once/.test(issue)) {
    return { category: "structure", weight: 1 };
  }
  return { category: "other", weight: 1 };
}

/** One attempt: the validator's issues (null when the attempt had no report to validate) folded into category counts. */
export function recordAttempt(attempt: number, issues: string[] | null, stop?: AttemptStop): AttemptRecord {
  const categories: Partial<Record<IssueCategory, number>> = {};
  for (const issue of issues ?? []) {
    const { category, weight } = classifyIssue(issue);
    categories[category] = (categories[category] ?? 0) + weight;
  }
  return { attempt, ok: issues !== null && issues.length === 0 && !stop, ...(stop ? { stop } : {}), categories };
}

/** `a1 quotation_marks×7; a2 quotation_marks×4, structure×1; a3 response_cut_off; a4 ok` — safe to store and to log. */
export function summarizeAttempts(records: AttemptRecord[]): string {
  return records
    .map((r) => {
      if (r.stop) return `a${r.attempt} ${r.stop}`;
      if (r.ok) return `a${r.attempt} ok`;
      const parts = ISSUE_CATEGORIES.filter((c) => (r.categories[c] ?? 0) > 0).map((c) => `${c}×${r.categories[c]}`);
      return `a${r.attempt} ${parts.join(", ") || "other×1"}`;
    })
    .join("; ");
}

/** The message that replaces the old "<label> rejected after N attempts — <the validators' sentences>". */
export function describeRejection(label: string, records: AttemptRecord[]): string {
  const timedOut = records.some((r) => r.stop === "time_budget");
  const head = timedOut ? `${label} not accepted within the time budget after ${records.filter((r) => r.stop !== "time_budget").length} attempts` : `${label} rejected after ${records.length} attempts`;
  return `${head} — ${summarizeAttempts(records)}`;
}

/** Thrown when a report did not pass validation in the allowed attempts. Carries the per-attempt record, never any report text. */
export class EvaluationNotAcceptedError extends Error {
  constructor(
    public readonly label: string,
    public readonly records: AttemptRecord[],
  ) {
    super(describeRejection(label, records));
    this.name = "EvaluationNotAcceptedError";
  }
}
