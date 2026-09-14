import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, CalendarClock, Video } from "lucide-react";
import type { Lesson } from "../../lib/scheduling/types";
import type { MeetingPlatformId } from "../../data/meetingPlatforms";
import { LessonStatusBadge } from "./LessonStatusBadge";
import { combineDateTimeMs, hoursBetween } from "../../lib/scheduling/dateUtils";
import { resolveJoinUrl } from "../../lib/meeting/resolveJoinUrl";
import type { TeacherMeetingLinks } from "../../services/store";

const RESCHEDULE_CUTOFF_HOURS = 4;

function formatDate(iso: string, weekdayLabels: string[]) {
  const [, m, d] = iso.split("-");
  const weekday = weekdayLabels[new Date(iso + "T00:00:00Z").getUTCDay()];
  return `${Number(m)}.${Number(d)} (${weekday})`;
}

export function LessonScheduleTable({
  lessons,
  teacherName,
  courseName,
  teacherMeetingLinks,
  meetingPlatform,
  onOpenEvaluation,
  onRequestReschedule,
}: {
  lessons: Lesson[];
  teacherName: string;
  courseName: string;
  teacherMeetingLinks: TeacherMeetingLinks;
  meetingPlatform: MeetingPlatformId;
  onOpenEvaluation: (lesson: Lesson) => void;
  onRequestReschedule: (lesson: Lesson) => void;
}) {
  const [now] = useState(() => Date.now());
  const { t } = useTranslation("classroom");
  const weekdayLabels = t("weekdays_short", { returnObjects: true }) as string[];
  const headers = t("schedule_table.headers", { returnObjects: true }) as Record<string, string>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            {Object.values(headers).map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lessons.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                {t("schedule_table.empty")}
              </td>
            </tr>
          )}
          {lessons.map((lesson) => {
            const hoursUntil = hoursBetween(now, combineDateTimeMs(lesson.scheduledDate, lesson.scheduledTime));
            const isReschedulable = lesson.status === "scheduled" && hoursUntil >= RESCHEDULE_CUTOFF_HOURS;
            const isCutoff = lesson.status === "scheduled" && hoursUntil < RESCHEDULE_CUTOFF_HOURS;

            return (
              <tr key={lesson.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/30">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-brand-950">
                  {formatDate(lesson.scheduledDate, weekdayLabels)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                  {lesson.scheduledTime}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{courseName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{teacherName}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <LessonStatusBadge status={lesson.status} reason={lesson.reason} />
                  {lesson.reason && lesson.status !== "academy_closed" && (
                    <p className="mt-1 text-[11px] text-slate-400">{lesson.reason}</p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {lesson.status === "completed" ? (
                    lesson.evaluationStatus === "completed" ? (
                      <button
                        onClick={() => onOpenEvaluation(lesson)}
                        className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline"
                      >
                        <FileText size={13} /> {t("schedule_table.view_evaluation")}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{t("schedule_table.evaluation_in_progress")}</span>
                    )
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {lesson.status === "scheduled" ? (
                    resolveJoinUrl(lesson, teacherMeetingLinks, meetingPlatform) ? (
                      <a
                        href={resolveJoinUrl(lesson, teacherMeetingLinks, meetingPlatform)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700"
                      >
                        <Video size={13} /> {t("schedule_table.enter_class")}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">{t("schedule_table.link_pending")}</span>
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
                      <CalendarClock size={13} /> {t("schedule_table.reschedule_cta")}
                    </button>
                  )}
                  {isCutoff && (
                    <button
                      disabled
                      title={t("schedule_table.reschedule_closed_tooltip")}
                      className="cursor-not-allowed rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-400"
                    >
                      {t("schedule_table.reschedule_closed")}
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
