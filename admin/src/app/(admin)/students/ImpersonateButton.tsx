"use client";

import { useTransition } from "react";
import { impersonateStudent } from "./actions";

export function ImpersonateButton({ studentId, studentName }: { studentId: number; studentName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`${studentName} 학생 계정으로 대리 로그인합니다. 관리자 로그인은 유지되며 학생 화면에서 바로 돌아올 수 있습니다.`))
          return;
        startTransition(() => {
          impersonateStudent(studentId);
        });
      }}
      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "이동 중..." : "회원으로 로그인"}
    </button>
  );
}
