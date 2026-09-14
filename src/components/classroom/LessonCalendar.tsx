import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, FileText, PartyPopper } from "lucide-react";
import type { ClosureDate, Lesson, TeacherUnavailability } from "../../lib/scheduling/types";
import type { MeetingPlatformId } from "../../data/meetingPlatforms";
import { getMeetingPlatform } from "../../data/meetingPlatforms";
import { DEFAULT_ENTRY_WINDOW, type EntryWindowSettings } from "../../data/siteSettings";
import { addDays, addMonths, dayOfWeek, firstOfMonth, toEpochDay, todayIso } from "../../lib/scheduling/dateUtils";
import { getEntryWindowSettings } from "../../services/classroomService";
import type { TeacherMeetingLinks } from "../../services/store";
import { LessonStatusBadge, LESSON_STATUS_TAG_CLASSES } from "./LessonStatusBadge";
import { EnterClassButton } from "./EnterClassButton";

export function LessonCalendar({
  lessons,
  closures,
  teacherUnavailability,
  teacherName,
  courseName,
  teacherMeetingLinks,
  meetingPlatform,
  onOpenEvaluation,
  selectedDate,
  onSelectDate,
}: {
  lessons: Lesson[];
  closures: ClosureDate[];
  teacherUnavailability: TeacherUnavailability[];
  teacherName: string;
  courseName: string;
  teacherMeetingLinks: TeacherMeetingLinks;
  meetingPlatform: MeetingPlatformId;
  onOpenEvaluation: (lesson: Lesson) => void;
  /** Controlled by the parent (ClassroomPage) so the schedule table below can filter
   * to the same date — this calendar no longer owns the selection itself. */
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const { t, i18n } = useTranslation("classroom");
  const weekdayLabels = t("weekdays_short", { returnObjects: true }) as string[];
  const today = todayIso();
  // Seeded from the (already-clamped) selectedDate rather than always "today" — when the
  // parent switches to a past/upcoming enrollment via the history dropdown and remounts
  // this component (see ClassroomPage's key={enrollment.id}), the calendar opens on a
  // month that actually has classes instead of always jumping back to the real month.
  const [month, setMonth] = useState(() => firstOfMonth(selectedDate));
  const [entryWindow, setEntryWindow] = useState<EntryWindowSettings>(DEFAULT_ENTRY_WINDOW);

  const formatMonthLabel = (value: string) => {
    const [y, m] = value.split("-").map(Number);
    const monthName = new Intl.DateTimeFormat(i18n.language, { month: "long" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    );
    return t("calendar.month_label", { year: y, month: m, monthName });
  };

  useEffect(() => {
    getEntryWindowSettings().then(setEntryWindow);
  }, []);

  const lessonsByDate = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const l of lessons) map.set(l.scheduledDate, [...(map.get(l.scheduledDate) ?? []), l]);
    return map;
  }, [lessons]);

  const closureByDate = useMemo(() => {
    const map = new Map<string, ClosureDate>();
    for (const c of closures) map.set(c.date, c);
    return map;
  }, [closures]);

  const unavailableDates = useMemo(() => new Set(teacherUnavailability.map((u) => u.date)), [teacherUnavailability]);

  const cells = useMemo(() => {
    const startWeekday = dayOfWeek(month);
    const daysInMonth = toEpochDay(addMonths(month, 1)) - toEpochDay(month);
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    const monthPrefix = month.slice(0, 7);
    return Array.from({ length: totalCells }, (_, i) => {
      const date = addDays(month, i - startWeekday);
      return { date, inMonth: date.startsWith(monthPrefix) };
    });
  }, [month]);

  const platformLabel = getMeetingPlatform(meetingPlatform).shortName;
  const selectedLessons = lessonsByDate.get(selectedDate) ?? [];
  const selectedClosure = closureByDate.get(selectedDate);
  const selectedUnavailable = unavailableDates.has(selectedDate) && selectedLessons.length === 0;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-brand-950">{t("calendar.title")}</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label={t("calendar.prev_month")}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-brand-600"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-bold text-brand-950">{formatMonthLabel(month)}</span>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label={t("calendar.next_month")}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-brand-600"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1">
        {weekdayLabels.map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] font-bold text-slate-400">
            {w}
          </div>
        ))}
        {cells.map(({ date, inMonth }) => {
          const dayLessons = lessonsByDate.get(date) ?? [];
          const closure = closureByDate.get(date);
          const isUnavailable = unavailableDates.has(date) && dayLessons.length === 0;
          const isSelected = date === selectedDate;
          const isToday = date === today;

          // 칸 안에 표시할 상태 태그 — 하루에 여러 수업이 있어도(드묾) 대표로 첫 수업의
          // 상태만 보여준다. 예전에는 색깔 점만 찍어서 무슨 뜻인지 한눈에 안 보였는데,
          // 짧은 텍스트 라벨로 바꿔 색을 몰라도 바로 의미를 알 수 있게 했다.
          const tagLabel = dayLessons[0]
            ? dayLessons[0].status === "academy_closed" && dayLessons[0].reason
              ? dayLessons[0].reason
              : t(`lesson_status.${dayLessons[0].status}`)
            : closure
              ? closure.label
              : isUnavailable
                ? t("lesson_status.academy_closed")
                : null;
          const tagClass = dayLessons[0]
            ? LESSON_STATUS_TAG_CLASSES[dayLessons[0].status]
            : LESSON_STATUS_TAG_CLASSES.academy_closed;

          return (
            <button
              key={date}
              onClick={() => onSelectDate(date)}
              className={`flex h-16 flex-col items-center justify-start gap-1 rounded-lg pt-1.5 text-xs transition ${
                !inMonth ? "text-slate-300" : "text-slate-600"
              } ${isSelected ? "bg-brand-600 text-white" : "hover:bg-brand-50"} ${
                isToday && !isSelected ? "font-bold text-brand-600" : ""
              }`}
            >
              <span>{Number(date.slice(8, 10))}</span>
              {tagLabel && (
                <span
                  className={`w-[90%] truncate rounded px-1 py-0.5 text-center text-[9px] font-bold leading-none ${
                    isSelected ? "bg-white/20 text-white" : tagClass
                  }`}
                >
                  {tagLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 p-4">
        {selectedLessons.length > 0 &&
          selectedLessons.map((lesson) => (
            <div key={lesson.id} className={selectedLessons.length > 1 ? "mb-3 last:mb-0" : ""}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-brand-950">
                  {selectedDate} {lesson.scheduledTime} · {courseName}
                </p>
                <LessonStatusBadge status={lesson.status} reason={lesson.reason} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t("calendar.teacher_prefix")} {teacherName} · {platformLabel}
              </p>

              {lesson.reason && lesson.status !== "academy_closed" && (
                <p className="mt-1 text-xs text-slate-500">— {lesson.reason}</p>
              )}

              {lesson.status === "completed" && (
                <div className="mt-2">
                  {lesson.evaluationStatus === "completed" ? (
                    <button
                      onClick={() => onOpenEvaluation(lesson)}
                      className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline"
                    >
                      <FileText size={13} /> {t("calendar.view_evaluation")}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">{t("calendar.evaluation_in_progress")}</span>
                  )}
                </div>
              )}

              {lesson.status === "scheduled" && (
                <div className="mt-3">
                  <EnterClassButton
                    lesson={lesson}
                    platform={meetingPlatform}
                    teacherMeetingLinks={teacherMeetingLinks}
                    entryWindow={entryWindow}
                    size="sm"
                  />
                </div>
              )}
            </div>
          ))}

        {selectedLessons.length === 0 && selectedClosure && (
          <div className="flex items-center gap-2">
            <PartyPopper size={16} className="text-orange-500" />
            <p className="text-sm font-bold text-brand-950">{t("calendar.holiday_title")}</p>
            <span className="text-xs text-slate-500">— {selectedClosure.label}</span>
          </div>
        )}

        {selectedLessons.length === 0 && !selectedClosure && selectedUnavailable && (
          <p className="text-sm text-slate-500">{t("calendar.teacher_unavailable")}</p>
        )}

        {selectedLessons.length === 0 && !selectedClosure && !selectedUnavailable && (
          <p className="text-sm text-slate-400">{t("calendar.no_lesson")}</p>
        )}
      </div>
    </div>
  );
}
