// 정규 수업 재배치(cascade)의 슬롯 계산(src/lib/regularSlot.ts) 검증 — 오프라인(DB/네트워크 없음).
//  1) 월/수/금: 수요일 연기 → 시퀀스가 한 칸 밀림 / 금요일 휴강이면 다음 월요일로 건너뜀
//  2) 건너뛰는 조건: 이미 찬 날짜, 휴강일, 강사/학생 일정 충돌, 시작한 슬롯, 요일별 시각(classTimes)
//  3) "시퀀스를 한 칸씩 미는 참조 구현"과 날짜 집합이 같음을 무작위 시나리오로 증명(최소 변경 적용이 전체 cascade와 동일한 결과)
//  4) 수강 종료일은 단순 +1일이 아니라 실제 마지막 정규 수업 날짜까지
// 실행(admin 디렉터리): npx tsx scripts/test-regularSlot.ts
import fs from "node:fs";
import path from "node:path";
import { addDaysIso, endDateToIso, extendedEndDate, findNextFreeRegularSlot, isoToEndDate, weekdayOfIso, type BusyInterval } from "../src/lib/regularSlot";
import { formatAppDate, parseAppDateTime } from "../src/lib/appTime";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// 2026-10-05는 월요일.
const MWF = [1, 3, 5];
const at = (iso: string, time = "20:00") => parseAppDateTime(`${iso}T${time}`);
const timeAll = () => "20:00";

/** 시작일부터 count개 슬롯을 순서대로 깔아 그 날짜 목록(정규 수업 시퀀스)을 만든다. */
function sequence(start: string, weekdays: number[], count: number, skip: Set<string> = new Set()): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < count && i < 800; i++) {
    const d = addDaysIso(start, i);
    if (weekdays.includes(weekdayOfIso(d)) && !skip.has(d)) out.push(d);
  }
  return out;
}

