// 학생이 영어 이름을 등록하지 않은 경우, 한글 이름을 발음에 맞춰 로마자로 변환해
// 수강신청 폼의 "영어 이름" 기본값으로 쓰기 위한 표준 로마자 표기법(국어의 로마자 표기법)
// 간이 구현이다. 완벽한 표기가 아니라 admin이 확인·수정할 수 있는 초안 용도다.
// 중국어 이름 등 한글이 아닌 이름은 변환하지 않고 null을 반환한다 — 별도 라이브러리 없이
// 정확한 발음 로마자 표기를 만들기 어렵기 때문에, 그 경우 관리자가 직접 입력하도록 안내한다.

const INITIALS = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "c", "k", "t", "p", "h",
];

const MEDIALS = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe",
  "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];

const FINALS = [
  "", "g", "kk", "gs", "n", "nj", "nh", "d", "l", "lg", "lm", "lb", "ls", "lt", "lp", "lh",
  "m", "b", "bs", "s", "ss", "ng", "j", "c", "k", "t", "p", "h",
];

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;

function isHangulSyllable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END;
}

function romanizeSyllable(char: string): string {
  const code = char.codePointAt(0)! - HANGUL_SYLLABLE_START;
  const finalIndex = code % 28;
  const medialIndex = ((code - finalIndex) / 28) % 21;
  const initialIndex = (((code - finalIndex) / 28) - medialIndex) / 21;
  return INITIALS[initialIndex] + MEDIALS[medialIndex] + FINALS[finalIndex];
}

/** 한글 이름(2~4음절)을 로마자 발음 표기 초안으로 변환한다. 한글이 아니면 null. */
export function romanizeKoreanName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || ![...trimmed].every((c) => isHangulSyllable(c) || c === " ")) return null;

  return trimmed
    .split(" ")
    .map((word) =>
      [...word]
        .map((c, i) => {
          const syllable = romanizeSyllable(c);
          return i === 0 ? syllable.charAt(0).toUpperCase() + syllable.slice(1) : syllable;
        })
        .join(""),
    )
    .join(" ");
}
