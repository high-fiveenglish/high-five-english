"use client";

import { useState } from "react";
import Link from "next/link";
import { formatAppDate, formatAppTime } from "@/lib/appTime";

export type CalendarSession = {
  id: number;
  scheduledAt: Date;
  durationMin: number;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MAKEUP_NEEDED" | "LEAVE";
  progressNote: string | null;
  teacherName: string;
  evaluationId: number | null;
};

const STATUS_LABEL: Record<CalendarSession["status"], string> = {
  SCHEDULED: "예정",
  COMPLETED: "완료",
  CANCELLED: "취소",
  MAKEUP_NEEDED: "보충필요",
  LEAVE: "휴강",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 세션을 달력 칸에 배치할 때 쓰는 날짜 키 — 학생 브라우저의 로컬 타임존이 한국이
// 아니어도(예: 해외에서 접속) 항상 한국 달력 기준 날짜로 묶이도록 Asia/Seoul로
// 명시 변환한다(브라우저 로컬 getFullYear/getMonth/getDate를 쓰지 않음).
function dateKey(d: Date) {
  return formatAppDate(d);
}
const fmtDate = formatAppDate;
const fmtTime = formatAppTime;

export function CalendarView({
  sessions,
  classMethod,
  classType,
  textbookName,
}: {
  sessions: CalendarSession[];
  classMethod: string;
  classType: string;
  textbookName: string | null;
}) {
  const today = new Date();
  const initial = sessions.find((s) => s.scheduledAt >= today) ?? sessions[sessions.length - 1] ?? { scheduledAt: today };
  // 초기 표시 월도 한국 달력 기준으로 계산한다(브라우저 로컬 getFullYear/getMonth 대신).
  const [initialYear, initialMonth] = formatAppDate(initial.scheduledAt).split("-").map(Number);
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth - 1);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const byDay = new Map<string, CalendarSession[]>();
  for (const s of sessions) {
    const key = dateKey(s.scheduledAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }

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
          const daySessions = byDay.get(dateKey(d)) ?? [];
          const isToday = dateKey(d) === dateKey(today);
          return (
            <div
              key={i}
              className={`min-h-[64px] rounded-lg border p-1 text-left ${
                isToday ? "border-slate-400 bg-slate-50" : "border-slate-100"
              }`}
            >
              <p className="text-[11px] text-slate-400">{d.getDate()}</p>
              {daySessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`mt-0.5 block w-full rounded px-1 py-0.5 text-left text-[10px] leading-tight ${
                    selectedId === s.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {fmtTime(s.scheduledAt)} {s.teacherName}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-bold text-slate-900">수업 상세</p>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <InfoItem label="수업 날짜" value={fmtDate(selected.scheduledAt)} />
            <InfoItem
              label="수업 시간"
              value={`${fmtTime(selected.scheduledAt)} (${selected.durationMin}분)`}
            />
            <InfoItem label="강사" value={selected.teacherName} />
            <InfoItem label="수업 종류" value={classType} />
            <InfoItem label="수업 방식" value={classMethod} />
            <InfoItem label="교재" value={textbookName ?? "-"} />
            <InfoItem label="수업 진도" value={selected.progressNote ?? "-"} />
            <InfoItem label="수업 상태" value={STATUS_LABEL[selected.status]} />
          </div>
          <p className="mt-3 text-xs">
            {selected.evaluationId ? (
              <Link href={`/student/evaluations/${selected.evaluationId}`} className="font-semibold text-slate-700 hover:underline">
                Daily Evaluation 보기
              </Link>
            ) : (
              <span className="text-slate-400">
                {selected.status === "COMPLETED" ? "평가서 준비 중" : "아직 평가서가 작성되지 않았습니다."}
              </span>
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
