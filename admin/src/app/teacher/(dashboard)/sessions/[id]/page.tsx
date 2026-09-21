import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { formatAppDateTime } from "@/lib/appTime";
import { SESSION_STATUS_LABEL_EN, studentDisplayName } from "@/lib/teacherPortalLabels";
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
    include: { student: true, evaluation: true, enrollment: true },
  });

  if (!session || session.teacherId !== teacher.id) notFound();

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">Daily Evaluation</h1>
      <p className="mb-6 text-sm text-slate-500">
        {studentDisplayName(session.student.name, session.student.englishName)} ·{" "}
        {fmtDateTime(session.scheduledAt)} · {session.durationMin} min · {session.enrollment.classMethod}
      </p>

      {session.status === "CANCELLED" || session.status === "LEAVE" || session.status === "HOLD" ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          Evaluations cannot be written for a cancelled, on-hold, or paused class. (Current status:{" "}
          {SESSION_STATUS_LABEL_EN[session.status]})
        </p>
      ) : session.scheduledAt.getTime() > Date.now() ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          You can write an evaluation once the class time has arrived.
        </p>
      ) : (
        <EvaluationForm
          sessionId={session.id}
          defaultContent={session.evaluation?.content ?? ""}
          defaultTextbook={session.enrollment.textbookName ?? ""}
          defaultProgress={session.progressNote ?? ""}
        />
      )}
    </div>
  );
}
