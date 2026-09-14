import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { EvaluationAdminForm } from "./EvaluationAdminForm";
import { formatAppDateTime } from "@/lib/appTime";

const fmtDateTime = formatAppDateTime;

export default async function EvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await prisma.classSession.findUnique({
    where: { id: Number(id) },
    include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT }, evaluation: true },
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

      {session.status === "CANCELLED" || session.status === "LEAVE" ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          취소되었거나 휴강 처리된 수업은 평가서를 작성할 수 없습니다. (현재 상태: {session.status})
        </p>
      ) : session.scheduledAt.getTime() > Date.now() ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          수업 시작 시각이 지나야 평가서를 작성할 수 있습니다.
        </p>
      ) : (
        <EvaluationAdminForm sessionId={session.id} defaultContent={session.evaluation?.content ?? ""} />
      )}
    </div>
  );
}
