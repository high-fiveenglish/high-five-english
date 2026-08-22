"use client";

import { useActionState } from "react";
import { createStudent } from "../actions";
import { GRADE_OPTIONS, STATUS_OPTIONS } from "../constants";

export function StudentCreateForm({ agents }: { agents: { id: number; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createStudent, undefined);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="이름">
        <input name="name" required className="input" />
      </Field>
      <Field label="로그인 ID">
        <input name="loginId" required className="input" />
      </Field>
      <Field label="비밀번호">
        <input name="password" type="password" required className="input" />
      </Field>
      <Field label="협력사 (선택)">
        <select name="agentId" defaultValue="" className="input">
          <option value="">미지정</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="회원등급">
        <select name="grade" defaultValue="GENERAL" className="input">
          {GRADE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="상태">
        <select name="status" defaultValue="ACTIVE" className="input">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="할인율(%)">
        <input name="discountRate" type="number" step="0.01" defaultValue={0} className="input" />
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
