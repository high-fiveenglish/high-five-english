"use client";

import { useState, useTransition } from "react";

export function StudentDeleteButton({
  studentName,
  action,
}: {
  studentName: string;
  action: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        삭제
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-sm font-bold text-slate-900">회원 삭제</h2>
            <p className="mb-1 text-sm text-slate-600">
              정말 <strong>{studentName}</strong> 회원을 삭제하시겠습니까?
            </p>
            <p className="mb-5 text-xs text-slate-400">
              수강내역·레벨테스트·상담노트 등 연결된 자료는 그대로 보존되며, 목록에서만 숨겨집니다.
              삭제된 회원 목록에서 다시 복원할 수 있습니다.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(() => {
                    action()
                      .then(() => setConfirming(false))
                      .catch((err) => {
                        alert(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
                      });
                  });
                }}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "삭제 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
