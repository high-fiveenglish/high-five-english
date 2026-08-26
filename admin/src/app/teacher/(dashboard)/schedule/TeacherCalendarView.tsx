"use client";

import { useState } from "react";
import Link from "next/link";
import { formatAppDate, formatAppTime } from "@/lib/appTime";

export type TeacherCalendarSession = {
  id: number;
  scheduledAt: Date;
  durationMin: number;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MAKEUP_NEEDED" | "LEAVE";
  progressNote: string | null;
  studentName: string;
  classType: string;
  classMethod: string;
  textbookName: string | null;
  evaluationId: number | null;
};

const STATUS_LABEL: Record<TeacherCalendarSession["status"], string> = {
  SCHEDULED: "예정",
  COMPLETED: "완료",
  CANCELLED: "취소",
  MAKEUP_NEEDED: "보충필요",
  LEAVE: "휴강",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 학생 Dashboard의 CalendarView.tsx와 동일한 이유로 Asia/Seoul 기준 날짜 키를 쓴다 —
// 강사의 브라우저 타임존이 한국이 아니어도 항상 한국 달력 기준으로 묶여야 한다.
function dateKey(d: Date) {
  return formatAppDate(d);
}
const fmtDate = formatAppDate;
const fmtTime = formatAppTime;

export function TeacherCalendarView({ sessions }: { sessions: TeacherCalendarSession[] }) {
  const today = new Date();
  const initial = sessions.find((s) => s.scheduledAt >= today) ?? sessions[sessions.length - 1] ?? { scheduledAt: today };
  const [initialYear, initialMonth] = formatAppDate(initial.scheduledAt).split("-").map(Number);
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth - 1);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(dateKey(initial.scheduledAt));
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const byDay = new Map<string, TeacherCalendarSession[]>();
  for (const s of sessions) {
    const key = dateKey(s.scheduledAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  const regularClasses = (selectedDateKey ? byDay.get(selectedDateKey) : undefined) ?? [];

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

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
          const key = dateKey(d);
          const daySessions = byDay.get(key) ?? [];
          const isToday = key === dateKey(today);
          const isSelected = key === selectedDateKey;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSelectedDateKey(key);
                setSelectedId(null);
              }}
              className={`min-h-[64px] rounded-lg border p-1 text-left ${
                isSelected ? "border-slate-900 ring-1 ring-slate-900" : isToday ? "border-slate-400 bg-slate-50" : "border-slate-100"
              }`}
            >
              <p className="text-[11px] text-slate-400">{d.getDate()}</p>
              {daySessions.length > 0 && (
                <span className="mt-0.5 block w-fit rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-600">
                  수업 {daySessions.length}건
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDateKey && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-bold text-slate-900">
            {selectedDateKey} Regular Classes
          </p>
          {regularClasses.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              해당 날짜에 예정된 수업이 없습니다.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {regularClasses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${
                    selectedId === s.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-semibold">{fmtTime(s.scheduledAt)}</span>
                  <span>{s.studentName}</span>
                  <span>{s.classType}</span>
                  <span>{s.classMethod}</span>
                  <span>{s.textbookName ?? "-"}</span>
                  <span className={selectedId === s.id ? "text-white" : "text-slate-400"}>{STATUS_LABEL[s.status]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-bold text-slate-900">수업 상세</p>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <InfoItem label="학생" value={selected.studentName} />
            <InfoItem label="수업 날짜" value={fmtDate(selected.scheduledAt)} />
            <InfoItem
              label="수업 시간"
              value={`${fmtTime(selected.scheduledAt)} (${selected.durationMin}분)`}
            />
            <InfoItem label="수업 종류" value={selected.classType} />
            <InfoItem label="수업 방식" value={selected.classMethod} />
            <InfoItem label="교재" value={selected.textbookName ?? "-"} />
            <InfoItem label="수업 진도" value={selected.progressNote ?? "-"} />
            <InfoItem label="수업 상태" value={STATUS_LABEL[selected.status]} />
          </div>
          <p className="mt-3 text-xs">
            {selected.evaluationId ? (
              <Link href={`/teacher/sessions/${selected.id}`} className="font-semibold text-slate-700 hover:underline">
                Daily Evaluation 수정
              </Link>
            ) : selected.status === "COMPLETED" ? (
              <Link href={`/teacher/sessions/${selected.id}`} className="font-semibold text-blue-700 hover:underline">
                Daily Evaluation 작성
              </Link>
            ) : (
              <span className="text-slate-400">수업 완료 후 평가서를 작성할 수 있습니다.</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-900">{value}</p>
    </div>
  );
}
