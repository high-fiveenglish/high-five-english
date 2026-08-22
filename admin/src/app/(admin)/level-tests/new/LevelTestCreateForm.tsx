"use client";

import { useActionState } from "react";
import { createLevelTest } from "../actions";

type Option = { id: number; label: string };

export function LevelTestCreateForm({ students }: { students: Option[] }) {
  const [state, formAction, pending] = useActionState(createLevelTest, undefined);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="학생">
        <select name="studentId" required defaultValue="" className="input">
          <option value="" disabled>
            선택하세요
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="과목 (선택)">
        <input name="subject" className="input" />
      </Field>
      <Field label="수업 방식 (선택)">
        <input name="classMethod" placeholder="zoom / skype 등" className="input" />
      </Field>
      <Field label="테스트 희망일시 (선택)">
        <input name="scheduledTestDate" type="datetime-local" className="input" />
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
