import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { DeleteButton } from "../DeleteButton";
import { deleteClassSession } from "./actions";
import { SessionStatusSelect } from "./SessionStatusSelect";
import { formatAppDate, formatAppTime, parseAppDateTime } from "@/lib/appTime";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function addMonths(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 주어진 날짜가 속한 주의 월요일(ISO 날짜 문자열)을 구한다. */
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=일 .. 6=토
  const diff = day === 0 ? -6 : 1 - day;
  return addDaysIso(dateStr, diff);
}

type ViewKey = "day" | "week";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; month?: string; week?: string }>;
}) {
  const { view: viewParam, date, month, week } = await searchParams;
  const view: ViewKey = viewParam === "week" ? "week" : "day";
  const today = formatAppDate(new Date());

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">전체 일정표</h1>
        <Link
          href="/schedule/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 수업 등록
        </Link>
      </div>

      <div className="mb-4 flex gap-2 text-sm">
        <Link
          href={`/schedule?view=day&date=${date ?? today}`}
          className={`rounded-lg px-3 py-1.5 font-medium ${
            view === "day" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          일별 보기
        </Link>
        <Link
          href={`/schedule?view=week&week=${week ?? mondayOf(today)}`}
          className={`rounded-lg px-3 py-1.5 font-medium ${
            view === "week" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          주별 보기(강사별)
        </Link>
      </div>

      {view === "day" ? <DayView date={date ?? today} month={month} today={today} /> : <WeekView week={week ?? mondayOf(today)} />}
    </div>
  );
}

async function DayView({ date, month, today }: { date: string; month?: string; today: string }) {
  const viewMonth = month ?? date.slice(0, 7);
  const monthStart = parseAppDateTime(`${viewMonth}-01T00:00`);
  const monthEnd = parseAppDateTime(`${addMonths(viewMonth, 1)}-01T00:00`);

  const sessions = await prisma.classSession.findMany({
    where: { siteId: DEFAULT_SITE_ID, scheduledAt: { gte: monthStart, lt: monthEnd }, deletedAt: null },
    orderBy: { scheduledAt: "asc" },
    include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
  });

  const byDate = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = formatAppDate(s.scheduledAt);
    byDate.set(key, [...(byDate.get(key) ?? []), s]);
  }
  const selectedSessions = byDate.get(date) ?? [];

  const [y, m] = viewMonth.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${viewMonth}-${String(i + 1).padStart(2, "0")}`),
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={`/schedule?view=day&month=${addMonths(viewMonth, -1)}&date=${addMonths(viewMonth, -1)}-01`}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            ← 이전 달
          </Link>
          <p className="text-sm font-bold text-slate-900">{viewMonth}</p>
          <Link
            href={`/schedule?view=day&month=${addMonths(viewMonth, 1)}&date=${addMonths(viewMonth, 1)}-01`}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            다음 달 →
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 font-semibold text-slate-400">
              {w}
            </div>
          ))}
          {cells.map((dateKey, i) => {
            if (!dateKey) return <div key={i} />;
            const count = byDate.get(dateKey)?.length ?? 0;
            const isSelected = dateKey === date;
            const isToday = dateKey === today;
            return (
              <Link
                key={dateKey}
                href={`/schedule?view=day&month=${viewMonth}&date=${dateKey}`}
                className={`flex min-h-[52px] flex-col items-start rounded-lg border p-1.5 text-left ${
                  isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-100 hover:bg-slate-50"
                }`}
              >
                <span className={`text-[11px] ${isToday && !isSelected ? "font-bold text-blue-600" : ""}`}>
                  {Number(dateKey.slice(8, 10))}
                </span>
                {count > 0 && (
                  <span
                    className={`mt-0.5 rounded px-1 text-[9px] font-bold ${
                      isSelected ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {count}건
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">{date} 수업 ({selectedSessions.length}건)</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">시간</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">시간(분)</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {[...selectedSessions]
              .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
              .map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-900">{formatAppTime(s.scheduledAt)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.student.name}
                    {s.isSupplement && (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        보충수업
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.teacher.realName}</td>
                  <td className="px-4 py-3 text-slate-600">{s.durationMin}</td>
                  <td className="px-4 py-3">
                    <SessionStatusSelect id={s.id} status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteButton action={deleteClassSession.bind(null, s.id)} />
                  </td>
                </tr>
              ))}
            {selectedSessions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  이 날짜에 등록된 수업이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function WeekView({ week }: { week: string }) {
  const weekStart = mondayOf(week);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  const rangeStart = parseAppDateTime(`${weekStart}T00:00`);
  const rangeEnd = parseAppDateTime(`${addDaysIso(weekStart, 7)}T00:00`);

  const sessions = await prisma.classSession.findMany({
    where: { siteId: DEFAULT_SITE_ID, scheduledAt: { gte: rangeStart, lt: rangeEnd }, deletedAt: null },
    orderBy: { scheduledAt: "asc" },
    include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
  });

  const byTeacher = new Map<number, { teacherName: string; byDate: Map<string, typeof sessions> }>();
  for (const s of sessions) {
    const entry = byTeacher.get(s.teacherId) ?? { teacherName: s.teacher.realName, byDate: new Map() };
    const dateKey = formatAppDate(s.scheduledAt);
    entry.byDate.set(dateKey, [...(entry.byDate.get(dateKey) ?? []), s]);
    byTeacher.set(s.teacherId, entry);
  }
  const teacherRows = [...byTeacher.entries()].sort((a, b) => a[1].teacherName.localeCompare(b[1].teacherName));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/schedule?view=week&week=${addDaysIso(weekStart, -7)}`}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← 이전 주
        </Link>
        <p className="text-sm font-bold text-slate-900">
          {weekStart} ~ {weekDates[6]}
        </p>
        <Link
          href={`/schedule?view=week&week=${addDaysIso(weekStart, 7)}`}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
        >
          다음 주 →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-28 border border-slate-100 bg-slate-50 px-2 py-2 text-left font-semibold text-slate-500">
                강사
              </th>
              {weekDates.map((d) => (
                <th key={d} className="border border-slate-100 bg-slate-50 px-2 py-2 text-center font-semibold text-slate-500">
                  {WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]}
                  <span className="ml-1 font-mono text-[10px] text-slate-400">{d.slice(5)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teacherRows.map(([teacherId, { teacherName, byDate }]) => (
              <tr key={teacherId}>
                <td className="border border-slate-100 px-2 py-2 align-top font-bold text-slate-900">{teacherName}</td>
                {weekDates.map((d) => (
                  <td key={d} className="border border-slate-100 px-2 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      {(byDate.get(d) ?? []).map((s) => (
                        <Link
                          key={s.id}
                          href={`/schedule?view=day&date=${d}`}
                          className="block rounded bg-blue-50 px-1.5 py-1 text-[11px] leading-tight text-blue-800 hover:bg-blue-100"
                        >
                          {formatAppTime(s.scheduledAt)} {s.student.name}
                          {s.isSupplement && <span className="ml-1 text-amber-600">(보충)</span>}
                        </Link>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            {teacherRows.length === 0 && (
              <tr>
                <td colSpan={8} className="border border-slate-100 px-4 py-10 text-center text-slate-400">
                  이번 주에 등록된 수업이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
