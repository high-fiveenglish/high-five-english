"use client";

import { useActionState } from "react";
import { updateStudent } from "../actions";

export type StudentEditValues = {
  id: number;
  name: string;
  loginId: string;
  grade: string;
  status: string;
  points: number;
  discountRate: string;
  englishName: string | null;
  sex: string | null;
  birthDate: string | null;
  occupation: string | null;
  region: string | null;
  address: string | null;
  landlinePhone: string | null;
  mobilePhone: string | null;
  etcNote: string | null;
  parentName: string | null;
  parentContact: string | null;
  preferredClassMethod: string | null;
  smsOptIn: boolean;
  teamsId: string | null;
  referrerId: string | null;
};

export function StudentEditForm({ student }: { student: StudentEditValues }) {
  const action = updateStudent.bind(null, student.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const s = student;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <Section title="기본 정보">
        <div className="grid grid-cols-2 gap-4">
          <Field label="로그인 ID (변경 불가)">
            <input value={s.loginId} disabled className="input bg-slate-50 text-slate-400" />
          </Field>
          <Field label="이름">
            <input name="name" defaultValue={s.name} required className="input" />
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
          <Field label="등급">
            <select name="grade" defaultValue={s.grade} className="input">
              <option value="GENERAL">일반</option>
              <option value="BRANCH">지점</option>
              <option value="AGENT">협력사</option>
              <option value="ADMIN">관리자</option>
            </select>
          </Field>
          <Field label="상태">
            <select name="status" defaultValue={s.status} className="input">
              <option value="ACTIVE">활동중</option>
              <option value="HOLDING">홀드</option>
              <option value="EXPIRED">만료</option>
            </select>
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
          <Field label="일반전화번호 (선택)">
            <input name="landlinePhone" defaultValue={s.landlinePhone ?? ""} className="input" />
          </Field>
          <Field label="휴대전화 (선택)">
            <input name="mobilePhone" defaultValue={s.mobilePhone ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="보호자 정보">
        <div className="grid grid-cols-2 gap-4">
          <Field label="부모님 이름 (선택)">
            <input name="parentName" defaultValue={s.parentName ?? ""} className="input" />
          </Field>
          <Field label="부모님 연락처 (선택)">
            <input name="parentContact" defaultValue={s.parentContact ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="수업 관련">
        <div className="grid grid-cols-2 gap-4">
          <Field label="희망 수업 방법 (선택)">
            <input
              name="preferredClassMethod"
              defaultValue={s.preferredClassMethod ?? ""}
              placeholder="teams / zoom / tencent"
              className="input"
            />
          </Field>
          <Field label="Teams ID (선택)">
            <input name="teamsId" defaultValue={s.teamsId ?? ""} className="input" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input type="checkbox" name="smsOptIn" defaultChecked={s.smsOptIn} />
          SMS 수신 동의
        </label>
      </Section>

      <Section title="포인트 / 할인">
        <div className="grid grid-cols-2 gap-4">
          <Field label="포인트">
            <input name="points" type="number" defaultValue={s.points} className="input" />
          </Field>
          <Field label="할인율(%)">
            <input name="discountRate" type="number" step="0.01" defaultValue={s.discountRate} className="input" />
          </Field>
          <Field label="추천인 ID (선택)">
            <input name="referrerId" defaultValue={s.referrerId ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="기타">
        <Field label="기타 메모 (선택)">
          <textarea name="etcNote" defaultValue={s.etcNote ?? ""} rows={3} className="input" />
        </Field>
        <Field label="비밀번호 재설정 (선택)">
          <input name="newPassword" type="password" placeholder="변경 시에만 입력" className="input" />
        </Field>
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
