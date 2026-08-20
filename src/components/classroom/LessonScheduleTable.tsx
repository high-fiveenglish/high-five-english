import { useState } from "react";
import { FileText, CalendarClock, Video } from "lucide-react";
import type { Lesson } from "../../lib/scheduling/types";
import { LessonStatusBadge } from "./LessonStatusBadge";
import { combineDateTimeMs, hoursBetween } from "../../lib/scheduling/dateUtils";

const RESCHEDULE_CUTOFF_HOURS = 4;

function formatDate(iso: string) {
  const [, m, d] = iso.split("-");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(iso + "T00:00:00Z").getUTCDay()];
  return `${Number(m)}.${Number(d)} (${weekday})`;
}

export function LessonScheduleTable({
  lessons,
  teacherName,
  courseName,
  onOpenEvaluation,
  onRequestReschedule,
}: {
  lessons: Lesson[];
  teacherName: string;
  courseName: string;
  onOpenEvaluation: (lesson: Lesson) => void;
  onRequestReschedule: (lesson: Lesson) => void;
}) {
  const [now] = useState(() => Date.now());

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            {["날짜", "시간", "수업명", "강사", "출결상태", "평가서", "입장", "연기"].map((h) => (
              <th
                key={h}
                className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lessons.map((lesson) => {
            const hoursUntil = hoursBetween(now, combineDateTimeMs(lesson.scheduledDate, lesson.scheduledTime));
            const isReschedulable = lesson.status === "scheduled" && hoursUntil >= RESCHEDULE_CUTOFF_HOURS;
            const isCutoff = lesson.status === "scheduled" && hoursUntil < RESCHEDULE_CUTOFF_HOURS;

            return (
              <tr key={lesson.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/30">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-brand-950">
                  {formatDate(lesson.scheduledDate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                  {lesson.scheduledTime}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{courseName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{teacherName}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <LessonStatusBadge status={lesson.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {lesson.status === "completed" ? (
                    lesson.evaluationStatus === "completed" ? (
                      <button
                        onClick={() => onOpenEvaluation(lesson)}
                        className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline"
                      >
                        <FileText size={13} /> 평가서 보기
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">평가서 작성 중</span>
                    )
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {lesson.status === "scheduled" ? (
                    lesson.meetingUrl ? (
                      <a
                        href={lesson.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700"
                      >
                        <Video size={13} /> 수업 입장
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">입장 링크 준비 중</span>
                    )
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {isReschedulable && (
                    <button
                      onClick={() => onRequestReschedule(lesson)}
                      className="flex items-center gap-1 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-accent-600"
                    >
                      <CalendarClock size={13} /> 수업 연기
                    </button>
                  )}
                  {isCutoff && (
                    <button
                      disabled
                      title="수업 시작 4시간 전까지만 연기 신청이 가능합니다"
                      className="cursor-not-allowed rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-400"
                    >
                      연기 신청 마감
                    </button>
                  )}
                  {!isReschedulable && !isCutoff && <span className="text-xs text-slate-300">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
