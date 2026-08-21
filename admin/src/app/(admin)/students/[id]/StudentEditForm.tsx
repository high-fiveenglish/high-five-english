"use client";

import { useActionState } from "react";
import { updateStudent } from "../actions";

type Student = {
  id: number;
  name: string;
  loginId: string;
  grade: string;
  status: string;
  points: number;
  discountRate: string;
};

export function StudentEditForm({ student }: { student: Student }) {
  const action = updateStudent.bind(null, student.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="로그인 ID (변경 불가)">
        <input value={student.loginId} disabled className="input bg-slate-50 text-slate-400" />
      </Field>
      <Field label="이름">
        <input name="name" defaultValue={student.name} required className="input" />
      </Field>
      <Field label="등급">
        <select name="grade" defaultValue={student.grade} className="input">
          <option value="GENERAL">일반</option>
          <option value="BRANCH">지점</option>
          <option value="AGENT">협력사</option>
          <option value="ADMIN">관리자</option>
        </select>
      </Field>
      <Field label="상태">
        <select name="status" defaultValue={student.status} className="input">
          <option value="ACTIVE">활동중</option>
          <option value="HOLDING">홀드</option>
          <option value="EXPIRED">만료</option>
        </select>
      </Field>
      <Field label="포인트">
        <input name="points" type="number" defaultValue={student.points} className="input" />
      </Field>
      <Field label="할인율(%)">
        <input
          name="discountRate"
          type="number"
          step="0.01"
          defaultValue={student.discountRate}
          className="input"
        />
      </Field>
      <Field label="비밀번호 재설정 (선택)">
        <input name="newPassword" type="password" placeholder="변경 시에만 입력" className="input" />
      </Field>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "저장 중..." : "저장"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
