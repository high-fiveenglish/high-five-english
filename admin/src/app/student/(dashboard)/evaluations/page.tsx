import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/studentAuth";
import { formatAppDate } from "@/lib/appTime";

const fmtDate = formatAppDate;

export default async function StudentEvaluationsPage() {
  const student = await requireStudent();

  const sessions = await prisma.classSession.findMany({
    where: { studentId: student.id, evaluation: { isNot: null } },
    include: { evaluation: true, teacher: true, enrollment: true },
    orderBy: { scheduledAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">데일리 평가서</h1>

      <div className="flex flex-col gap-3">
        {sessions.map((s) => (
          <Link
            key={s.evaluation!.id}
            href={`/student/evaluations/${s.evaluation!.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300"
          >
            <p className="text-sm font-bold text-slate-900">{fmtDate(s.scheduledAt)}</p>
            <p className="mt-1 text-xs text-slate-500">
              강사: {s.teacher.realName} · 수업: {s.enrollment.classType} · {s.enrollment.classMethod}
              {s.enrollment.textbookName ? ` · 교재: ${s.enrollment.textbookName}` : ""}
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-700">평가서 보기 →</p>
          </Link>
        ))}
        {sessions.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400">
            작성된 평가서가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
