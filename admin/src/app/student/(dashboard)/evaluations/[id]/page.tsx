import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/studentAuth";
import { formatAppDate, formatAppTime } from "@/lib/appTime";

const fmtDate = formatAppDate;
const fmtTime = formatAppTime;

export default async function StudentEvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const student = await requireStudent();
  const { id } = await params;

  // classSession.studentId를 where절에 직접 걸어 소유권을 검사한다 — 다른 학생의
  // evaluation id를 넣으면 결과가 아예 없어(null) notFound()로 이어진다.
  const evaluation = await prisma.lessonEvaluation.findFirst({
    where: { id: Number(id), classSession: { studentId: student.id } },
    include: { classSession: { include: { teacher: true, enrollment: true } } },
  });

  if (!evaluation) notFound();

  const session = evaluation.classSession;

  return (
    <div>
      <Link href="/student/evaluations" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 데일리 평가서 목록으로
      </Link>
      <h1 className="mb-6 text-xl font-bold text-slate-900">데일리 평가서 — {fmtDate(session.scheduledAt)}</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <InfoItem label="수업 날짜" value={fmtDate(session.scheduledAt)} />
        <InfoItem label="수업 시간" value={`${fmtTime(session.scheduledAt)} (${session.durationMin}분)`} />
        <InfoItem label="강사" value={session.teacher.realName} />
        <InfoItem label="수업 정보" value={`${session.enrollment.classType} · ${session.enrollment.classMethod}`} />
        <InfoItem label="교재" value={session.enrollment.textbookName ?? "-"} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-2 text-sm font-bold text-slate-900">평가 내용</p>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{evaluation.content}</p>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
