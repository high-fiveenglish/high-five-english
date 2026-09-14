"use client";

import { useActionState } from "react";

type FormAction = (
  prevState: { error?: string } | undefined,
  formData: FormData,
) => Promise<{ error?: string }>;

export function HomeNoticeForm({
  action,
  defaultTitle = "",
  defaultContent = "",
  defaultPublished = false,
  submitLabel,
}: {
  action: FormAction;
  defaultTitle?: string;
  defaultContent?: string;
  defaultPublished?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-xs font-medium text-slate-500">
          제목
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={defaultTitle}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="content" className="text-xs font-medium text-slate-500">
          내용
        </label>
        <textarea
          id="content"
          name="content"
          required
          rows={10}
          defaultValue={defaultContent}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="published" defaultChecked={defaultPublished} className="h-4 w-4" />
        홈페이지에 노출(게시)
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "저장 중..." : submitLabel}
      </button>
    </form>
  );
}
