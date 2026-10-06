"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmTeacherSpeakerAction, publishAIDraft } from "./recordingActions";
import { RecordingUploader } from "./RecordingUploader";
import type { SpeakerChoice } from "@/lib/speakerConfirmation";

export type RecordingSummary = {
  processingStatus: string;
  fileName: string;
  duration: number | null;
  teacherTalkPercentage: number | null;
  studentTalkPercentage: number | null;
  aiDraft: string | null;
  /** Output 2 — 강사 QC 전용, 항상 영어. 이 화면(강사 본인 세션)에서만 참고용으로
   * 보여주고, publishAIDraft는 이 값을 절대 건드리지 않는다(학생 노출 경로 없음). */
  teacherQcDraft: string | null;
  errorMessage: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  UPLOADED: "Uploaded",
  PUBLIC_READY: "Preparing",
  TRANSCRIBING: "Transcribing",
  TRANSCRIBED: "Transcribed",
  ANALYZING: "Generating AI draft",
  NEEDS_SPEAKER_CONFIRMATION: "Speaker identification required",
  TEACHER_SPEAKER_CONFIRMED: "Speaker confirmed — preparing AI draft",
  NEEDS_REVIEW: "Draft ready for review",
  PUBLISHED: "Published",
  COMPLETED: "Completed",
  UPLOAD_FAILED: "Upload failed",
  TRANSCRIPTION_FAILED: "Transcription failed",
  ANALYSIS_FAILED: "AI draft generation failed",
  SAVE_FAILED: "Save failed",
};

// 녹음 업로드는 private R2로 브라우저가 직접 올린다(RecordingUploader.tsx) — 서버가 파일을 중계하지 않는다.
// 서버 쪽 설정(R2·AssemblyAI)이 다 갖춰지지 않은 환경에서는 `uploadEnabled`가 false이고, 업로드 버튼은 비활성 +
// 안내 문구로 그 사실을 그대로 보여 준다(실제로 업로드되는 것처럼 보이게 하지 않는다).
const REUPLOAD_STATES = ["UPLOADED", "UPLOAD_FAILED", "TRANSCRIPTION_FAILED"];
const WAITING_STATES = ["UPLOADED", "PUBLIC_READY", "TRANSCRIBING", "TRANSCRIBED", "ANALYZING", "TEACHER_SPEAKER_CONFIRMED"];

