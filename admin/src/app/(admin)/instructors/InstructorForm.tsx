"use client";

import { useActionState } from "react";
import { FileToBase64Field } from "./FileToBase64Field";
import { WEEKDAYS, CEFR_LEVELS, MEETING_PLATFORMS } from "./constants";

export type InstructorFormValues = {
  name: string;
  nameEn: string;
  country: string;
  flag: string;
  gradient: string;
  photoUrl: string | null;
  audioSrc: string | null;
  defaultMeetingPlatform: string | null;
  bio: string;
  career: string[];
  availableDays: number[];
  availableHours: string;
  classFeatures: string[];
  specialties: string[];
  levels: string[];
  teachingStyle: string;
  published: boolean;
};

const EMPTY: InstructorFormValues = {
  name: "",
  nameEn: "",
  country: "",
  flag: "",
  gradient: "from-brand-500 to-brand-700",
  photoUrl: null,
  audioSrc: null,
  defaultMeetingPlatform: null,
  bio: "",
  career: [],
  availableDays: [],
  availableHours: "",
  classFeatures: [],
  specialties: [],
  levels: [],
  teachingStyle: "",
  published: true,
};

type ActionFn = (prevState: { error?: string } | undefined, formData: FormData) => Promise<{ error?: string } | undefined>;

export function InstructorForm({
  action,
  defaultValues = EMPTY,
  submitLabel,
}: {
  action: ActionFn;
  defaultValues?: InstructorFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const v = defaultValues;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="이름 (한글)">
          <input name="name" defaultValue={v.name} required className="input" />
        </Field>
        <Field label="영문 이름">
          <input name="nameEn" defaultValue={v.nameEn} required className="input" />
        </Field>
        <Field label="국가">
          <input name="country" defaultValue={v.country} className="input" />
        </Field>
        <Field label="국기 이모지">
          <input name="flag" defaultValue={v.flag} placeholder="🇺🇸" className="input" />
        </Field>
      </div>

      <Field label="사진 없을 때 배경 그라디언트(Tailwind 클래스)">
        <input name="gradient" defaultValue={v.gradient} className="input" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <FileToBase64Field name="photoUrl" accept="image/*" label="사진" defaultValue={v.photoUrl} previewKind="image" />
        <FileToBase64Field name="audioSrc" accept="audio/*" label="음성 소개" defaultValue={v.audioSrc} previewKind="audio" />
      </div>

      <Field label="화상 플랫폼 기본값 (선택)">
        <select name="defaultMeetingPlatform" defaultValue={v.defaultMeetingPlatform ?? ""} className="input">
          <option value="">지정 안 함</option>
          {MEETING_PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="소개글">
        <textarea name="bio" defaultValue={v.bio} required rows={4} className="input" />
      </Field>

      <Field label="경력 (줄바꿈으로 구분)">
        <textarea name="career" defaultValue={v.career.join("\n")} rows={3} className="input" />
      </Field>

      <Field label="수업 특징 (줄바꿈으로 구분)">
        <textarea name="classFeatures" defaultValue={v.classFeatures.join("\n")} rows={2} className="input" />
      </Field>

      <Field label="전문 분야 (줄바꿈으로 구분)">
        <textarea name="specialties" defaultValue={v.specialties.join("\n")} rows={2} className="input" />
      </Field>

      <Field label="수업 스타일">
        <input name="teachingStyle" defaultValue={v.teachingStyle} className="input" />
      </Field>

      <Field label="근무 가능 시간">
        <input name="availableHours" defaultValue={v.availableHours} placeholder="예: 평일 15:00–20:00" className="input" />
      </Field>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-600">수업 가능 요일</span>
        <div className="flex gap-3">
          {WEEKDAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-1 text-sm text-slate-600">
              <input
                type="checkbox"
                name="availableDays"
                value={d.value}
                defaultChecked={v.availableDays.includes(d.value)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-600">담당 가능 레벨</span>
        <div className="flex flex-wrap gap-3">
          {CEFR_LEVELS.map((l) => (
            <label key={l} className="flex items-center gap-1 text-sm text-slate-600">
              <input type="checkbox" name="levels" value={l} defaultChecked={v.levels.includes(l)} />
              {l.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <input type="checkbox" name="published" defaultChecked={v.published} />
        공개 (홈페이지에 노출)
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "저장 중..." : submitLabel}
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
