"use client";

import { useActionState } from "react";
import { updateReviewViews } from "./actions";

export function ReviewViewsForm({ id, views }: { id: number; views: number }) {
  const [state, formAction, pending] = useActionState(updateReviewViews.bind(null, id), undefined);

  return (
    <form action={formAction} className="flex items-center gap-1">
      <span className="text-slate-400">조회</span>
      <input
        type="number"
        name="views"
        min={0}
        defaultValue={views}
        disabled={pending}
        className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] outline-none focus:border-slate-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        저장
      </button>
      {state?.error && <span className="text-red-600">{state.error}</span>}
    </form>
  );
}
