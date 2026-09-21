"use client";

import { useTransition } from "react";
import { requestHoldRelease } from "./sessions/actions";

export function HoldReleaseButton({ enrollmentId }: { enrollmentId: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("홀드를 해제하고 수업을 바로 재개할까요? 쉬었던 기간만큼 수강 종료일이 자동으로 늘어납니다.")) return;
        startTransition(() => {
          requestHoldRelease(enrollmentId).then((res) => {
            if (res.error) alert(res.error);
          });
        });
      }}
      className="mt-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
    >
      {pending ? "처리 중..." : "홀드 해제 요청"}
    </button>
  );
}
