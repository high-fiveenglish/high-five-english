"use client";

import { useActionState } from "react";
import { updateTeacher } from "../actions";

type Teacher = {
  id: number;
  realName: string;
  nickname: string | null;
  nationality: string | null;
  email: string | null;
  approvalStatus: string;
  currentRate: string | null;
};

export function TeacherEditForm({ teacher }: { teacher: Teacher }) {
  const action = updateTeacher.bind(null, teacher.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="실명">
        <input name="realName" defaultValue={teacher.realName} required className="input" />
      </Field>
      <Field label="닉네임 (선택)">
        <input name="nickname" defaultValue={teacher.nickname ?? ""} className="input" />
      </Field>
      <Field label="국적 (선택)">
        <input name="nationality" defaultValue={teacher.nationality ?? ""} className="input" />
      </Field>
      <Field label="이메일 (선택)">
        <input name="email" type="email" defaultValue={teacher.email ?? ""} className="input" />
      </Field>
      <Field label="승인 상태">
        <select name="approvalStatus" defaultValue={teacher.approvalStatus} className="input">
          <option value="PENDING">승인 대기</option>
          <option value="APPROVED">승인됨</option>
          <option value="REJECTED">반려</option>
        </select>
      </Field>
      <Field label={`현재 단가: ${teacher.currentRate ? teacher.currentRate + "원" : "미설정"} — 변경 시 새 이력으로 추가`}>
        <input name="newRatePerUnit" type="number" min={0} placeholder="변경 시에만 입력" className="input" />
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
