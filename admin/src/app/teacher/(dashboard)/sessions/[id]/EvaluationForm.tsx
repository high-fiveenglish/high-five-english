"use client";

import { useActionState, useEffect, useState } from "react";
import { TEXTBOOK_OPTIONS } from "@/lib/textbookCatalog";
import { saveEvaluation } from "./actions";

const MAX_LENGTH = 2000;

export function EvaluationForm({
  sessionId,
  defaultContent,
  defaultTextbook,
  defaultProgress,
  onSaved,
}: {
  sessionId: number;
  defaultContent: string;
  defaultTextbook: string;
  defaultProgress: string;
  onSaved?: () => void;
}) {
  const action = saveEvaluation.bind(null, sessionId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [content, setContent] = useState(defaultContent);

  const overLimit = content.length > MAX_LENGTH;

  useEffect(() => {
    if (state?.success) onSaved?.();
    // onSaved는 렌더마다 새로 생성되는 인라인 콜백일 수 있어 의존성에서 제외한다 —
    // 저장이 성공했을 때 한 번만 호출하면 되고, state.success가 그 유일한 트리거다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">Textbook</span>
          <select
            name="textbookName"
            defaultValue={defaultTextbook}
            className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-slate-500"
          >
            <option value="">Select</option>
            {TEXTBOOK_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">Progress</span>
          <input
            name="progressNote"
            defaultValue={defaultProgress}
            placeholder="e.g. Chapter 5, page 20"
            className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-slate-500"
          />
        </label>
      </div>
      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={12}
        placeholder="Freely write about expressions covered today, speaking participation, areas needing correction, goals for the next class, etc."
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-slate-500 ${
          overLimit ? "border-red-400" : "border-slate-300"
        }`}
      />
      <p className={`text-right text-xs ${overLimit ? "font-semibold text-red-600" : "text-slate-400"}`}>
        {content.length} / {MAX_LENGTH} chars
      </p>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && !onSaved && <p className="text-sm font-semibold text-emerald-600">Saved.</p>}

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
