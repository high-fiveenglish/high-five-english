"use client";

import { useState, useTransition } from "react";
import { updatePricingCell, type FieldName } from "./actions";

export function PriceCell({ rowId, field, value }: { rowId: number; field: FieldName; value: number | null }) {
  const [current, setCurrent] = useState(value ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="number"
      min={0}
      value={current}
      disabled={pending}
      onChange={(e) => setCurrent(e.target.value === "" ? "" : Number(e.target.value))}
      onBlur={() => {
        const amount = current === "" ? 0 : Number(current);
        startTransition(() => {
          updatePricingCell(rowId, field, amount).catch((err) => {
            alert(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
          });
        });
      }}
      className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-slate-500 disabled:opacity-50"
    />
  );
}
