import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { formatAppDateTime } from "@/lib/appTime";
import { EvaluationForm } from "./EvaluationForm";

const fmtDateTime = formatAppDateTime;

export default async function SessionEvaluationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;

  const session = await prisma.classSession.findUnique({
    where: { id: Number(id) },
    include: { student: true, evaluation: true },
  });

  if (!session || session.teacherId !== teacher.id) notFound();

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">일일평가서 작성</h1>
      <p className="mb-6 text-sm text-slate-500">
        {session.student.name} 학생 · {fmtDateTime(session.scheduledAt)} · {session.durationMin}분 수업
      </p>

      {session.status !== "COMPLETED" ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          수업이 완료 처리된 후에 평가서를 작성할 수 있습니다. (현재 상태: {session.status})
        </p>
      ) : (
        <EvaluationForm sessionId={session.id} defaultContent={session.evaluation?.content ?? ""} />
      )}
    </div>
  );
}
