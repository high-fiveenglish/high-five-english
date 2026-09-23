"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { createReservation } from "../actions";
import { WEEKDAYS } from "@/lib/weekdays";
import { CLASS_METHOD_OPTIONS } from "@/lib/levelTestOptions";
import { HALF_HOUR_TIME_OPTIONS } from "@/lib/timeOptions";

// 화면에는 월~일 순서로 보여준다(EnrollmentCreateForm과 동일한 패턴) — WEEKDAYS
// 배열 자체는 일(0)이 먼저라 그대로 렌더링하면 "일월화수목금토"처럼 어색해진다.
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
  const [checkedDays, setCheckedDays] = useState<number[]>([]);
  const [baseClassTime, setBaseClassTime] = useState("");
  const [dayTimes, setDayTimes] = useState<Record<number, string>>({});
  const [sameTimeForAllDays, setSameTimeForAllDays] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);

  const orderedCheckedDays = useMemo(
    () => WEEKDAY_DISPLAY_ORDER.filter((v) => checkedDays.includes(v)),
    [checkedDays],
  );

  const toggleDay = (value: number) => {
    setCheckedDays((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  // 서버로 보내기 전 마지막 확인 — 요일 미선택/시간 미입력/중복 요일(체크박스 구조상
  // 중복 자체는 발생할 수 없지만 방어적으로 같이 확인)을 여기서 먼저 잡아 불필요한
  // 서버 왕복 없이 바로 알려준다. 실제 저장 검증은 actions.ts에서 한 번 더 한다.
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setClientError(null);
    if (checkedDays.length === 0) {
      e.preventDefault();
      setClientError("요일을 1개 이상 선택해주세요.");
      return;
    }
    if (new Set(checkedDays).size !== checkedDays.length) {
      e.preventDefault();
      setClientError("같은 요일을 중복 선택할 수 없습니다.");
      return;
    }
    const missingTime = sameTimeForAllDays
      ? baseClassTime === ""
      : checkedDays.some((v) => !dayTimes[v]);
    if (missingTime) {
      e.preventDefault();
      setClientError("선택한 모든 요일에 시간을 입력해주세요.");
      return;
    }
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
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

      <Field label="수업 방법">
        <div className="flex flex-wrap gap-4">
          {CLASS_METHOD_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="radio" name="classMethod" value={o.value} defaultChecked={o.value === "zoom"} />
              {o.label}
            </label>
          ))}
        </div>
      </Field>

      <Field label="예약 빈도">
        <p className="input flex items-center bg-slate-50 text-slate-500">
          {checkedDays.length > 0 ? `주 ${checkedDays.length}회` : "요일을 선택하면 자동으로 계산됩니다"}
        </p>
      </Field>

      <Field label="요일 (여러 개 선택 가능)">
        <div className="flex flex-wrap gap-3">
          {ORDERED_WEEKDAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-1 text-sm text-slate-600">
              <input
                type="checkbox"
                name="weekday"
                value={d.value}
                checked={checkedDays.includes(d.value)}
                onChange={() => toggleDay(d.value)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </Field>

      <Field label="수업 시간(분)">
        <select name="durationMin" defaultValue="25" className="input">
          <option value="25">25분</option>
          <option value="50">50분</option>
        </select>
      </Field>

      <Field label="예약 시간">
        <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <input
            type="checkbox"
            checked={sameTimeForAllDays}
            onChange={(e) => {
              const checked = e.target.checked;
              setSameTimeForAllDays(checked);
              if (checked) setDayTimes({});
            }}
          />
          모두 동일한 시간 선택
        </label>

        {sameTimeForAllDays ? (
          <select
            name="classTime"
            value={baseClassTime}
            onChange={(e) => setBaseClassTime(e.target.value)}
            className="input"
          >
            <option value="">선택하세요</option>
            {HALF_HOUR_TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : orderedCheckedDays.length === 0 ? (
          <p className="input flex items-center bg-slate-50 text-slate-400">요일을 먼저 선택하세요</p>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            {orderedCheckedDays.map((v) => {
              const day = WEEKDAYS.find((d) => d.value === v)!;
              return (
                <div key={v} className="flex items-center gap-2 text-sm">
                  <span className="w-6 shrink-0 font-medium text-slate-600">{day.label}</span>
                  <select
                    name={`dayTime_${v}`}
                    value={dayTimes[v] ?? ""}
                    onChange={(e) => setDayTimes((prev) => ({ ...prev, [v]: e.target.value }))}
                    className="input"
                  >
                    <option value="">선택하세요</option>
                    {HALF_HOUR_TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-1 text-xs text-slate-400">
          {sameTimeForAllDays
            ? "체크를 해제하면 요일마다 다른 시각을 각각 지정할 수 있습니다."
            : "요일마다 다른 시각을 지정합니다. 다시 체크하면 모든 요일에 같은 시각이 적용됩니다."}
        </p>
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

      {(clientError || state?.error) && <p className="text-sm text-red-600">{clientError ?? state?.error}</p>}

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
