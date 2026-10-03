// Small text helpers shared by the project rules and the deterministic output validators.

/** Lower-cases and strips punctuation, fillers ("um", "uh") and immediate word repeats ("the, the") so a
 * quotation can be compared with the transcript even when speech-to-text noise or punctuation differs. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…|\.{3}/g, " ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\b(um+|uh+|er+|ah+|hmm+|mm+)\b/g, " ")
    .replace(/\b(\w+)(\s+\1\b)+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(s: string): number {
  const n = normalizeForMatch(s);
  return n === "" ? 0 : n.split(" ").length;
}

export interface QuotedSpan {
  text: string;
  /** index of the opening quotation mark in the source string */
  index: number;
}

const QUOTE_RE = /"([^"\n]+)"|“([^”\n]+)”/g;

export function extractQuotedSpans(s: string): QuotedSpan[] {
  const out: QuotedSpan[] = [];
  for (const m of s.matchAll(QUOTE_RE)) out.push({ text: m[1] ?? m[2] ?? "", index: m.index ?? 0 });
  return out;
}

export function stripQuotedSpans(s: string): string {
  return s.replace(QUOTE_RE, " ");
}
