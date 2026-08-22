"use client";

import { useActionState } from "react";
import { createLeaveRequestAdmin } from "./actions";

type SessionOption = {
  id: number;
  label: string;
};

export function CreateLeaveForm({ options }: { options: SessionOption[] }) {
  const [state, formAction, pending] = useActionState(createLeaveRequestAdmin, undefined);

  return (
    <form action={formAction} className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="classSessionId" className="text-xs font-medium text-slate-500">
          대상 수업 (예정 상태만)
        </label>
        <select
          id="classSessionId"
          name="classSessionId"
          required
          className="w-80 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          <option value="">선택해주세요</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className="text-xs font-medium text-slate-500">
          사유 (선택)
        </label>
        <input
          id="reason"
          name="reason"
          type="text"
          className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>

      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "처리 중..." : "휴강 등록"}
      </button>
    </form>
  );
}
