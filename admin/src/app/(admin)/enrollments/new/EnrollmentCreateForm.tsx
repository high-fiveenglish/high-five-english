"use client";

import { useActionState } from "react";
import { createEnrollment } from "../actions";

type Option = { id: number; label: string };

export function EnrollmentCreateForm({
  students,
  teachers,
  defaultStudentId = null,
  defaultClassMethod = null,
}: {
  students: Option[];
  teachers: Option[];
  defaultStudentId?: number | null;
  defaultClassMethod?: string | null;
}) {
  const [state, formAction, pending] = useActionState(createEnrollment, undefined);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="학생">
        <select name="studentId" required defaultValue={defaultStudentId ?? ""} className="input">
          <option value="" disabled>
            선택하세요
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="강사 (선택)">
        <select name="teacherId" defaultValue="" className="input">
          <option value="">미배정</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="패키지 개월수">
        <select name="packageMonths" defaultValue="1" className="input">
          <option value="1">1개월</option>
          <option value="2">2개월</option>
          <option value="3">3개월</option>
        </select>
      </Field>
      <Field label="수업 방식">
        <input
          name="classMethod"
          defaultValue={defaultClassMethod ?? ""}
          placeholder="zoom / skype 등"
          required
          className="input"
        />
      </Field>
      <Field label="수업 요일">
        <input name="scheduleDays" placeholder="예: 화목" required className="input" />
      </Field>
      <Field label="회당 수업시간(분)">
        <select name="classDurationMin" defaultValue="25" className="input">
          <option value="25">25분</option>
          <option value="50">50분</option>
        </select>
      </Field>
      <Field label="총 회차">
        <input name="totalSessions" type="number" min={1} required className="input" />
      </Field>
      <Field label="수강 시작일">
        <input name="startDate" type="date" required className="input" />
      </Field>
      <Field label="수강 종료일">
        <input name="endDate" type="date" required className="input" />
      </Field>
      <Field label="수업 형태">
        <select name="classType" defaultValue="1:1" className="input">
          <option value="1:1">1:1</option>
          <option value="그룹">그룹</option>
        </select>
      </Field>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "등록 중..." : "등록"}
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
