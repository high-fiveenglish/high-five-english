"use client";

import { useTransition } from "react";

export function ApproveRejectButtons({
  approveAction,
  rejectAction,
}: {
  approveAction: () => Promise<void>;
  rejectAction: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex justify-end gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("이 Hold 신청을 승인하시겠습니까? 승인 즉시 수업이 휴강 처리되고 수강 종료일이 연장됩니다."))
            return;
          startTransition(() => {
            approveAction().catch((err) => {
              alert(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
            });
          });
        }}
        className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "처리 중..." : "승인"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("이 Hold 신청을 거부하시겠습니까? 수업 일정은 변경되지 않습니다.")) return;
          startTransition(() => {
            rejectAction().catch((err) => {
              alert(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
            });
          });
        }}
        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        거부
      </button>
    </div>
  );
}
