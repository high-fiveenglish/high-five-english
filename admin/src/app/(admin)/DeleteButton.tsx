"use client";

import { useTransition } from "react";

// action이 { error }를 돌려주면(예: 수업이 있어 삭제할 수 없는 수강) 그 안내를 그대로 보여준다.
export function DeleteButton({ action, label = "삭제" }: { action: () => Promise<void | { error?: string }>; label?: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("정말 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
        startTransition(() => {
          action()
            .then((result) => {
              if (result && typeof result === "object" && result.error) alert(result.error);
            })
            .catch((err) => {
              alert(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
            });
        });
      }}
      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "삭제 중..." : label}
    </button>
  );
}
