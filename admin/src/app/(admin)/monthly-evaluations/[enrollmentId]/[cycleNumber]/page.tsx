import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseScheduleDaysLabel } from "@/lib/weekdays";
import { sessionsPerCycleFor, computeCompletedCycles } from "@/lib/monthlyEvaluationCycle";
import { formatAppDate } from "@/lib/appTime";
import { DeleteButton } from "../../../DeleteButton";
import { deleteMonthlyEvaluation } from "../../actions";
import { MonthlyEvaluationForm } from "./MonthlyEvaluationForm";

export default async function MonthlyEvaluationDetailPage({
  params,
}: {
  params: Promise<{ enrollmentId: string; cycleNumber: string }>;
}) {
  const { enrollmentId, cycleNumber } = await params;

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: Number(enrollmentId) },
    include: { student: true, teacher: true },
  });
  if (!enrollment) notFound();

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
  if (!cycle) notFound();

  const existing = await prisma.monthlyEvaluation.findUnique({
    where: { enrollmentId_cycleNumber: { enrollmentId: enrollment.id, cycleNumber: cycle.cycleNumber } },
  });

  return (
    <div>
      <Link href="/monthly-evaluations" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 목록으로
      </Link>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-xl font-bold text-slate-900">월평가서 — {cycle.cycleNumber}차</h1>
          <p className="text-sm text-slate-500">
            {enrollment.student.name} 학생 {enrollment.teacher ? `· ${enrollment.teacher.realName} 강사` : ""} ·{" "}
            {formatAppDate(cycle.startSession.scheduledAt)} ~ {formatAppDate(cycle.endSession.scheduledAt)} ·{" "}
            {cycle.sessionsPerCycle}회
          </p>
        </div>
        {existing && <DeleteButton action={deleteMonthlyEvaluation.bind(null, existing.id)} label="이 회차 평가서 삭제" />}
      </div>

      <MonthlyEvaluationForm
        enrollmentId={enrollment.id}
        cycleNumber={cycle.cycleNumber}
        sessionsPerCycle={cycle.sessionsPerCycle}
        defaultContent={existing?.content ?? ""}
      />
    </div>
  );
}
