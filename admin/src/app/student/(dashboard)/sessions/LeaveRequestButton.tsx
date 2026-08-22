"use client";

import { useState, useTransition } from "react";
import { requestLeave } from "./actions";

export function LeaveRequestButton({ sessionId }: { sessionId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-red-600 underline"
      >
        휴강 신청
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="사유 (선택)"
        className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500"
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await requestLeave(sessionId, reason);
              if (result.error) {
                setError(result.error);
              } else {
                setOpen(false);
                setError(null);
              }
            });
          }}
          className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending ? "처리 중..." : "신청 확정"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-500"
        >
          취소
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