export function ClassRecordingPanel({
  sessionId,
  recording,
  hasExistingEvaluation,
  speakerChoices,
  uploadEnabled = false,
}: {
  sessionId: number;
  recording: RecordingSummary | null;
  hasExistingEvaluation: boolean;
  speakerChoices?: SpeakerChoice[] | null;
  uploadEnabled?: boolean;
}) {
  const router = useRouter();
  if (!recording) {
    if (uploadEnabled) {
      return (
        <div className="flex max-w-2xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-700">Class Recording</h2>
          <p className="text-sm text-slate-500">
            Upload the recording of this class to get an AI-generated evaluation draft. You review and edit it before anything is
            published, and you can still write the evaluation manually above.
          </p>
          <RecordingUploader sessionId={sessionId} />
        </div>
      );
    }
    return (
      <div className="flex max-w-2xl flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <h2 className="text-sm font-bold text-slate-700">Class Recording</h2>
        <p className="text-sm text-slate-500">
          Recording upload isn&apos;t available in this environment yet. You can still write today&apos;s evaluation manually above.
        </p>
        <button
          type="button"
          disabled
          className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-400"
        >
          Upload Recording (not available yet)
        </button>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-slate-700">Class Recording</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-slate-500">File</dt>
        <dd className="text-slate-800">{recording.fileName}</dd>
        <dt className="text-slate-500">Status</dt>
        <dd className="font-semibold text-slate-800">{STATUS_LABEL[recording.processingStatus] ?? recording.processingStatus}</dd>
        {recording.duration !== null && (
          <>
            <dt className="text-slate-500">Duration</dt>
            <dd className="text-slate-800">{Math.round(recording.duration / 60)} min</dd>
          </>
        )}
        {recording.teacherTalkPercentage !== null && recording.studentTalkPercentage !== null && (
          <>
            <dt className="text-slate-500">Talk Time</dt>
            <dd className="text-slate-800">
              Teacher {recording.teacherTalkPercentage}% / Student {recording.studentTalkPercentage}%
            </dd>
          </>
        )}
      </dl>
      {recording.processingStatus === "NEEDS_SPEAKER_CONFIRMATION" ? (
        speakerChoices && speakerChoices.length > 0 ? (
          <SpeakerConfirmation sessionId={sessionId} choices={speakerChoices} />
        ) : (
          <p className="text-sm text-red-600">{recording.errorMessage}</p>
        )
      ) : (
        recording.errorMessage && <p className="text-sm text-red-600">{recording.errorMessage}</p>
      )}

      {WAITING_STATES.includes(recording.processingStatus) && (
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">This can take several minutes. The page does not update by itself — use Refresh to check.</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh status
          </button>
        </div>
      )}

      {uploadEnabled && REUPLOAD_STATES.includes(recording.processingStatus) && (
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            {recording.processingStatus === "UPLOADED" ? "Upload didn't finish? You can start it again after a few minutes." : "You can upload the recording again."}
          </p>
          <RecordingUploader sessionId={sessionId} label="Upload again" />
        </div>
      )}

      {recording.processingStatus === "NEEDS_REVIEW" && recording.aiDraft && (
        <ReviewDraft sessionId={sessionId} draft={recording.aiDraft} hasExistingEvaluation={hasExistingEvaluation} />
      )}

      {recording.teacherQcDraft && (
        <details className="border-t border-slate-100 pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500">
            Teacher QC Report (English, not visible to student)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            {recording.teacherQcDraft}
          </pre>
        </details>
      )}
    </div>
  );
}

function ReviewDraft({
  sessionId,
  draft,
  hasExistingEvaluation,
}: {
  sessionId: number;
  draft: string;
  hasExistingEvaluation: boolean;
}) {
  const [state, formAction, pending] = useActionState(publishAIDraft, undefined);
  const [content, setContent] = useState(draft);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <p className="text-xs font-semibold text-slate-500">AI-generated draft — review and edit before publishing.</p>
      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
        className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-slate-500"
      />
      <input type="hidden" name="confirmOverwrite" value={confirming ? "true" : "false"} />

      {state?.needsConfirmation && !confirming && (
        <p className="text-sm font-semibold text-amber-600">
          An evaluation already exists for this class. Publishing will replace it — submit again to confirm.
        </p>
      )}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm font-semibold text-emerald-600">Published.</p>}

      <button
        type="submit"
        disabled={pending || content.trim() === ""}
        onClick={() => {
          if (hasExistingEvaluation && state?.needsConfirmation) setConfirming(true);
        }}
        className="w-fit rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Publishing..." : state?.needsConfirmation ? "Confirm & Replace" : "Publish as Evaluation"}
      </button>
    </form>
  );
}

// Shown while the analysis waits for the teacher. Nothing is pre-selected and the application does not say which voice it thinks is the
// teacher — the choice must be the teacher's own. The server validates the label and the ownership again (speakerConfirmation.ts).
function SpeakerConfirmation({ sessionId, choices }: { sessionId: number; choices: SpeakerChoice[] }) {
  const [state, formAction, pending] = useActionState(confirmTeacherSpeakerAction, undefined);

  if (state?.success) {
    return <p className="border-t border-slate-100 pt-3 text-sm font-semibold text-emerald-600">{state.message}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-slate-100 pt-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div>
        <h3 className="text-sm font-bold text-slate-800">Speaker identification required</h3>
        <p className="text-sm text-slate-600">Please select which speaker is the teacher.</p>
        <p className="mt-1 text-xs text-slate-500">
          The AI draft is generated from the transcript that already exists, using your choice. No new transcription is made.
        </p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Which speaker is the teacher?</legend>
        {choices.map((c) => (
          <label key={c.label} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm hover:border-slate-400">
            <input type="radio" name="teacherSpeaker" value={c.label} required className="mt-1" />
            <span className="flex flex-col gap-1">
              <span className="font-semibold text-slate-800">
                Speaker {c.label} <span className="font-normal text-slate-500">— {c.turns} turns · {c.minutes} min</span>
              </span>
              {c.excerpts.map((e) => (
                <span key={e.at} className="text-xs text-slate-600">
                  [{e.at}] {e.text}
                </span>
              ))}
            </span>
          </label>
        ))}
      </fieldset>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Confirm teacher speaker"}
      </button>
    </form>
  );
}
