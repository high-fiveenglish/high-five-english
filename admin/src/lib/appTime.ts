// 이 앱의 유일한 시간 정책: 모든 수업/일정 시각은 "Asia/Seoul(KST) 기준"이다.
// (한국 대상 화상영어 서비스이고, 강사 근무시간·수업시간이 전부 한국 시간 기준으로
// 입력/운영된다.) 이 파일이 그 정책의 유일한 구현체다 — 날짜/시간을 쓰거나
// 보여줘야 하는 곳은 전부 여기를 거쳐야 한다.
//
// 왜 이렇게 해야 하는가:
//  - DB의 DateTime 컬럼은 전부 시간대 없는 Postgres `timestamp`로 매핑되어 있고
//    (schema.prisma에 @db.Timestamptz 없음), Prisma/드라이버/Postgres 어느 계층도
//    시간대를 보정해주지 않는다. Date 객체 자체는 항상 정확한 절대 UTC 순간을
//    담고 있지만(Date.getTime() 비교는 그래서 항상 안전하다), 그 값을 "몇 시로
//    쓰고, 몇 시로 보여줄지"는 전적으로 애플리케이션 코드의 책임이다.
//  - 지금까지 여러 화면이 `.toISOString().slice(...)`(UTC 시각 숫자를 그대로 표시)나
//    `new Date("2026-08-26T19:00")`(오프셋 없는 문자열 — 서버 프로세스의 로컬 TZ로
//    해석됨)를 써서, 서버가 어떤 시간대로 실행되는지에 따라 결과가 달라지는
//    코드가 되어 있었다. 이 파일의 함수들은 서버 프로세스의 TZ 설정과 무관하게
//    항상 Asia/Seoul 기준으로 정확하다.
//  - Asia/Seoul은 서머타임(DST)이 없는 고정 UTC+9이므로("+09:00" 오프셋이 연중
//    변하지 않음), 별도 시간대 라이브러리(date-fns-tz, luxon 등) 없이 순수 JS만으로
//    100% 정확하게 파싱/포맷할 수 있다.

export const APP_TIMEZONE = "Asia/Seoul";
const FIXED_UTC_OFFSET = "+09:00";

/** "YYYY-MM-DD" — Asia/Seoul 기준. */
export function formatAppDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "HH:mm" — Asia/Seoul 기준, 24시간제. */
export function formatAppTime(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** "YYYY-MM-DD HH:mm" — Asia/Seoul 기준. 기존 화면 대부분이 쓰던
 * `.toISOString().slice(0,16).replace("T"," ")` 포맷을 그대로 대체한다. */
export function formatAppDateTime(d: Date): string {
  return `${formatAppDate(d)} ${formatAppTime(d)}`;
}

/** "YYYY-MM-DD HH:mm:ss" — Asia/Seoul 기준(Audit Log처럼 초 단위가 필요한 곳). */
export function formatAppDateTimeSeconds(d: Date): string {
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${formatAppDate(d)} ${time}`;
}

/**
 * datetime-local/date+time 입력값(오프셋 없는 "YYYY-MM-DDTHH:mm" 또는
 * "YYYY-MM-DDTHH:mm:ss")을 "Asia/Seoul의 그 시각"으로 해석해 정확한 절대 순간(Date)을
 * 반환한다. 서버 프로세스의 OS/Node TZ 설정과 완전히 무관하다 — `new Date(naiveString)`
 * (서버 로컬 TZ로 해석됨, 배포 환경에 따라 결과가 달라짐) 대신 이 함수를 쓴다.
 */
export function parseAppDateTime(naiveLocal: string): Date {
  const withSeconds = naiveLocal.length === 16 ? `${naiveLocal}:00` : naiveLocal;
  return new Date(`${withSeconds}${FIXED_UTC_OFFSET}`);
}

/**
 * 기준일(기본값 오늘, Asia/Seoul 기준) + offsetDays일의 자정(Asia/Seoul 00:00)에
 * 해당하는 절대 순간을 반환한다. "오늘 수업 수" 같은 날짜 범위 쿼리의 시작 경계로 쓴다.
 * 월/연도 경계를 넘는 offsetDays도 정확히 처리한다(달력 날짜 산술은 UTC로 표기된
 * 순수 캘린더 값 위에서 수행 — 실제 시간대 변환이 아니라 Y-M-D 자릿수 계산이라 안전).
 */
export function appDayStart(base: Date = new Date(), offsetDays = 0): Date {
  const [y, m, day] = formatAppDate(base).split("-").map(Number);
  const calendarUtc = new Date(Date.UTC(y, m - 1, day));
  calendarUtc.setUTCDate(calendarUtc.getUTCDate() + offsetDays);
  const yyyy = calendarUtc.getUTCFullYear();
  const mm = String(calendarUtc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(calendarUtc.getUTCDate()).padStart(2, "0");
  return parseAppDateTime(`${yyyy}-${mm}-${dd}T00:00`);
}

/** appDayStart와 동일하되 "그날의 끝"(= 다음 날 00:00, exclusive 상한)을 반환한다. */
export function appDayEnd(base: Date = new Date(), offsetDays = 0): Date {
  return appDayStart(base, offsetDays + 1);
}
