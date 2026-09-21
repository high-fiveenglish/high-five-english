"use client";

import { useTransition } from "react";

export function HoldReleaseButton({ action }: { action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("홀드를 해제하시겠습니까? 예정 수업이 쉰 기간만큼 뒤로 밀려 다시 시작됩니다.")) return;
        startTransition(() => {
          action().catch((err) => {
            alert(err instanceof Error ? err.message : "해제 중 오류가 발생했습니다.");
          });
        });
      }}
      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? "해제 중..." : "홀드 해제"}
    </button>
  );
}
