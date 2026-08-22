import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MonthlyEvaluationEditForm } from "./MonthlyEvaluationEditForm";

export default async function MonthlyEvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const evaluation = await prisma.monthlyEvaluation.findUnique({
    where: { id: Number(id) },
    include: { student: true, teacher: true },
  });

  if (!evaluation) notFound();

  return (
    <div>
      <Link href="/monthly-evaluations" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 목록으로
      </Link>
      <h1 className="mb-1 text-xl font-bold text-slate-900">월평가서</h1>
      <p className="mb-6 text-sm text-slate-500">
        {evaluation.yearMonth} · {evaluation.student.name} 학생
        {evaluation.teacher ? ` · ${evaluation.teacher.realName} 강사` : ""}
      </p>

      <MonthlyEvaluationEditForm id={evaluation.id} defaultContent={evaluation.content} />
    </div>
  );
}
