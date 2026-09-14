import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/studentAuth";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";

export default async function StudentMonthlyEvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const student = await requireStudent();
  const { id } = await params;

  // studentId를 where절에 직접 걸어 소유권을 검사한다.
  const evaluation = await prisma.monthlyEvaluation.findFirst({
    where: { id: Number(id), studentId: student.id },
    include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
  });

  if (!evaluation) notFound();

  return (
    <div>
      <Link href="/student/monthly-evaluations" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 월별 평가 목록으로
      </Link>
      <h1 className="mb-6 text-xl font-bold text-slate-900">월별 평가 — {evaluation.cycleNumber}차</h1>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-medium text-slate-500">담당 강사</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{evaluation.teacher?.realName ?? "-"}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-2 text-sm font-bold text-slate-900">평가 내용</p>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{evaluation.content}</p>
      </div>
    </div>
  );
}
