import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { parseScheduleDaysLabel } from "@/lib/weekdays";
import { sessionsPerCycleFor, computeCompletedCycles, type CycleInfo } from "@/lib/monthlyEvaluationCycle";
import { formatAppDate } from "@/lib/appTime";

export default async function MonthlyEvaluationsPage() {
  const enrollments = await prisma.enrollment.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { id: "desc" },
    include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
  });
  const enrollmentIds = enrollments.map((e) => e.id);

  const [sessions, evaluations] = await Promise.all([
    prisma.classSession.findMany({
      where: { enrollmentId: { in: enrollmentIds }, status: "COMPLETED" },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, scheduledAt: true, enrollmentId: true },
    }),
    prisma.monthlyEvaluation.findMany({
      where: { enrollmentId: { in: enrollmentIds } },
      select: { enrollmentId: true, cycleNumber: true, updatedAt: true },
    }),
  ]);

  const sessionsByEnrollment = new Map<number, { id: number; scheduledAt: Date }[]>();
  for (const s of sessions) {
    sessionsByEnrollment.set(s.enrollmentId, [...(sessionsByEnrollment.get(s.enrollmentId) ?? []), s]);
  }
  const writtenByEnrollment = new Map<number, Map<number, Date>>();
  for (const ev of evaluations) {
    const map = writtenByEnrollment.get(ev.enrollmentId) ?? new Map<number, Date>();
    map.set(ev.cycleNumber, ev.updatedAt);
    writtenByEnrollment.set(ev.enrollmentId, map);
  }

  const rows = enrollments
    .map((e) => {
      const weekdayCount = parseScheduleDaysLabel(e.scheduleDays).length;
      const sessionsPerCycle = sessionsPerCycleFor(weekdayCount);
      if (!sessionsPerCycle) return null;
      const completed = sessionsByEnrollment.get(e.id) ?? [];
      const cycles = computeCompletedCycles(completed, sessionsPerCycle);
      if (cycles.length === 0) return null;
      const written = writtenByEnrollment.get(e.id) ?? new Map<number, Date>();
      return {
        enrollment: e,
        cycles: cycles.map((c) => ({ ...c, updatedAt: written.get(c.cycleNumber) ?? null })),
      };
    })
    .filter((r): r is { enrollment: (typeof enrollments)[number]; cycles: (CycleInfo & { updatedAt: Date | null })[] } => r !== null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">월평가서 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          달력 월이 아니라 완료된 수업 수 기준 회차제입니다 (주2회=8회·주3회=12회·주4회=16회·주5회=20회). 담당 강사가
          강사페이지에서 작성하며, 여기서 관리자도 대신 작성·수정할 수 있습니다.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">회차</th>
              <th className="px-4 py-3">기간</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.flatMap(({ enrollment, cycles }) =>
              cycles.map((c) => (
                <tr key={`${enrollment.id}-${c.cycleNumber}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{enrollment.student.name}</td>
                  <td className="px-4 py-3 text-slate-600">{enrollment.teacher?.realName ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.cycleNumber}차 ({c.sessionsPerCycle}회)</td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatAppDate(c.startSession.scheduledAt)} ~ {formatAppDate(c.endSession.scheduledAt)}
                  </td>
                  <td className="px-4 py-3">
                    {c.updatedAt ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">작성됨</span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-500">미작성</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/monthly-evaluations/${enrollment.id}/${c.cycleNumber}`}
                      className="text-xs font-semibold text-blue-700 underline"
                    >
                      {c.updatedAt ? "보기/수정" : "작성"}
                    </Link>
                  </td>
                </tr>
              )),
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  아직 완료된 회차가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
