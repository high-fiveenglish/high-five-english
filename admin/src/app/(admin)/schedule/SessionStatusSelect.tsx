"use client";

import { useTransition } from "react";
import { updateClassSessionStatus } from "./actions";
import type { SessionStatus } from "@/generated/prisma/client";

const OPTIONS: { value: SessionStatus; label: string }[] = [
  { value: "SCHEDULED", label: "예정" },
  { value: "COMPLETED", label: "완료" },
  { value: "CANCELLED", label: "취소" },
  { value: "MAKEUP_NEEDED", label: "보충필요" },
  { value: "LEAVE", label: "휴강" },
];

export function SessionStatusSelect({ id, status }: { id: number; status: SessionStatus }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as SessionStatus;
        startTransition(() => {
          updateClassSessionStatus(id, value);
        });
      }}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500 disabled:opacity-50"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
