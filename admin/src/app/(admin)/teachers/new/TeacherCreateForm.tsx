"use client";

import { useActionState } from "react";
import { createTeacher } from "../actions";

export function TeacherCreateForm() {
  const [state, formAction, pending] = useActionState(createTeacher, undefined);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="실명">
        <input name="realName" required className="input" />
      </Field>
      <Field label="닉네임 (선택)">
        <input name="nickname" className="input" />
      </Field>
      <Field label="로그인 ID">
        <input name="loginId" required className="input" />
      </Field>
      <Field label="비밀번호">
        <input name="password" type="password" required className="input" />
      </Field>
      <Field label="국적 (선택)">
        <input name="nationality" className="input" />
      </Field>
      <Field label="이메일 (선택)">
        <input name="email" type="email" className="input" />
      </Field>
      <Field label="단가 (25분당, 원)">
        <input name="ratePerUnit" type="number" min={0} className="input" />
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
