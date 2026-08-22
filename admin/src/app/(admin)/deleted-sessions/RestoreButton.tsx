"use client";

import { useTransition } from "react";

export function RestoreButton({ action }: { action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("이 수업을 전체 일정표로 복원할까요?")) return;
        startTransition(() => {
          action().catch((err) => {
            alert(err instanceof Error ? err.message : "복원 중 오류가 발생했습니다.");
          });
        });
      }}
      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
    >
      {pending ? "복원 중..." : "복원"}
    </button>
  );
}
