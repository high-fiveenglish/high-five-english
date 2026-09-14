"use client";

import { useTransition } from "react";
import { updateEnrollmentStatus } from "./actions";
import type { EnrollmentStatus } from "@/generated/prisma/client";

const OPTIONS: { value: EnrollmentStatus; label: string }[] = [
  { value: "APPLIED", label: "신청" },
  { value: "PAID", label: "결제완료" },
  { value: "ACTIVE", label: "진행중" },
  { value: "HOLDING", label: "홀드" },
  { value: "COMPLETED", label: "종료" },
];

export function StatusSelect({ id, status }: { id: number; status: EnrollmentStatus }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as EnrollmentStatus;
        startTransition(() => {
          updateEnrollmentStatus(id, value);
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
