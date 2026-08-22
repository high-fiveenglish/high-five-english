"use client";

import { useTransition } from "react";
import { updateEnrollmentPaymentStatus } from "./actions";
import type { PaymentStatus } from "@/generated/prisma/client";

const OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: "UNPAID", label: "미결제" },
  { value: "PAID", label: "결제완료" },
  { value: "FAILED", label: "결제실패" },
];

export function PaymentStatusSelect({ id, paymentStatus }: { id: number; paymentStatus: PaymentStatus | null }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={paymentStatus ?? "UNPAID"}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as PaymentStatus;
        startTransition(() => {
          updateEnrollmentPaymentStatus(id, value);
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
