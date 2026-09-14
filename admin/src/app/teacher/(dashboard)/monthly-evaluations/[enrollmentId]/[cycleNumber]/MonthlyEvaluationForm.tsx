"use client";

import { useActionState, useState } from "react";
import { saveMonthlyEvaluation } from "./actions";

const MAX_LENGTH = 4000;

export function MonthlyEvaluationForm({
  enrollmentId,
  cycleNumber,
  sessionsPerCycle,
  defaultContent,
}: {
  enrollmentId: number;
  cycleNumber: number;
  sessionsPerCycle: number;
  defaultContent: string;
}) {
  const action = saveMonthlyEvaluation.bind(null, enrollmentId, cycleNumber, sessionsPerCycle);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [content, setContent] = useState(defaultContent);
  const overLimit = content.length > MAX_LENGTH;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-3">
      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={14}
        placeholder="Summarize this cycle's overall progress: strengths, areas needing correction, and goals for the next cycle."
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-slate-500 ${
          overLimit ? "border-red-400" : "border-slate-300"
        }`}
      />
      <p className={`text-right text-xs ${overLimit ? "font-semibold text-red-600" : "text-slate-400"}`}>
        {content.length} / {MAX_LENGTH} chars
      </p>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm font-semibold text-emerald-600">Saved.</p>}

      <button
        type="submit"
        disabled={pending || overLimit || content.trim() === ""}
        className="w-fit rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
