import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { parseScheduleDaysLabel } from "@/lib/weekdays";
import { sessionsPerCycleFor, computeCompletedCycles } from "@/lib/monthlyEvaluationCycle";
import { formatAppDate } from "@/lib/appTime";
import { studentDisplayName } from "@/lib/teacherPortalLabels";
import { MonthlyEvaluationForm } from "./MonthlyEvaluationForm";

export default async function TeacherMonthlyEvaluationPage({
  params,
}: {
  params: Promise<{ enrollmentId: string; cycleNumber: string }>;
}) {
  const teacher = await requireTeacher();
  const { enrollmentId, cycleNumber } = await params;

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: Number(enrollmentId) },
    include: { student: true },
  });
  if (!enrollment || enrollment.teacherId !== teacher.id) notFound();

  const weekdayCount = parseScheduleDaysLabel(enrollment.scheduleDays).length;
  const sessionsPerCycle = sessionsPerCycleFor(weekdayCount);
  if (!sessionsPerCycle) notFound();

  const completed = await prisma.classSession.findMany({
    where: { enrollmentId: enrollment.id, status: "COMPLETED" },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, scheduledAt: true },
  });
  const cycles = computeCompletedCycles(completed, sessionsPerCycle);
  const cycle = cycles.find((c) => c.cycleNumber === Number(cycleNumber));
  // 아직 이 회차만큼 수업이 끝나지 않았거나(진행 중), 존재하지 않는 회차 번호.
  if (!cycle) notFound();

  const existing = await prisma.monthlyEvaluation.findUnique({
    where: { enrollmentId_cycleNumber: { enrollmentId: enrollment.id, cycleNumber: cycle.cycleNumber } },
  });

  return (
    <div>
      <Link href="/teacher/monthly-evaluations" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← Back to Monthly Evaluations
      </Link>
      <h1 className="mb-1 text-xl font-bold text-slate-900">Monthly Evaluation — Cycle {cycle.cycleNumber}</h1>
      <p className="mb-6 text-sm text-slate-500">
        {studentDisplayName(enrollment.student.name, enrollment.student.englishName)} ·{" "}
        {formatAppDate(cycle.startSession.scheduledAt)} ~ {formatAppDate(cycle.endSession.scheduledAt)} ·{" "}
        {cycle.sessionsPerCycle} classes
      </p>

      <MonthlyEvaluationForm
        enrollmentId={enrollment.id}
        cycleNumber={cycle.cycleNumber}
        sessionsPerCycle={cycle.sessionsPerCycle}
        defaultContent={existing?.content ?? ""}
      />
    </div>
  );
}
