"use client";

import { useActionState } from "react";
import { updateOwnProfile } from "./actions";

type ProfileValues = {
  loginId: string;
  name: string;
  engName: string | null;
  email: string | null;
  phone: string | null;
  kakaoId: string | null;
  wechatId: string | null;
};

export function ProfileForm({ user }: { user: ProfileValues }) {
  const [state, formAction, pending] = useActionState(updateOwnProfile, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-4">
        <Field label="관리자 아이디">
          <input name="loginId" defaultValue={user.loginId} required className="input" />
        </Field>
        <Field label="새 비밀번호 (선택, 4자 이상)">
          <input name="newPassword" type="password" placeholder="변경하지 않으려면 비워두세요" className="input" />
        </Field>
        <Field label="한글이름">
          <input name="name" defaultValue={user.name} required className="input" />
        </Field>
        <Field label="영어이름">
          <input name="engName" defaultValue={user.engName ?? ""} className="input" />
        </Field>
        <Field label="이메일">
          <input name="email" type="email" defaultValue={user.email ?? ""} className="input" />
        </Field>
        <Field label="전화번호">
          <input name="phone" defaultValue={user.phone ?? ""} className="input" />
        </Field>
        <Field label="카카오톡">
          <input name="kakaoId" defaultValue={user.kakaoId ?? ""} className="input" />
        </Field>
        <Field label="위챗">
          <input name="wechatId" defaultValue={user.wechatId ?? ""} className="input" />
        </Field>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">저장되었습니다.</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
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
