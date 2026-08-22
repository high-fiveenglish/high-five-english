import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EvaluationAdminForm } from "./EvaluationAdminForm";

function fmtDateTime(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function EvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await prisma.classSession.findUnique({
    where: { id: Number(id) },
    include: { student: true, teacher: true, evaluation: true },
  });

  if (!session) notFound();

  return (
    <div>
      <Link href="/evaluations" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 목록으로
      </Link>
      <h1 className="mb-1 text-xl font-bold text-slate-900">일일평가서</h1>
      <p className="mb-6 text-sm text-slate-500">
        {session.student.name} 학생 · {session.teacher.realName} 강사 · {fmtDateTime(session.scheduledAt)} ·{" "}
        {session.durationMin}분 수업
      </p>

      {session.status !== "COMPLETED" ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          수업이 완료 처리되지 않아 평가서를 작성할 수 없습니다. (현재 상태: {session.status})
        </p>
      ) : (
        <EvaluationAdminForm sessionId={session.id} defaultContent={session.evaluation?.content ?? ""} />
      )}
    </div>
  );
}
