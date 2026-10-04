import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { formatAppDateTime } from "@/lib/appTime";
import { SESSION_STATUS_LABEL_EN, studentDisplayName } from "@/lib/teacherPortalLabels";
import { EvaluationForm } from "./EvaluationForm";
import { ClassRecordingPanel } from "./ClassRecordingPanel";
import { safeRecordingFailureMessage } from "@/lib/recordingWorkflow";
import { parseStoredUtterances, speakerChoicesFor } from "@/lib/speakerConfirmation";
import { parseRouteId } from "@/lib/routeId";

const fmtDateTime = formatAppDateTime;

export default async function SessionEvaluationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;

  const routeId = parseRouteId(id);
  if (routeId === null) notFound();

  const session = await prisma.classSession.findUnique({
    where: { id: routeId },
    include: {
      student: true,
      evaluation: true,
      enrollment: true,
      // 클라이언트 컴포넌트(ClassRecordingPanel)로 넘어가는 값은 RSC payload로 브라우저에 그대로
      // 전달된다 — 전체 행(transcript 전문, providerTranscriptId, driveFileId, 내부 errorMessage)이
      // 아니라 화면에 필요한 필드만 select한다.
      audioRecording: {
        select: {
          processingStatus: true,
          fileName: true,
          duration: true,
          teacherTalkPercentage: true,
          studentTalkPercentage: true,
          aiDraft: true,
          teacherQcDraft: true,
        },
      },
    },
  });

  if (!session || session.teacherId !== teacher.id) notFound();

  // Only while the analysis waits for the teacher to pick the teacher voice: a neutral list of the voices in the STORED transcript
  // (alphabetical, no score, no recommendation) built on the server. The utterances themselves never reach the browser — only a few
  // short excerpts so the teacher can recognise their own voice.
  let speakerChoices = null;
  if (session.audioRecording?.processingStatus === "NEEDS_SPEAKER_CONFIRMATION") {
    const stored = await prisma.audioRecording.findUnique({ where: { classSessionId: session.id }, select: { transcriptUtterances: true } });
    const utterances = parseStoredUtterances(stored?.transcriptUtterances);
    speakerChoices = utterances ? speakerChoicesFor(utterances) : null;
  }

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
        <div className="flex flex-col gap-6">
          <EvaluationForm
            sessionId={session.id}
            defaultContent={session.evaluation?.content ?? ""}
            defaultTextbook={session.enrollment.textbookName ?? ""}
            defaultProgress={session.progressNote ?? ""}
          />
          <ClassRecordingPanel
            sessionId={session.id}
            recording={
              session.audioRecording
                ? { ...session.audioRecording, errorMessage: safeRecordingFailureMessage(session.audioRecording.processingStatus) }
                : null
            }
            hasExistingEvaluation={!!session.evaluation}
            speakerChoices={speakerChoices}
          />
        </div>
      )}
    </div>
  );
}
