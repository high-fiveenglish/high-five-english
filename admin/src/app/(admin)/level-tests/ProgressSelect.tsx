"use client";

import { useTransition } from "react";
import { updateLevelTestProgress } from "./actions";

const OPTIONS = ["신청", "배정완료", "테스트완료", "완료"];

export function ProgressSelect({ id, progressStatus }: { id: number; progressStatus: string | null }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={progressStatus ?? "신청"}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(() => {
          updateLevelTestProgress(id, value);
        });
      }}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500 disabled:opacity-50"
    >
      {OPTIONS.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
