// URL 경로/쿼리의 정수 id를 Prisma로 넘기기 전에 검증한다.
//
// 배경: `Number(id)`로 바꾼 값을 그대로 `where: { id }`에 넣으면, 숫자가 아닌 값("abc" → NaN)이나 DB 정수 범위를 넘는 값
// ("99999999999")에서 Prisma가 오류를 던져 500(Admin 화면은 200 + 오류 화면)이 된다. 또 "1.5" 같은 소수가 정수로 바뀌어
// 엉뚱한 행과 맞아떨어지는 일도 있었다(/api/public/reviews/1.5 → 200).
//
// parseRouteId: 경로/쿼리 id 전용. 앞자리가 0이 아닌 1~10자리 10진 정수이고 int4 최대값 이하일 때만 숫자를 돌려주고, 그 외는 전부
//   null이다(빈 값, 공백, 부호, 소수, 지수 표기, 선행 0, 범위 초과). 호출부는 null을 "없는 항목"(notFound()/404)으로 처리한다.
// isInt4: 요청 본문의 숫자처럼 이미 Number로 바뀐 값의 범위만 확인한다(기존 응답 규칙은 유지하고 범위 초과만 막는다).

/** Postgres int4 최대값 — 이보다 큰 id는 존재할 수 없고 Prisma에 넘기면 오류가 난다. */
export const MAX_INT4 = 2_147_483_647;

export function parseRouteId(raw: string | string[] | null | undefined): number | null {
  if (typeof raw !== "string" || !/^[1-9][0-9]{0,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= MAX_INT4 ? n : null;
}

export function isInt4(n: number): boolean {
  return Number.isInteger(n) && n >= -MAX_INT4 - 1 && n <= MAX_INT4;
}
