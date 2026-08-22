"use client";

import { useActionState, useState } from "react";
import { updateMonthlyEvaluation } from "../actions";

const MAX_LENGTH = 4000;

export function MonthlyEvaluationEditForm({ id, defaultContent }: { id: number; defaultContent: string }) {
  const action = updateMonthlyEvaluation.bind(null, id);
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
        className={`input ${overLimit ? "border-red-400" : ""}`}
      />
      <p className={`text-right text-xs ${overLimit ? "font-semibold text-red-600" : "text-slate-400"}`}>
        {content.length} / {MAX_LENGTH}자
      </p>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || overLimit || content.trim() === ""}
        className="w-fit rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "저장 중..." : "저장"}
      </button>
    </form>
  );
}
