import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { parseScheduleDaysLabel } from "@/lib/weekdays";
import { sessionsPerCycleFor, computeCompletedCycles, type CycleInfo } from "@/lib/monthlyEvaluationCycle";
import { formatAppDate } from "@/lib/appTime";
import { studentDisplayName } from "@/lib/teacherPortalLabels";

export default async function TeacherMonthlyEvaluationsPage() {
  const teacher = await requireTeacher();

  const enrollments = await prisma.enrollment.findMany({
    where: { teacherId: teacher.id },
    orderBy: { id: "desc" },
    include: { student: true },
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
      select: { enrollmentId: true, cycleNumber: true },
    }),
  ]);

  const sessionsByEnrollment = new Map<number, { id: number; scheduledAt: Date }[]>();
  for (const s of sessions) {
    sessionsByEnrollment.set(s.enrollmentId, [...(sessionsByEnrollment.get(s.enrollmentId) ?? []), s]);
  }
  const writtenByEnrollment = new Map<number, Set<number>>();
  for (const ev of evaluations) {
    const set = writtenByEnrollment.get(ev.enrollmentId) ?? new Set<number>();
    set.add(ev.cycleNumber);
    writtenByEnrollment.set(ev.enrollmentId, set);
  }

  const rows = enrollments
    .map((e) => {
      const weekdayCount = parseScheduleDaysLabel(e.scheduleDays).length;
      const sessionsPerCycle = sessionsPerCycleFor(weekdayCount);
      if (!sessionsPerCycle) return null;
      const completed = sessionsByEnrollment.get(e.id) ?? [];
      const cycles = computeCompletedCycles(completed, sessionsPerCycle);
      const written = writtenByEnrollment.get(e.id) ?? new Set<number>();
      return { enrollment: e, cycles: cycles.map((c) => ({ ...c, written: written.has(c.cycleNumber) })) };
    })
    .filter((r): r is { enrollment: (typeof enrollments)[number]; cycles: (CycleInfo & { written: boolean })[] } => r !== null && r.cycles.length > 0);

  const unwrittenTotal = rows.reduce((sum, r) => sum + r.cycles.filter((c) => !c.written).length, 0);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">Monthly Evaluations</h1>
      <p className="mb-6 text-sm text-slate-500">
        A new cycle opens up every 8/12/16/20 completed classes, depending on the student&apos;s weekly frequency.
        {unwrittenTotal > 0 && <span className="ml-1 font-semibold text-orange-600">{unwrittenTotal} unwritten</span>}
      </p>

      <div className="flex flex-col gap-5">
        {rows.map(({ enrollment, cycles }) => (
          <div key={enrollment.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-bold text-slate-900">
              {studentDisplayName(enrollment.student.name, enrollment.student.englishName)}
            </p>
            <p className="mb-3 text-xs text-slate-400">
              {enrollment.packageMonths}mo package · {enrollment.scheduleDays} · {enrollment.classDurationMin}min
            </p>
            <div className="flex flex-col gap-2">
              {cycles.map((c) => (
                <div
                  key={c.cycleNumber}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">
                    Cycle {c.cycleNumber}{" "}
                    <span className="text-slate-400">
                      ({formatAppDate(c.startSession.scheduledAt)} ~ {formatAppDate(c.endSession.scheduledAt)}, {c.sessionsPerCycle} classes)
                    </span>
                  </span>
                  <Link
                    href={`/teacher/monthly-evaluations/${enrollment.id}/${c.cycleNumber}`}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      c.written ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {c.written ? "View / Edit" : "Write"}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
            No monthly evaluation cycles yet.
          </p>
        )}
      </div>
    </div>
  );
}
