"use client";

import { useActionState } from "react";
import { requestHold } from "../actions";

type SessionOption = {
  id: number;
  label: string;
};

export function HoldRequestForm({ options }: { options: SessionOption[] }) {
  const [state, formAction, pending] = useActionState(requestHold, undefined);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="classSessionId" className="text-xs font-medium text-slate-500">
          Class (only upcoming, requestable classes are shown)
        </label>
        <select
          id="classSessionId"
          name="classSessionId"
          required
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          <option value="">Select a class</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className="text-xs font-medium text-slate-500">
          Reason (optional)
        </label>
        <input
          id="reason"
          name="reason"
          type="text"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="extendedDays" className="text-xs font-medium text-slate-500">
          Extended Days
        </label>
        <input
          id="extendedDays"
          name="extendedDays"
          type="number"
          min={1}
          defaultValue={1}
          required
          className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Processing..." : "Submit Hold Request"}
      </button>
    </form>
  );
}
