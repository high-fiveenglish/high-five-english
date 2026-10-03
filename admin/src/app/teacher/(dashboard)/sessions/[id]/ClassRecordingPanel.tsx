"use client";

import { useActionState, useState } from "react";
import { publishAIDraft } from "./recordingActions";

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
  NEEDS_SPEAKER_CONFIRMATION: "Speaker check needed",
  NEEDS_REVIEW: "Draft ready for review",
  PUBLISHED: "Published",
  COMPLETED: "Completed",
  UPLOAD_FAILED: "Upload failed",
  TRANSCRIPTION_FAILED: "Transcription failed",
  ANALYSIS_FAILED: "AI draft generation failed",
  SAVE_FAILED: "Save failed",
};

// Google Drive 연동 전이라 실제 업로드는 아직 연결하지 않는다(READ-ONLY 조사로
// Shared Drive 사용이 막혀 있음을 이미 확인함) — 그 전까지 이 패널은 상태를 보여주는
// 용도로만 쓰이고, "업로드" 버튼은 비활성 + 안내 문구로 그 사실을 명확히 드러낸다.
// 실제로 업로드되는 것처럼 보이게 하지 않는다.
export function ClassRecordingPanel({
  sessionId,
  recording,
  hasExistingEvaluation,
}: {
  sessionId: number;
  recording: RecordingSummary | null;
  hasExistingEvaluation: boolean;
}) {
  if (!recording) {
    return (
      <div className="flex max-w-2xl flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <h2 className="text-sm font-bold text-slate-700">Class Recording</h2>
        <p className="text-sm text-slate-500">
          Automatic recording upload isn&apos;t connected yet (storage setup pending). You can still write today&apos;s
          evaluation manually above.
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
      {recording.errorMessage && <p className="text-sm text-red-600">{recording.errorMessage}</p>}

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
  const action = publishAIDraft.bind(null, sessionId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [content, setContent] = useState(draft);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
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
        className="w-fit rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {pending ? "Publishing..." : state?.needsConfirmation ? "Confirm & Replace" : "Publish as Evaluation"}
      </button>
    </form>
  );
}
