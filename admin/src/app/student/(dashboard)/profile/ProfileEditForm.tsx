"use client";

import { useActionState } from "react";
import { updateOwnProfile } from "./actions";

export type OwnProfileValues = {
  name: string;
  loginId: string;
  englishName: string | null;
  sex: string | null;
  birthDate: string | null;
  occupation: string | null;
  region: string | null;
  address: string | null;
  mobilePhone: string | null;
  email: string | null;
  preferredClassMethod: string | null;
  teamsId: string | null;
  kakaoId: string | null;
  wechatId: string | null;
};

export function ProfileEditForm({ student }: { student: OwnProfileValues }) {
  const [state, formAction, pending] = useActionState(updateOwnProfile, undefined);
  const s = student;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <Section title="기본 정보">
        <div className="grid grid-cols-2 gap-4">
          <Field label="이름 (변경 불가)">
            <input value={s.name} disabled className="input bg-slate-50 text-slate-400" />
          </Field>
          <Field label="로그인 ID (변경 불가)">
            <input value={s.loginId} disabled className="input bg-slate-50 text-slate-400" />
          </Field>
          <Field label="영어 이름 (선택)">
            <input name="englishName" defaultValue={s.englishName ?? ""} className="input" />
          </Field>
          <Field label="성별 (선택)">
            <select name="sex" defaultValue={s.sex ?? ""} className="input">
              <option value="">선택 안 함</option>
              <option value="MALE">남</option>
              <option value="FEMALE">여</option>
            </select>
          </Field>
          <Field label="생년월일 (선택)">
            <input name="birthDate" type="date" defaultValue={s.birthDate ?? ""} className="input" />
          </Field>
          <Field label="직업 (선택)">
            <input name="occupation" defaultValue={s.occupation ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="연락처">
        <div className="grid grid-cols-2 gap-4">
          <Field label="거주 지역 (선택)">
            <select name="region" defaultValue={s.region ?? ""} className="input">
              <option value="">선택 안 함</option>
              <option value="KOREA">한국</option>
              <option value="CHINA">중국</option>
              <option value="VIETNAM">베트남</option>
              <option value="JAPAN">일본</option>
              <option value="AUSTRALIA">호주</option>
              <option value="USA_OTHER">미국 및 기타</option>
            </select>
          </Field>
          <Field label="주소 (선택)">
            <input name="address" defaultValue={s.address ?? ""} className="input" />
          </Field>
          <Field label="휴대전화 (선택)">
            <input name="mobilePhone" defaultValue={s.mobilePhone ?? ""} className="input" />
          </Field>
          <Field label="이메일 (선택)">
            <input name="email" type="email" defaultValue={s.email ?? ""} className="input" />
          </Field>
          <Field label="카카오톡 ID (선택)">
            <input name="kakaoId" defaultValue={s.kakaoId ?? ""} className="input" />
          </Field>
          <Field label="위챗 ID (선택)">
            <input name="wechatId" defaultValue={s.wechatId ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="수업 관련">
        <div className="grid grid-cols-2 gap-4">
          <Field label="희망 수업 방법 (선택)">
            <select name="preferredClassMethod" defaultValue={s.preferredClassMethod ?? ""} className="input">
              <option value="">선택 안 함</option>
              <option value="teams">Teams</option>
              <option value="zoom">Zoom</option>
              <option value="tencent">Tencent (VooV Meeting)</option>
            </select>
          </Field>
          <Field label="Teams ID (선택)">
            <input name="teamsId" defaultValue={s.teamsId ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="비밀번호 변경">
        <div className="grid grid-cols-2 gap-4">
          <Field label="새 비밀번호 (선택)">
            <input name="newPassword" type="password" placeholder="변경 시에만 입력" className="input" />
          </Field>
          <Field label="새 비밀번호 확인">
            <input name="newPasswordConfirm" type="password" placeholder="변경 시에만 입력" className="input" />
          </Field>
        </div>
      </Section>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm font-medium text-emerald-600">저장되었습니다.</p>}

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {children}
    </div>
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
