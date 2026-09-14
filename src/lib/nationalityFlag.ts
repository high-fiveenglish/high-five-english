// 강사 프로필의 국적(nationality)은 관리자 페이지에서 자유 텍스트로 입력되므로
// (예: "philippines", "korea"), 자주 나오는 값만 국기 이모지로 매핑한다. 매핑에 없는
// 값이면 국기 없이 텍스트만 보여준다 — 없는 국기를 지어내지 않는다.
const FLAG_BY_NATIONALITY: Record<string, string> = {
  philippines: "🇵🇭",
  korea: "🇰🇷",
  "south korea": "🇰🇷",
  usa: "🇺🇸",
  "united states": "🇺🇸",
  america: "🇺🇸",
  canada: "🇨🇦",
  uk: "🇬🇧",
  "united kingdom": "🇬🇧",
  england: "🇬🇧",
  australia: "🇦🇺",
  china: "🇨🇳",
  vietnam: "🇻🇳",
  japan: "🇯🇵",
};

export function flagForNationality(nationality: string | null | undefined): string | null {
  if (!nationality) return null;
  return FLAG_BY_NATIONALITY[nationality.trim().toLowerCase()] ?? null;
}
