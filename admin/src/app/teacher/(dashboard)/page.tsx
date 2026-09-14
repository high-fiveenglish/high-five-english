import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { appDayStart, appDayEnd } from "@/lib/appTime";
import { parseScheduleDaysLabel } from "@/lib/weekdays";
import { sessionsPerCycleFor, computeCompletedCycles } from "@/lib/monthlyEvaluationCycle";

export default async function TeacherHomePage() {
  const teacher = await requireTeacher();

  // "오늘"은 서버 프로세스의 로컬 시간이 아니라 Asia/Seoul 기준으로 계산한다.
  const todayStart = appDayStart();
  const todayEnd = appDayEnd();

  const [todaySessions, unwrittenCount, enrollments] = await Promise.all([
    prisma.classSession.count({
      where: { teacherId: teacher.id, scheduledAt: { gte: todayStart, lt: todayEnd } },
    }),
    // 평가서 작성 가능 여부가 더 이상 관리자가 수동으로 매긴 COMPLETED 상태에만
    // 의존하지 않으므로(수업 시각이 지나면 강사가 직접 작성 가능), 여기서도 상태
    // 대신 실제 수업 시각 기준으로 "이미 지난 수업인데 평가서가 없는 건수"를 센다.
    prisma.classSession.count({
      where: {
        teacherId: teacher.id,
        status: { in: ["SCHEDULED", "COMPLETED"] },
        scheduledAt: { lte: new Date() },
        evaluation: null,
      },
    }),
    prisma.enrollment.findMany({ where: { teacherId: teacher.id }, select: { id: true, scheduleDays: true } }),
  ]);

  // 일일평가서 카드와 같은 자리에 나란히 보여줄 "미작성 월평가서" 건수 — 회차 계산은
  // /teacher/monthly-evaluations와 동일한 로직(monthlyEvaluationCycle.ts)을 쓴다.
  const enrollmentIds = enrollments.map((e) => e.id);
  const [monthlySessions, monthlyEvaluations] = await Promise.all([
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
  const monthlySessionsByEnrollment = new Map<number, { id: number; scheduledAt: Date }[]>();
  for (const s of monthlySessions) {
    monthlySessionsByEnrollment.set(s.enrollmentId, [...(monthlySessionsByEnrollment.get(s.enrollmentId) ?? []), s]);
  }
  const writtenByEnrollment = new Map<number, Set<number>>();
  for (const ev of monthlyEvaluations) {
    const set = writtenByEnrollment.get(ev.enrollmentId) ?? new Set<number>();
    set.add(ev.cycleNumber);
    writtenByEnrollment.set(ev.enrollmentId, set);
  }
  let unwrittenMonthlyCount = 0;
  for (const e of enrollments) {
    const sessionsPerCycle = sessionsPerCycleFor(parseScheduleDaysLabel(e.scheduleDays).length);
    if (!sessionsPerCycle) continue;
    const cycles = computeCompletedCycles(monthlySessionsByEnrollment.get(e.id) ?? [], sessionsPerCycle);
    const written = writtenByEnrollment.get(e.id) ?? new Set<number>();
    unwrittenMonthlyCount += cycles.filter((c) => !written.has(c.cycleNumber)).length;
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">Hi, {teacher.realName}</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Today&apos;s Classes</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{todaySessions}</p>
        </div>
        <Link
          href="/teacher/schedule"
          className="rounded-2xl border border-orange-200 bg-orange-50 p-5 transition hover:border-orange-300"
        >
          <p className="text-xs font-medium text-orange-700">Unwritten Evaluations</p>
          <p className="mt-2 text-2xl font-bold text-orange-700">{unwrittenCount}</p>
        </Link>
        <Link
          href="/teacher/monthly-evaluations"
          className="rounded-2xl border border-orange-200 bg-orange-50 p-5 transition hover:border-orange-300"
        >
          <p className="text-xs font-medium text-orange-700">Unwritten Monthly Evaluations</p>
          <p className="mt-2 text-2xl font-bold text-orange-700">{unwrittenMonthlyCount}</p>
        </Link>
      </div>
    </div>
  );
}
