"use client";

import { useState, useTransition } from "react";

// window.confirm()은 이 앱을 미리보기하는 일부 브라우저 환경(예: 자동화 도구의 내장
// 브라우저)에서 항상 취소로 응답하도록 막혀 있어, 그런 환경에서는 버튼을 눌러도 아무
// 반응이 없는 것처럼 보일 수 있다 — 그래서 네이티브 confirm() 대신 인라인 확인 모달을
// 쓴다(회원 삭제 버튼과 동일한 방식).
export function AcademyClosureRevertButton({
  affectedCount,
  action,
}: {
  affectedCount: number;
  action: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        되돌리기
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-sm font-bold text-slate-900">전체수업휴강 되돌리기</h2>
            <p className="mb-5 text-sm text-slate-600">
              이 날짜의 전체수업휴강을 되돌려 관련 수업 {affectedCount}건을 전부 예정 상태로 되돌리고, 늘어났던
              수강 종료일도 원래대로 줄입니다. 계속할까요?
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
