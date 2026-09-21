"use client";

import { useActionState, useState } from "react";
import { TEXTBOOK_OPTIONS } from "@/lib/textbookCatalog";
import { saveEvaluationAdmin } from "../actions";

const MAX_LENGTH = 2000;

export function EvaluationAdminForm({
  sessionId,
  defaultContent,
  defaultTextbook,
  defaultProgress,
}: {
  sessionId: number;
  defaultContent: string;
  defaultTextbook: string;
  defaultProgress: string;
}) {
  const action = saveEvaluationAdmin.bind(null, sessionId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [content, setContent] = useState(defaultContent);

  const overLimit = content.length > MAX_LENGTH;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">교재</span>
          <select
            name="textbookName"
            defaultValue={defaultTextbook}
            className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-slate-500"
          >
            <option value="">선택 안 함</option>
            {TEXTBOOK_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">진도</span>
          <input
            name="progressNote"
            defaultValue={defaultProgress}
            placeholder="예: 5과, 20페이지"
            className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-slate-500"
          />
        </label>
      </div>
      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={12}
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-slate-500 ${
          overLimit ? "border-red-400" : "border-slate-300"
        }`}
      />
      <p className={`text-right text-xs ${overLimit ? "font-semibold text-red-600" : "text-slate-400"}`}>
        {content.length} / {MAX_LENGTH}자
      </p>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || overLimit || content.trim() === ""}
        className="w-fit rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "저장 중..." : "저장"}
      </button>
    </form>
  );
}
