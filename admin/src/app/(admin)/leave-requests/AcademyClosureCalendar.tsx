"use client";

import { useActionState, useEffect, useState } from "react";
import { formatAppDate } from "@/lib/appTime";
import { createAcademyClosure } from "./actions";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type DateRecord = { type: string; studentName: string; teacherName: string; time: string; reason: string | null };

// students/[id]/sessions의 AdminSessionCalendar와 동일한 방식으로 달을 그린다 — 셀은
// 브라우저 로컬 Date로 만들고, key는 formatAppDate(Asia/Seoul 기준)로 뽑아 이 앱의
// 다른 달력들과 날짜 계산 방식을 그대로 맞춘다.
export function AcademyClosureCalendar({
  closedDates,
  recordsByDate,
}: {
  closedDates: string[];
  /** 날짜(YYYY-MM-DD)별 연기 기록(학생휴강·관리자휴강·어학원휴강 전부) — 날짜를
   * 클릭했을 때 바로 아래에 보여준다. */
  recordsByDate: Record<string, DateRecord[]>;
}) {
  const closedSet = new Set(closedDates);
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(createAcademyClosure, undefined);

  useEffect(() => {
    if (state?.success) {
      setSelectedDate(null);
      setReason("");
    }
  }, [state]);

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const d = new Date(viewYear, viewMonth - 1, 1);
            setViewYear(d.getFullYear());
            setViewMonth(d.getMonth());
          }}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← 이전 달
        </button>
        <p className="text-sm font-bold text-slate-900">
          {viewYear}.{String(viewMonth + 1).padStart(2, "0")}
        </p>
        <button
          type="button"
          onClick={() => {
            const d = new Date(viewYear, viewMonth + 1, 1);
            setViewYear(d.getFullYear());
            setViewMonth(d.getMonth());
          }}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
        >
          다음 달 →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 font-semibold text-slate-400">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = formatAppDate(d);
          const isClosed = closedSet.has(key);
          const isSelected = selectedDate === key;
          const recordCount = recordsByDate[key]?.length ?? 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedDate(key)}
              className={`min-h-[52px] rounded-lg border p-1.5 text-left ${
                isSelected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : isClosed
                    ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    : "border-slate-100 hover:bg-slate-50"
              }`}
            >
              <span className="text-[11px]">{d.getDate()}</span>
              {isClosed ? (
                <span
                  className={`mt-0.5 block text-[9px] font-bold ${isSelected ? "text-red-200" : "text-red-600"}`}
                >
                  휴강
                </span>
              ) : (
                recordCount > 0 && (
                  <span
                    className={`mt-0.5 block text-[9px] font-bold ${isSelected ? "text-white/70" : "text-blue-600"}`}
                  >
                    연기 {recordCount}건
                  </span>
                )
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (recordsByDate[selectedDate]?.length ?? 0) > 0 && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold text-slate-600">{selectedDate} 연기 기록</p>
          <div className="flex flex-col gap-1.5">
            {recordsByDate[selectedDate].map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 font-bold text-slate-600">{r.type}</span>
                <span className="font-medium text-slate-900">{r.studentName}</span>
                <span className="text-slate-400">· {r.teacherName} 강사 · {r.time}</span>
                {r.reason && <span className="text-slate-400">— {r.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <form action={formAction} className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4">
        <input type="hidden" name="date" value={selectedDate ?? ""} />
        <p className="text-sm text-slate-600">
          선택한 날짜: <strong>{selectedDate ?? "달력에서 날짜를 클릭하세요"}</strong>
          {selectedDate && closedSet.has(selectedDate) && (
            <span className="ml-2 text-xs text-red-500">(이미 휴강 등록된 날짜입니다)</span>
          )}
        </p>
        <textarea
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="휴강 사유 (예: 추석 연휴)"
          rows={2}
          required
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.success && <p className="text-sm text-emerald-600">{state.success}</p>}
        <button
          type="submit"
          disabled={pending || !selectedDate}
          className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "처리 중..." : "선택한 날짜 전체 휴강 등록"}
        </button>
      </form>
    </div>
  );
}
