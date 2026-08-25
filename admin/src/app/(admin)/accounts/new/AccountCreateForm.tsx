"use client";

import { useActionState } from "react";
import { createAccount } from "../actions";

export function AccountCreateForm() {
  const [state, formAction, pending] = useActionState(createAccount, undefined);

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
      <Field label="역할">
        <select name="role" defaultValue="MANAGER" className="input">
          <option value="MANAGER">MANAGER</option>
          <option value="ADMIN">ADMIN</option>
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
