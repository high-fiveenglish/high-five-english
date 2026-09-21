"use client";

import { useActionState } from "react";
import { createStudent } from "../actions";
import { STATUS_OPTIONS } from "../constants";

export function StudentCreateForm({
  agents,
  defaultAgentId,
}: {
  agents: { id: number; name: string }[];
  defaultAgentId: number | null;
}) {
  const [state, formAction, pending] = useActionState(createStudent, undefined);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <Section title="기본 정보">
        <div className="grid grid-cols-2 gap-4">
          <Field label="이름">
            <input name="name" required className="input" />
          </Field>
          <Field label="로그인 ID">
            <input name="loginId" required className="input" />
          </Field>
          <Field label="비밀번호">
            <input name="password" type="password" required className="input" />
          </Field>
          <Field label="영어 이름 (선택)">
            <input name="englishName" className="input" />
          </Field>
          <Field label="성별 (선택)">
            <select name="sex" defaultValue="" className="input">
              <option value="">선택 안 함</option>
              <option value="MALE">남</option>
              <option value="FEMALE">여</option>
            </select>
          </Field>
          <Field label="생년월일 (선택)">
            <input name="birthDate" type="date" className="input" />
          </Field>
          <Field label="직업 (선택)">
            <input name="occupation" className="input" />
          </Field>
          <Field label="협력사">
            <select name="agentId" defaultValue={defaultAgentId ?? ""} className="input">
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="회원등급">
            <select name="grade" defaultValue="GENERAL" className="input">
              <option value="GENERAL">일반회원</option>
              <option value="ADMIN">관리자</option>
            </select>
          </Field>
          <Field label="상태">
            <select name="status" defaultValue="ACTIVE" className="input">
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="할인율(%)">
            <input name="discountRate" type="number" step="0.01" defaultValue={0} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="연락처">
        <div className="grid grid-cols-2 gap-4">
          <Field label="거주 지역 (선택)">
            <select name="region" defaultValue="" className="input">
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
            <input name="address" className="input" />
          </Field>
          <Field label="휴대전화 (선택)">
            <input name="mobilePhone" className="input" />
          </Field>
          <Field label="카카오톡 ID (선택)">
            <input name="kakaoId" className="input" />
          </Field>
          <Field label="위챗 ID (선택)">
            <input name="wechatId" className="input" />
          </Field>
          <Field label="상담루트 (선택)">
            <select name="consultRoute" defaultValue="" className="input">
              <option value="">선택 안 함</option>
              <option value="KAKAOTALK">카카오톡</option>
              <option value="WECHAT">위챗</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="수업 관련">
        <div className="grid grid-cols-2 gap-4">
          <Field label="희망 수업 방법 (선택)">
            <select name="preferredClassMethod" defaultValue="" className="input">
              <option value="">선택 안 함</option>
              <option value="teams">Teams</option>
              <option value="zoom">Zoom</option>
              <option value="tencent">Tencent (VooV Meeting)</option>
            </select>
          </Field>
          <Field label="Teams ID (선택)">
            <input name="teamsId" className="input" />
          </Field>
        </div>
      </Section>

      <Section title="기타">
        <div className="grid grid-cols-2 gap-4">
          <Field label="추천인 ID (선택)">
            <input name="referrerId" className="input" />
          </Field>
        </div>
        <Field label="기타 메모 (선택)">
          <textarea name="etcNote" rows={3} className="input" />
        </Field>
      </Section>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "등록 중..." : "등록"}
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
