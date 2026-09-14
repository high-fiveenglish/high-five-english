"use client";

import { useActionState, useState } from "react";
import { updateEnrollmentPrice } from "../../actions";
import type { PaymentStatus } from "@/generated/prisma/client";

const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: "UNPAID", label: "미결제" },
  { value: "PAID", label: "결제완료" },
  { value: "FAILED", label: "결제실패" },
];

export function PaymentForm({
  enrollmentId,
  basePriceKRW,
  defaultActualPriceKRW,
  paymentStatus,
}: {
  enrollmentId: number;
  basePriceKRW: number | null;
  defaultActualPriceKRW: number;
  paymentStatus: PaymentStatus | null;
}) {
  const [state, formAction, pending] = useActionState(updateEnrollmentPrice.bind(null, enrollmentId), undefined);
  const [actualPrice, setActualPrice] = useState(String(defaultActualPriceKRW));

  const isDiscounted = basePriceKRW !== null && Number(actualPrice || 0) !== basePriceKRW;

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-slate-900">결제</h2>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">기본 수강료 (가격표 기준)</span>
        {basePriceKRW !== null ? (
          <p className="text-lg font-bold text-slate-900">{basePriceKRW.toLocaleString()}원</p>
        ) : (
          <p className="text-sm text-amber-600">
            이 수강 조건(기간·주당 횟수)에 해당하는 가격표 행이 없습니다. 아래에 실제 수강료를 직접 입력해주세요.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="actualPriceKRW" className="text-xs font-medium text-slate-500">
          실제 수강료 (지인할인·프로모션·포인트 사용 등 반영)
        </label>
        <div className="flex items-center gap-2">
          <input
            id="actualPriceKRW"
            name="actualPriceKRW"
            type="number"
            min={0}
            step={1000}
            value={actualPrice}
            onChange={(e) => setActualPrice(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
          <span className="text-sm text-slate-500">원</span>
        </div>
        {isDiscounted && (
          <p className="text-xs text-blue-600">
            기본 수강료와 {Math.abs(basePriceKRW! - Number(actualPrice || 0)).toLocaleString()}원 차이가 있습니다.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="paymentStatus" className="text-xs font-medium text-slate-500">
          결제 상태
        </label>
        <select
          id="paymentStatus"
          name="paymentStatus"
          defaultValue={paymentStatus ?? "UNPAID"}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          {PAYMENT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "저장 중..." : "결제 정보 저장"}
        </button>
        {basePriceKRW !== null && (
          <button
            type="button"
            onClick={() => setActualPrice(String(basePriceKRW))}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            기본 수강료로 재설정
          </button>
        )}
      </div>
    </form>
  );
}
