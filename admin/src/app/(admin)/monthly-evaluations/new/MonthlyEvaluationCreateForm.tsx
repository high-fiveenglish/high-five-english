"use client";

import { useActionState, useState } from "react";
import { createMonthlyEvaluation } from "../actions";

type Option = { id: number; label: string };

const MAX_LENGTH = 4000;

export function MonthlyEvaluationCreateForm({ students, teachers }: { students: Option[]; teachers: Option[] }) {
  const [state, formAction, pending] = useActionState(createMonthlyEvaluation, undefined);
  const [content, setContent] = useState("");
  const overLimit = content.length > MAX_LENGTH;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
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
        <Field label="대상 월">
          <input name="yearMonth" type="month" required className="input" />
        </Field>
        <Field label="담당 강사 (선택)">
          <select name="teacherId" defaultValue="" className="input">
            <option value="">지정 안 함</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="내용">
        <textarea
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          required
          className={`input ${overLimit ? "border-red-400" : ""}`}
        />
      </Field>
      <p className={`text-right text-xs ${overLimit ? "font-semibold text-red-600" : "text-slate-400"}`}>
        {content.length} / {MAX_LENGTH}자
      </p>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || overLimit}
        className="w-fit rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "저장 중..." : "저장"}
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
