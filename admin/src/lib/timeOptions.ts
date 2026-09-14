// 강의 시간 선택지 — 한국시간(KST) 아침 6시부터 밤 12시(자정) 직전까지 30분 단위.
// 레벨테스트 신청 폼과 수강신청 폼이 동일한 선택지를 쓰므로 여기 한 곳에서만 관리한다.
export const HALF_HOUR_TIME_OPTIONS: string[] = Array.from({ length: (24 - 6) * 2 }, (_, i) => {
  const totalMin = 6 * 60 + i * 30;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});
