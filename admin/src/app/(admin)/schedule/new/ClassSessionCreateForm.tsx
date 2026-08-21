"use client";

import { useActionState } from "react";
import { createClassSession } from "../actions";

type Option = { id: number; label: string };

export function ClassSessionCreateForm({ enrollments }: { enrollments: Option[] }) {
  const [state, formAction, pending] = useActionState(createClassSession, undefined);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="수강신청 (학생 · 강사 자동 연결)">
        <select name="enrollmentId" required defaultValue="" className="input">
          <option value="" disabled>
            선택하세요
          </option>
          {enrollments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="수업 일시">
        <input name="scheduledAt" type="datetime-local" required className="input" />
      </Field>
      <Field label="수업 시간(분)">
        <select name="durationMin" defaultValue="25" className="input">
          <option value="25">25분</option>
          <option value="50">50분</option>
        </select>
      </Field>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "등록 중..." : "등록"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
