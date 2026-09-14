"use client";

import { useTransition } from "react";
import { updateEnrollmentRequestStatus } from "./actions";
import type { EnrollmentRequestStatus } from "@/generated/prisma/client";

const OPTIONS: EnrollmentRequestStatus[] = ["NEW", "CONTACTED", "CONVERTED", "CANCELLED"];
const LABEL: Record<EnrollmentRequestStatus, string> = {
  NEW: "신규",
  CONTACTED: "연락완료",
  CONVERTED: "등록전환",
  CANCELLED: "취소",
};

export function RequestStatusSelect({ id, status }: { id: number; status: EnrollmentRequestStatus }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as EnrollmentRequestStatus;
        startTransition(() => {
          updateEnrollmentRequestStatus(id, value).catch((err) => {
            alert(err instanceof Error ? err.message : "상태 변경 중 오류가 발생했습니다.");
          });
        });
      }}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500 disabled:opacity-50"
    >
      {OPTIONS.map((o) => (
        <option key={o} value={o}>
          {LABEL[o]}
        </option>
      ))}
    </select>
  );
}
