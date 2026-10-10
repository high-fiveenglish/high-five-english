"use client";

import { useActionState, useState, useTransition } from "react";
import { approvePaidLeaveAction, createPaidLeave, rejectPaidLeaveAction, revokePaidLeaveAction } from "./actions";

export function CreatePaidLeaveForm({ teachers }: { teachers: { id: number; label: string }[] }) {
  const [state, formAction, pending] = useActionState(createPaidLeave, undefined);
  return (
    <form action={formAction} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="teacherId" className="text-xs font-medium text-slate-500">
          정규 강사
        </label>
        <select id="teacherId" name="teacherId" required className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500">
          <option value="">선택해주세요</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="leaveDate" className="text-xs font-medium text-slate-500">
          휴가일 (KST)
        </label>
        <input id="leaveDate" name="leaveDate" type="date" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className="text-xs font-medium text-slate-500">
          사유 (선택)
        </label>
        <input id="reason" name="reason" type="text" className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500" />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
        {pending ? "처리 중..." : "유급휴가 요청 등록"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}

export function PaidLeaveButtons({ id, status }: { id: number; status: "PENDING" | "APPROVED" | "REJECTED" }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string } | null>(null);
  const [confirming, setConfirming] = useState<"approve" | "revoke" | null>(null);

  function run(fn: () => Promise<{ error?: string; success?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const r = await fn();
      setMessage(r);
      if (!r.error) setConfirming(null);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-left text-xs text-slate-600">
          <p className="mb-2 max-w-xs">
            {confirming === "approve"
              ? "승인하면 그 강사의 그 날 예정 수업이 정규 수업 시퀀스에서 뒤로 밀리고 수강 종료일이 늘어납니다. 승인된 1건의 급여는 레이트 × 8입니다."
              : "승인을 취소하면 이 유급휴가로 재배치됐던 수업을 모두 원래대로 되돌립니다(후속 변경이 있으면 거부됩니다)."}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => setConfirming(null)} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50">
              닫기
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(async () => (confirming === "approve" ? approvePaidLeaveAction(id) : revokePaidLeaveAction(id)))}
              className="rounded bg-slate-900 px-2 py-1 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {pending ? "처리 중..." : "확인"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-1.5">
          {(status === "PENDING" || status === "REJECTED") && (
            <button type="button" onClick={() => setConfirming("approve")} className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
              {status === "REJECTED" ? "다시 승인" : "승인"}
            </button>
          )}
          {status === "PENDING" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(async () => rejectPaidLeaveAction(id))}
              className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              거부
            </button>
          )}
          {status === "APPROVED" && (
            <button type="button" onClick={() => setConfirming("revoke")} className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
              승인 취소
            </button>
          )}
        </div>
      )}
      {message?.error && <p className="max-w-xs text-right text-xs text-red-600">{message.error}</p>}
      {message?.success && <p className="max-w-xs text-right text-xs text-emerald-700">{message.success}</p>}
    </div>
  );
}
