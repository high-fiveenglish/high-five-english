"use client";

import { useActionState } from "react";
import { createReservation } from "../actions";
import { WEEKDAYS } from "@/lib/weekdays";
import { HALF_HOUR_TIME_OPTIONS } from "@/lib/timeOptions";

const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const ORDERED_WEEKDAYS = WEEKDAY_DISPLAY_ORDER.map((v) => WEEKDAYS.find((d) => d.value === v)!);

export function ReservationCreateForm({
  teachers,
  agents,
  defaultAgentId,
}: {
  teachers: { id: number; name: string }[];
  agents: { id: number; name: string }[];
  defaultAgentId: number | null;
}) {
  const [state, formAction, pending] = useActionState(createReservation, undefined);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="강사">
        <select name="teacherId" required defaultValue="" className="input">
          <option value="" disabled>
            선택해주세요
          </option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="요일">
          <select name="weekday" defaultValue="" required className="input">
            <option value="" disabled>
              선택
            </option>
            {ORDERED_WEEKDAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}요일
              </option>
            ))}
          </select>
        </Field>
        <Field label="시간">
          <select name="classTime" defaultValue="" required className="input">
            <option value="" disabled>
              선택
            </option>
            {HALF_HOUR_TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="수업 시간(분)">
        <select name="durationMin" defaultValue="25" className="input">
          <option value="25">25분</option>
          <option value="50">50분</option>
        </select>
      </Field>
      <Field label="상담자 이름">
        <input name="prospectName" required className="input" placeholder="예비 수강생 또는 학부모 이름" />
      </Field>
      <Field label="연락처 (선택)">
        <input name="contactPhone" className="input" />
      </Field>
      <Field label="메모 (선택)">
        <textarea name="note" rows={3} className="input" placeholder="상담 내용, 희망 조건 등" />
      </Field>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "등록 중..." : "예약 등록"}
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
