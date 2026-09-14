"use client";

import { useState, useTransition } from "react";
import { impersonateTeacher } from "./actions";

// window.confirm()은 이 앱을 미리보기하는 일부 브라우저 환경(예: 자동화 도구의 내장
// 브라우저)에서 항상 취소로 응답하도록 막혀 있어, 그런 환경에서는 버튼을 눌러도 아무
// 반응이 없는 것처럼 보일 수 있다 — 그래서 네이티브 confirm() 대신 인라인 확인 모달을
// 쓴다(회원 삭제 버튼과 동일한 방식).
export function ImpersonateButton({ teacherId, teacherName }: { teacherId: number; teacherName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "이동 중..." : "강사로 로그인"}
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-sm font-bold text-slate-900">강사로 대리 로그인</h2>
            <p className="mb-5 text-sm text-slate-600">
              <strong>{teacherName}</strong> 강사 계정으로 대리 로그인합니다. 관리자 로그인은 유지되며 강사 화면에서
              바로 돌아올 수 있습니다.
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
                    impersonateTeacher(teacherId);
                  });
                }}
                className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {pending ? "이동 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
