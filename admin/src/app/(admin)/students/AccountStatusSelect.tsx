"use client";

import { useTransition } from "react";
import { updateStudentAccountStatus } from "./actions";
import type { AccountStatus } from "@/generated/prisma/client";

const OPTIONS: AccountStatus[] = ["ACTIVE", "SUSPENDED", "INACTIVE", "PENDING"];

export function AccountStatusSelect({ studentId, accountStatus }: { studentId: number; accountStatus: AccountStatus }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={accountStatus}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as AccountStatus;
        startTransition(() => {
          updateStudentAccountStatus(studentId, value).catch((err) => {
            alert(err instanceof Error ? err.message : "계정 상태 변경 중 오류가 발생했습니다.");
          });
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
