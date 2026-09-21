"use client";

import { useActionState } from "react";
import { updateAgentBranding } from "../actions";
import type { Agent } from "@/generated/prisma/client";

export function AgentBrandingForm({ agent }: { agent: Agent }) {
  const action = updateAgentBranding.bind(null, agent.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Section title="사이트 연결">
        <div className="grid grid-cols-2 gap-4">
          <Field label="접속 도메인 (선택)">
            <input name="domain" defaultValue={agent.domain ?? ""} placeholder="mnmenglish.com" className="input" />
          </Field>
          <Field label="로고 이미지 URL (선택)">
            <input name="logoUrl" defaultValue={agent.logoUrl ?? ""} placeholder="/agency-logos/xxx.png" className="input" />
          </Field>
          <Field label="브랜드 태그라인 (선택)">
            <input name="brandTagline" defaultValue={agent.brandTagline ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="사업자 정보">
        <div className="grid grid-cols-2 gap-4">
          <Field label="상호명">
            <input name="bizName" defaultValue={agent.bizName ?? ""} className="input" />
          </Field>
          <Field label="대표자">
            <input name="bizCeo" defaultValue={agent.bizCeo ?? ""} className="input" />
          </Field>
          <Field label="사업자등록번호">
            <input name="bizRegNo" defaultValue={agent.bizRegNo ?? ""} className="input" />
          </Field>
          <Field label="주소">
            <input name="bizAddress" defaultValue={agent.bizAddress ?? ""} className="input" />
          </Field>
          <Field label="상담전화">
            <input name="bizPhone" defaultValue={agent.bizPhone ?? ""} className="input" />
          </Field>
          <Field label="이메일">
            <input name="bizEmail" defaultValue={agent.bizEmail ?? ""} className="input" />
          </Field>
          <Field label="통신판매업신고번호">
            <input name="bizMailOrderNo" defaultValue={agent.bizMailOrderNo ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="무통장입금 계좌">
        <div className="grid grid-cols-3 gap-4">
          <Field label="은행명">
            <input name="bankName" defaultValue={agent.bankName ?? ""} className="input" />
          </Field>
          <Field label="계좌번호">
            <input name="bankAccountNumber" defaultValue={agent.bankAccountNumber ?? ""} className="input" />
          </Field>
          <Field label="예금주">
            <input name="bankAccountHolder" defaultValue={agent.bankAccountHolder ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

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
