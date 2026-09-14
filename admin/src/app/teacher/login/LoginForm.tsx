"use client";

import { useActionState } from "react";
import { teacherLogin } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(teacherLogin, undefined);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div>
        <label htmlFor="loginId" className="mb-1 block text-sm font-medium text-slate-600">
          Login ID
        </label>
        <input
          id="loginId"
          name="loginId"
          type="text"
          required
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-600">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Checking..." : "Log in"}
      </button>
    </form>
  );
}
