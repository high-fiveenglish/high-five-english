// 요일 값(0=일~6=토)과 한글 라벨 매핑 — Enrollment.scheduleDays(요일 글자를 이어붙인
// 문자열, 예: "화목")를 만들거나 되돌릴 때 여러 화면에서 공유해서 쓴다.
export const WEEKDAYS = [
  { value: 0, label: "일" },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
];

/** "월수금" 같은 한 글자씩 이어붙인 요일 라벨 문자열을 WEEKDAYS 값(0=일~6=토) 배열로 되돌린다. */
export function parseScheduleDaysLabel(label: string): number[] {
  const values: number[] = [];
  for (const ch of label) {
    const day = WEEKDAYS.find((d) => d.label === ch);
    if (day) values.push(day.value);
  }
  return values;
}
