import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/studentAuth";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { formatAppDate } from "@/lib/appTime";

export default async function StudentMonthlyEvaluationsPage() {
  const student = await requireStudent();

  const evaluations = await prisma.monthlyEvaluation.findMany({
    where: { studentId: student.id },
    include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
    orderBy: [{ enrollmentId: "desc" }, { cycleNumber: "desc" }],
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">월별 평가</h1>

      <div className="flex flex-col gap-3">
        {evaluations.map((e) => (
          <Link
            key={e.id}
            href={`/student/monthly-evaluations/${e.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300"
          >
            <p className="text-sm font-bold text-slate-900">{e.cycleNumber}차 평가</p>
            <p className="mt-1 text-xs text-slate-500">
              강사: {e.teacher?.realName ?? "-"} · 작성일: {formatAppDate(e.updatedAt)}
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-700">평가서 보기 →</p>
          </Link>
        ))}
        {evaluations.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400">
            작성된 월별 평가가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
