"use client";

import { useTransition } from "react";

export function RevertButton({ action }: { action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("휴강 처리를 되돌려 수업을 다시 예정 상태로 되돌리고 수강 종료일을 원래대로 줄입니다. 계속할까요?"))
          return;
        startTransition(() => {
          action().catch((err) => {
            alert(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
          });
        });
      }}
      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
    >
      {pending ? "처리 중..." : "되돌리기"}
    </button>
  );
}