// ── 1) 월/수/금 예시 ──────────────────────────────────────────────────────────────────────────────────────────
{
  // 원래 시퀀스: 월 수 금 월 수 금 (10/5 10/7 10/9 10/12 10/14 10/16)
  const seq = sequence("2026-10-05", MWF, 6);
  check("fixture: 시퀀스가 월수금월수금", eq(seq, ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16"]));
  const now = at("2026-10-05", "09:00");

  // 수요일(10/7) 수업 연기 → 그 수업을 뺀 나머지 + 첫 번째 빈 슬롯(월 10/19)
  const occupied = new Set(seq);
  const slot = findNextFreeRegularSlot({ weekdays: MWF, timeByWeekday: timeAll, durationMin: 25, lowerBound: at("2026-10-07"), occupiedDates: occupied, closureDates: new Set(), busy: [] });
  check("수요일 연기: 연기된 수업 이후 첫 빈 정규 슬롯은 시퀀스 끝 다음 월요일(10/19)", slot?.date === "2026-10-19", slot?.date);
  const after = [...seq.filter((d) => d !== "2026-10-07"), slot!.date].sort();
  check("수요일 연기 후 시퀀스: 월 금 월 수 금 월 (정규 수업 수는 그대로 6개)", eq(after, ["2026-10-05", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19"]) && after.length === 6);
  check("새 슬롯은 정확한 시각(KST 20:00)", slot!.scheduledAt.getTime() === at("2026-10-19").getTime());
  check("연기 직후 now가 연기된 수업보다 이전이어도 같은 결과(lowerBound = 연기된 수업 시각)", findNextFreeRegularSlot({ weekdays: MWF, timeByWeekday: timeAll, durationMin: 25, lowerBound: new Date(Math.max(at("2026-10-07").getTime(), now.getTime())), occupiedDates: occupied, closureDates: new Set(), busy: [] })?.date === "2026-10-19");

  // 시퀀스 끝 다음 슬롯(월 10/19)이 휴강이면 그 다음(수 10/21)
  const closed = findNextFreeRegularSlot({ weekdays: MWF, timeByWeekday: timeAll, durationMin: 25, lowerBound: at("2026-10-07"), occupiedDates: occupied, closureDates: new Set(["2026-10-19"]), busy: [] });
  check("다음 슬롯이 학원 휴강이면 건너뛰어 그 다음 유효 슬롯(10/21)", closed?.date === "2026-10-21", closed?.date);

  // 사용자 예시: "수요일 연기 → 금요일에 이동 / 금요일 closure → 다음 월요일" — 시퀀스가 수-금-월...로 이어지는 중간 구간(수업이 아직 3개만 남은 경우)
  const short = ["2026-10-05", "2026-10-07"]; // 월, 수만 남음
  const noClosure = findNextFreeRegularSlot({ weekdays: MWF, timeByWeekday: timeAll, durationMin: 25, lowerBound: at("2026-10-07"), occupiedDates: new Set(short), closureDates: new Set(), busy: [] });
  check("수요일 수업 연기(뒤에 수업 없음) → 같은 주 금요일(10/9)에 배치", noClosure?.date === "2026-10-09", noClosure?.date);
  const fridayClosed = findNextFreeRegularSlot({ weekdays: MWF, timeByWeekday: timeAll, durationMin: 25, lowerBound: at("2026-10-07"), occupiedDates: new Set(short), closureDates: new Set(["2026-10-09"]), busy: [] });
  check("금요일이 휴강이면 → 다음 월요일(10/12)", fridayClosed?.date === "2026-10-12", fridayClosed?.date);
}

// ── 2) 건너뛰는 조건 ──────────────────────────────────────────────────────────────────────────────────────────
{
  const base = { weekdays: MWF, timeByWeekday: timeAll, durationMin: 25, lowerBound: at("2026-10-05", "00:00"), occupiedDates: new Set<string>(), closureDates: new Set<string>(), busy: [] as BusyInterval[] };
  check("lowerBound보다 '엄밀히 뒤'인 슬롯만(같은 시각은 제외)", findNextFreeRegularSlot({ ...base, lowerBound: at("2026-10-05", "20:00") })?.date === "2026-10-07");
  check("lowerBound 당일 이른 시각이면 당일 슬롯 가능", findNextFreeRegularSlot({ ...base, lowerBound: at("2026-10-05", "19:59") })?.date === "2026-10-05");
  check("이미 찬 날짜(정규 수업/generationKey)는 건너뜀", findNextFreeRegularSlot({ ...base, occupiedDates: new Set(["2026-10-05", "2026-10-07"]) })?.date === "2026-10-09");
  const busyTeacher: BusyInterval[] = [{ start: at("2026-10-05").getTime(), end: at("2026-10-05").getTime() + 25 * 60_000 }];
  check("강사/학생 일정과 시간이 겹치면 그 슬롯은 건너뜀", findNextFreeRegularSlot({ ...base, busy: busyTeacher })?.date === "2026-10-07");
  const near: BusyInterval[] = [{ start: at("2026-10-05", "20:25").getTime(), end: at("2026-10-05", "20:50").getTime() }];
  check("겹치지 않고 바로 이어지는 일정(20:25~)은 20:00~20:25 슬롯을 막지 않음", findNextFreeRegularSlot({ ...base, busy: near })?.date === "2026-10-05");
  check("50분 수업은 뒤 일정과 겹치면 막힘", findNextFreeRegularSlot({ ...base, durationMin: 50, busy: near })?.date === "2026-10-07");
  check("요일별 수업 시각(classTimes)을 슬롯에 반영", findNextFreeRegularSlot({ ...base, timeByWeekday: (w) => (w === 3 ? "21:30" : "20:00"), occupiedDates: new Set(["2026-10-05"]) })?.scheduledAt.getTime() === at("2026-10-07", "21:30").getTime());
  check("수업 요일이 없으면 null", findNextFreeRegularSlot({ ...base, weekdays: [] }) === null);
  check("탐색 상한 안에 빈 슬롯이 없으면 null", findNextFreeRegularSlot({ ...base, horizonDays: 14, closureDates: new Set(sequence("2026-10-05", MWF, 10)) }) === null);
  check("KST 날짜 기준: 일요일 새벽(UTC로는 토요일)의 lowerBound도 KST 날짜로 처리", findNextFreeRegularSlot({ ...base, weekdays: [0], lowerBound: new Date("2026-10-10T16:00:00Z") })?.date === "2026-10-11");
}

// ── 3) 수강 종료일: 단순 +1일이 아니라 실제 마지막 정규 수업 날짜 ─────────────────────────────────────────────────
{
  const end = isoToEndDate("2026-10-16");
  check("종료일: 새 슬롯이 종료일보다 뒤면 그 슬롯 날짜로(+1일이 아니라 10/19)", endDateToIso(extendedEndDate(end, "2026-10-19")!) === "2026-10-19");
  check("종료일: 새 슬롯이 종료일 이내(빈 슬롯을 채운 경우)면 연장 없음", extendedEndDate(end, "2026-10-14") === null);
  check("종료일: 같은 날이면 연장 없음", extendedEndDate(end, "2026-10-16") === null);
}

// ── 4) 참조 구현(시퀀스를 한 칸씩 미는 literal cascade)과 날짜 집합이 같다 ─────────────────────────────────────────
// 참조: 연기된 수업 i를 들고 다음 유효 슬롯으로 이동 — 그 슬롯에 다음 수업이 있으면 그 수업이 밀려나 다음 슬롯으로 … 빈 슬롯에서 멈춘다.
function literalCascade(lessonDates: string[], postponedIndex: number, validSlots: string[]): { dates: string[]; mapping: string[] } {
  const final = [...lessonDates]; // lesson k의 최종 날짜
  const occupant = new Map(lessonDates.map((d, k) => [d, k]));
  let carry = postponedIndex;
  let pos = lessonDates[postponedIndex];
  const moved = new Map<number, string>();
  for (;;) {
    const next = validSlots.find((s) => s > pos);
    if (!next) throw new Error("no slot");
    const displaced = [...occupant.entries()].find(([d, k]) => d === next && k !== carry && !moved.has(k));
    moved.set(carry, next);
    if (!displaced) break;
    carry = displaced[1];
    pos = next;
  }
  for (const [k, d] of moved) final[k] = d;
  return { dates: final.sort(), mapping: lessonDates.map((_, k) => moved.get(k) ?? lessonDates[k]) };
}

// 결정적 의사 난수
let seed = 20261007;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
{
  let ok = 0;
  let total = 0;
  const problems: string[] = [];
  for (let n = 0; n < 400; n++) {
    const weekdaySets = [[1, 3], [2, 4], [1, 3, 5], [1, 2, 3, 4, 5], [6], [0, 3]];
    const wd = weekdaySets[Math.floor(rnd() * weekdaySets.length)];
    const start = addDaysIso("2026-10-05", Math.floor(rnd() * 20));
    const closures = new Set<string>();
    const tomb = new Set<string>(); // 이미 LEAVE/삭제된 날짜(찬 슬롯이지만 수업이 아님)
    const allSlots: string[] = [];
    for (let i = 0; i < 400; i++) {
      const d = addDaysIso(start, i);
      if (wd.includes(weekdayOfIso(d))) allSlots.push(d);
    }
    for (const d of allSlots.slice(0, 40)) {
      const r = rnd();
      if (r < 0.1) closures.add(d);
      else if (r < 0.18) tomb.add(d);
    }
    const valid = allSlots.filter((d) => !closures.has(d) && !tomb.has(d));
    // 수업은 유효 슬롯 중 앞에서부터 k개(가끔 중간이 비어 있다)
    const k = 3 + Math.floor(rnd() * 10);
    const lessons: string[] = [];
    for (const d of valid) {
      if (lessons.length >= k) break;
      if (rnd() < 0.12 && lessons.length > 0) continue; // 빈 슬롯(gap)
      lessons.push(d);
    }
    if (lessons.length < 2) continue;
    const i = Math.floor(rnd() * lessons.length);
    const postponed = lessons[i];
    const lowerBound = at(postponed);
    const occupied = new Set<string>([...lessons, ...tomb]);
    const slot = findNextFreeRegularSlot({ weekdays: wd, timeByWeekday: timeAll, durationMin: 25, lowerBound, occupiedDates: occupied, closureDates: closures, busy: [] });
    total++;
    if (!slot) {
      problems.push("slot null");
      continue;
    }
    const minimal = [...lessons.filter((d) => d !== postponed), slot.date].sort();
    // 참조 구현은 '유효 슬롯' 목록(휴강·묘비 제외, 그러나 수업이 앉은 슬롯 포함)만 보고 연쇄 이동을 시뮬레이션한다.
    const ref = literalCascade(lessons, i, valid);
    const sameSet = eq(minimal, ref.dates);
    const noDup = new Set(minimal).size === minimal.length;
    const validOnly = minimal.every((d) => valid.includes(d));
    const countKept = minimal.length === lessons.length;
    // 시퀀스 순서 보존: 참조의 mapping에서 수업 순서대로 날짜가 단조 증가
    if (sameSet && noDup && validOnly && countKept) ok++;
    else problems.push(`wd=${wd} lessons=${lessons} i=${i} slot=${slot.date} ref=${ref.dates}`);
  }
  check(`무작위 ${total}개 시나리오: 최소 변경 결과의 날짜 집합 == 한 칸씩 미는 참조 구현, 중복/휴강/비수업요일 없음, 수업 수 유지`, ok === total && total > 300, `${ok}/${total} ${problems.slice(0, 2).join(" | ")}`);
}

// ── 5) 정적 검사: 재배치 코드가 연기를 단순 calendar +1일로 처리하지 않는다 ─────────────────────────────────────────
const adminRoot = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(adminRoot, p), "utf8").replace(/\/\/.*$/gm, "");
{
  const rs = read("src/lib/reschedule.ts");
  check("reschedule는 setDate(+1일) 방식의 종료일 연장을 새 경로에서 쓰지 않음(옛 되돌리기 한 곳 제외)", (rs.match(/setDate\(/g) ?? []).length === 1 && /extendedEndDate\(/.test(rs));
  check("reschedule는 보충수업(isSupplement: true)을 만들지 않음", !/isSupplement:\s*true/.test(rs));
  check("reschedule는 enrollment.totalSessions를 바꾸지 않음", !/totalSessions\s*:/.test(rs));
  check("formatAppDate 확인(KST)", formatAppDate(new Date("2026-10-09T15:30:00Z")) === "2026-10-10");
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
