"use client";

import { useState, useTransition } from "react";

// window.confirm()은 이 앱을 미리보기하는 일부 브라우저 환경(예: 자동화 도구의 내장
// 브라우저)에서 항상 취소로 응답하도록 막혀 있어, 그런 환경에서는 버튼을 눌러도 아무
// 반응이 없는 것처럼 보일 수 있다 — 그래서 네이티브 confirm() 대신 인라인 확인 모달을
// 쓴다(회원 삭제 버튼과 동일한 방식).
export function ApproveRejectButtons({
  approveAction,
  rejectAction,
}: {
  approveAction: () => Promise<void>;
  rejectAction: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);
  const [pending, startTransition] = useTransition();

  const COPY: Record<"approve" | "reject", { title: string; body: string }> = {
    approve: {
      title: "Hold 신청 승인",
      body: "이 Hold 신청을 승인하시겠습니까? 승인 즉시 수업이 휴강 처리되고 수강 종료일이 연장됩니다.",
    },
    reject: {
      title: "Hold 신청 거부",
      body: "이 Hold 신청을 거부하시겠습니까? 수업 일정은 변경되지 않습니다.",
    },
  };

  return (
    <>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setConfirming("approve")}
          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
        >
          승인
        </button>
        <button
          type="button"
          onClick={() => setConfirming("reject")}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          거부
        </button>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-sm font-bold text-slate-900">{COPY[confirming].title}</h2>
            <p className="mb-5 text-sm text-slate-600">{COPY[confirming].body}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const action = confirming === "approve" ? approveAction : rejectAction;
                  startTransition(() => {
                    action()
                      .then(() => setConfirming(null))
                      .catch((err) => {
                        alert(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
                      });
                  });
                }}
                className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {pending ? "처리 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
