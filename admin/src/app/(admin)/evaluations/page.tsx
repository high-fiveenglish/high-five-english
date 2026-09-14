import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { formatAppDate, formatAppTime, parseAppDateTime } from "@/lib/appTime";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function addMonths(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function EvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; month?: string }>;
}) {
  const { date, month } = await searchParams;
  const today = formatAppDate(new Date());
  const selectedDate = date ?? today;
  const viewMonth = month ?? selectedDate.slice(0, 7);

  const monthStart = parseAppDateTime(`${viewMonth}-01T00:00`);
  const monthEnd = parseAppDateTime(`${addMonths(viewMonth, 1)}-01T00:00`);

  const sessions = await prisma.classSession.findMany({
    where: {
      siteId: DEFAULT_SITE_ID,
      // 강사가 평가서를 저장해야만 COMPLETED로 바뀌므로(teacher/sessions/[id]/actions.ts),
      // 여기서 COMPLETED만 필터링하면 아직 평가서를 안 쓴 "오늘 수업"이 통째로 빠져
      // 미작성 건수를 영원히 볼 수 없게 된다. 취소/휴강이 아닌 그날의 모든 수업을 대상으로 한다.
      status: { notIn: ["CANCELLED", "LEAVE"] },
      scheduledAt: { gte: monthStart, lt: monthEnd },
    },
    orderBy: { scheduledAt: "asc" },
    include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT }, evaluation: true },
  });

  // 날짜(YYYY-MM-DD, Asia/Seoul 기준)별로 묶어 달력 칸의 요약 숫자와 선택한 날짜의
  // 상세 리스트를 같은 한 번의 조회 결과에서 뽑아 쓴다.
  const byDate = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = formatAppDate(s.scheduledAt);
    byDate.set(key, [...(byDate.get(key) ?? []), s]);
  }
  const selectedSessions = byDate.get(selectedDate) ?? [];
  const selectedWritten = selectedSessions.filter((s) => s.evaluation).length;

  const [y, m] = viewMonth.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${viewMonth}-${String(i + 1).padStart(2, "0")}`),
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">일일평가서 관리</h1>
        <p className="mt-1 text-sm text-slate-500">날짜를 클릭하면 그날 수업과 평가서 작성 현황을 볼 수 있습니다.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={`/evaluations?month=${addMonths(viewMonth, -1)}&date=${addMonths(viewMonth, -1)}-01`}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
            >
              ← 이전 달
            </Link>
            <p className="text-sm font-bold text-slate-900">{viewMonth}</p>
            <Link
              href={`/evaluations?month=${addMonths(viewMonth, 1)}&date=${addMonths(viewMonth, 1)}-01`}
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
              const daySessions = byDate.get(dateKey) ?? [];
              const total = daySessions.length;
              const unwritten = daySessions.filter((s) => !s.evaluation).length;
              const isSelected = dateKey === selectedDate;
              const isToday = dateKey === today;
              return (
                <Link
                  key={dateKey}
                  href={`/evaluations?month=${viewMonth}&date=${dateKey}`}
                  className={`flex min-h-[52px] flex-col items-start rounded-lg border p-1.5 text-left ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  <span className={`text-[11px] ${isToday && !isSelected ? "font-bold text-blue-600" : ""}`}>
                    {Number(dateKey.slice(8, 10))}
                  </span>
                  {total > 0 && (
                    <span
                      className={`mt-0.5 rounded px-1 text-[9px] font-bold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : unwritten > 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {total}건{unwritten > 0 ? ` · 미작성 ${unwritten}` : ""}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-bold text-slate-900">{selectedDate} 요약</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-slate-50 py-3">
                <p className="text-lg font-bold text-slate-900">{selectedSessions.length}</p>
                <p className="text-[11px] text-slate-500">오늘 수업</p>
              </div>
              <div className="rounded-xl bg-emerald-50 py-3">
                <p className="text-lg font-bold text-emerald-700">{selectedWritten}</p>
                <p className="text-[11px] text-slate-500">작성됨</p>
              </div>
              <div className="rounded-xl bg-amber-50 py-3">
                <p className="text-lg font-bold text-amber-700">{selectedSessions.length - selectedWritten}</p>
                <p className="text-[11px] text-slate-500">미작성</p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3">시간</th>
                  <th className="px-4 py-3">학생</th>
                  <th className="px-4 py-3">강사</th>
                  <th className="px-4 py-3">평가서</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {selectedSessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-900">{formatAppTime(s.scheduledAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{s.student.name}</td>
                    <td className="px-4 py-3 text-slate-600">{s.teacher.realName}</td>
                    <td className="px-4 py-3">
                      {s.evaluation ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                          작성됨
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                          미작성
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/evaluations/${s.id}`} className="text-xs font-semibold text-blue-700 underline">
                        {s.evaluation ? "보기/수정" : "작성"}
                      </Link>
                    </td>
                  </tr>
                ))}
                {selectedSessions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                      이 날짜에 수업이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
