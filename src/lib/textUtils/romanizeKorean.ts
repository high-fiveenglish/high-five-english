// Minimal Revised Romanization of Korean (RR) — used only as a display fallback when a
// student has no registered englishName (see findStudentEnglishName in classroomService).
// Every real student in this demo already has an englishName, so this path is a safety
// net, not the common case — it doesn't need to be linguistically perfect, just readable.

const INITIALS = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s",
  "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];
const MEDIALS = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa",
  "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const FINALS = [
  "", "g", "kk", "gs", "n", "nj", "nh", "d", "l", "lg",
  "lm", "lb", "ls", "lt", "lp", "lh", "m", "b", "bs", "s",
  "ss", "ng", "j", "c", "k", "t", "p", "h",
];

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

function romanizeSyllable(char: string): string {
  const code = char.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return char;
  const offset = code - HANGUL_BASE;
  const initial = Math.floor(offset / (21 * 28));
  const medial = Math.floor((offset % (21 * 28)) / 28);
  const final = offset % 28;
  return INITIALS[initial] + MEDIALS[medial] + FINALS[final];
}

function romanize(text: string): string {
  return Array.from(text).map(romanizeSyllable).join("");
}

function capitalize(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word;
}

/** Romanizes a Korean name as "Given Surname" (matching this project's englishName
 * convention, e.g. "김민준" -> "Minjun Kim") assuming the standard 1-syllable-surname
 * pattern. Non-Hangul input passes through unchanged. */
export function romanizeKoreanName(name: string): string {
  const hangulOnly = /^[가-힣]+$/.test(name);
  if (!hangulOnly || name.length < 2) return capitalize(romanize(name));
  const surname = name.slice(0, 1);
  const given = name.slice(1);
  return `${capitalize(romanize(given))} ${capitalize(romanize(surname))}`;
}
