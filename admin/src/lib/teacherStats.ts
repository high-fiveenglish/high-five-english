// "강사수업통계" — 대시보드에서 기간을 고르면 그 기간에 실제로 진행된 모든 수업(정규
// 수업 + 레벨테스트)을 한 줄씩 모아 강사 급여까지 계산해주는 리포트. 매달 손으로
// LMS 원본 다운로드를 받아 만들던 "하이파이브 강사 급여" 엑셀(RawData/Summary 시트
// 구조)과 같은 형태로 만들어, 그 수작업을 이 화면 하나로 대체하는 것이 목적이다.
import { prisma } from "./prisma";
import { DEFAULT_SITE_ID } from "./constants";

export type AttendanceLabel = "출석" | "결석" | "유급휴가";

export interface TeacherStatRow {
  teacherName: string;
  studentLabel: string;
  dateLabel: string;
  attendance: AttendanceLabel;
  durationMin: number;
  agentName: string;
  sessionUnits: number;
  ratePerUnit: number;
  payPHP: number;
}

export interface TeacherStatSummaryRow {
  teacherName: string;
  ratePerUnit: number;
  presentUnits: number;
  absentUnits: number;
  paidLeaveCount: number;
  totalPayPHP: number;
}

export interface TeacherStatResult {
  rows: TeacherStatRow[];
  summary: TeacherStatSummaryRow[];
}

const UNIT_MINUTES = 25;
// 레벨테스트는 정규 수업(ClassSession)이 아니라 별도 모델이라 실제 수업 시간이 없다 —
// 급여 정산 기준 시간(분)을 여기서 고정값으로 둔다.
const LEVEL_TEST_DURATION_MIN = 10;
// 결석은 정상 수업료의 절반만 지급 — 사용자 지정 정책.
const ABSENT_RATE_MULTIPLIER = 0.5;
// 유급휴가는 수업 시간에 비례하지 않고, 레이트(25분 기준 1회분) × 8을 하루치로 지급 —
// 사용자 지정 정책("기본급*8").
const PAID_LEAVE_UNITS = 8;

function toDateLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** teacherId -> 현재 레이트(TeacherRate.ratePerUnit, ₱/25분). 강사 관리 화면
 * (teachers/page.tsx)이 "가장 최근 effectiveFrom 1건"을 그 강사의 레이트로 보여주는
 *것과 정확히 같은 기준으로 고른다 — 세션 날짜 기준으로 과거 레이트를 역산하지 않는다
 * (두 화면의 레이트가 서로 다르게 보이던 문제의 원인이라, 강사 관리 화면 쪽 기준에
 * 맞춰 통일했다). 레이트 이력이 없는 강사는 0으로 처리한다. */
async function loadRatesByTeacher(teacherIds: number[]): Promise<Map<number, number>> {
  if (teacherIds.length === 0) return new Map();
  const rates = await prisma.teacherRate.findMany({
    where: { teacherId: { in: teacherIds } },
    orderBy: { effectiveFrom: "desc" },
  });
  const map = new Map<number, number>();
  for (const r of rates) {
    if (!map.has(r.teacherId)) map.set(r.teacherId, Number(r.ratePerUnit));
  }
  return map;
}

export async function buildTeacherStats(from: Date, to: Date): Promise<TeacherStatResult> {
  const [sessions, levelTests] = await Promise.all([
    prisma.classSession.findMany({
      where: {
        siteId: DEFAULT_SITE_ID,
        deletedAt: null,
        scheduledAt: { gte: from, lt: to },
        status: { in: ["COMPLETED", "MAKEUP_NEEDED", "LEAVE"] },
      },
      include: {
        teacher: { select: { id: true, realName: true } },
        student: { select: { englishName: true, name: true, agent: { select: { name: true } } } },
        enrollment: { select: { studentEnglishName: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.levelTest.findMany({
      where: {
        siteId: DEFAULT_SITE_ID,
        teacherId: { not: null },
        scheduledClassDatetime: { gte: from, lt: to },
        progressStatus: { in: ["수업완료", "결석"] },
      },
      include: {
        teacher: { select: { id: true, realName: true } },
        student: { select: { englishName: true, name: true, agent: { select: { name: true } } } },
      },
      orderBy: { scheduledClassDatetime: "asc" },
    }),
  ]);

  const teacherIds = Array.from(
    new Set([...sessions.map((s) => s.teacherId), ...levelTests.map((t) => t.teacherId!).filter(Boolean)]),
  );
  const ratesByTeacher = await loadRatesByTeacher(teacherIds);

  const rows: TeacherStatRow[] = [];

  for (const s of sessions) {
    const attendance: AttendanceLabel = s.status === "COMPLETED" ? "출석" : s.status === "MAKEUP_NEEDED" ? "결석" : "유급휴가";
    const ratePerUnit = ratesByTeacher.get(s.teacherId) ?? 0;
    const sessionUnits = s.durationMin / UNIT_MINUTES;
    const payPHP =
      attendance === "출석"
        ? Math.round(ratePerUnit * sessionUnits)
        : attendance === "결석"
          ? Math.round(ratePerUnit * sessionUnits * ABSENT_RATE_MULTIPLIER)
          : Math.round(ratePerUnit * PAID_LEAVE_UNITS);

    rows.push({
      teacherName: s.teacher.realName,
      studentLabel: s.enrollment?.studentEnglishName || s.student.englishName || s.student.name,
      dateLabel: toDateLabel(s.scheduledAt),
      attendance,
      durationMin: s.durationMin,
      agentName: s.student.agent?.name ?? "-",
      sessionUnits,
      ratePerUnit,
      payPHP,
    });
  }

  for (const lt of levelTests) {
    if (!lt.teacherId || !lt.scheduledClassDatetime) continue;
    const attendance: AttendanceLabel = lt.progressStatus === "수업완료" ? "출석" : "결석";
    const ratePerUnit = ratesByTeacher.get(lt.teacherId) ?? 0;
    const sessionUnits = LEVEL_TEST_DURATION_MIN / UNIT_MINUTES;
    const payPHP = Math.round(ratePerUnit * sessionUnits * (attendance === "출석" ? 1 : ABSENT_RATE_MULTIPLIER));

    rows.push({
      teacherName: lt.teacher?.realName ?? "-",
      studentLabel: lt.student?.englishName || lt.student?.name || "-",
      dateLabel: toDateLabel(lt.scheduledClassDatetime),
      attendance,
      durationMin: LEVEL_TEST_DURATION_MIN,
      agentName: lt.student?.agent?.name ?? "-",
      sessionUnits,
      ratePerUnit,
      payPHP,
    });
  }

  rows.sort((a, b) => a.dateLabel.localeCompare(b.dateLabel) || a.teacherName.localeCompare(b.teacherName));

  const summaryMap = new Map<string, TeacherStatSummaryRow>();
  for (const r of rows) {
    const existing = summaryMap.get(r.teacherName) ?? {
      teacherName: r.teacherName,
      ratePerUnit: r.ratePerUnit,
      presentUnits: 0,
      absentUnits: 0,
      paidLeaveCount: 0,
      totalPayPHP: 0,
    };
    if (r.attendance === "출석") existing.presentUnits += r.sessionUnits;
    else if (r.attendance === "결석") existing.absentUnits += r.sessionUnits;
    else existing.paidLeaveCount += 1;
    existing.totalPayPHP += r.payPHP;
    summaryMap.set(r.teacherName, existing);
  }
  const summary = Array.from(summaryMap.values()).sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  return { rows, summary };
}
