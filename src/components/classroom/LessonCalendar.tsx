import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, PartyPopper } from "lucide-react";
import type { ClosureDate, Lesson, TeacherUnavailability } from "../../lib/scheduling/types";
import type { MeetingPlatformId } from "../../data/meetingPlatforms";
import { getMeetingPlatform } from "../../data/meetingPlatforms";
import { DEFAULT_ENTRY_WINDOW, type EntryWindowSettings } from "../../data/siteSettings";
import { addDays, addMonths, dayOfWeek, firstOfMonth, toEpochDay, todayIso } from "../../lib/scheduling/dateUtils";
import { getEntryWindowSettings } from "../../services/classroomService";
import type { TeacherMeetingLinks } from "../../services/store";
import { LessonStatusBadge, LESSON_STATUS_DOT_CLASSES } from "./LessonStatusBadge";
import { EnterClassButton } from "./EnterClassButton";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatMonthLabel(month: string) {
  const [y, m] = month.split("-");
  return `${y}년 ${Number(m)}월`;
}

export function LessonCalendar({
  lessons,
  closures,
  teacherUnavailability,
  teacherName,
  courseName,
  teacherMeetingLinks,
  meetingPlatform,
  onOpenEvaluation,
}: {
  lessons: Lesson[];
  closures: ClosureDate[];
  teacherUnavailability: TeacherUnavailability[];
  teacherName: string;
  courseName: string;
  teacherMeetingLinks: TeacherMeetingLinks;
  meetingPlatform: MeetingPlatformId;
  onOpenEvaluation: (lesson: Lesson) => void;
}) {
  const today = todayIso();
  const [month, setMonth] = useState(() => firstOfMonth(today));
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const [entryWindow, setEntryWindow] = useState<EntryWindowSettings>(DEFAULT_ENTRY_WINDOW);

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
  const selectedLessons = selectedDate ? lessonsByDate.get(selectedDate) ?? [] : [];
  const selectedClosure = selectedDate ? closureByDate.get(selectedDate) : undefined;
  const selectedUnavailable = !!selectedDate && unavailableDates.has(selectedDate) && selectedLessons.length === 0;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-brand-950">수업 일정 캘린더</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label="이전 달"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-brand-600"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-bold text-brand-950">{formatMonthLabel(month)}</span>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="다음 달"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-brand-600"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w) => (
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

          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`flex h-14 flex-col items-center justify-start gap-1 rounded-lg pt-1.5 text-xs transition ${
                !inMonth ? "text-slate-300" : "text-slate-600"
              } ${isSelected ? "bg-brand-600 text-white" : "hover:bg-brand-50"} ${
                isToday && !isSelected ? "font-bold text-brand-600" : ""
              }`}
            >
              <span>{Number(date.slice(8, 10))}</span>
              <span className="flex h-2 items-center gap-0.5">
                {dayLessons.map((l) => (
                  <span
                    key={l.id}
                    className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : LESSON_STATUS_DOT_CLASSES[l.status]}`}
                  />
                ))}
                {(closure || isUnavailable) && dayLessons.length === 0 && (
                  <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-orange-400"}`} />
                )}
              </span>
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
                <LessonStatusBadge status={lesson.status} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                강사 {teacherName} · {platformLabel}
              </p>

              {lesson.status === "completed" && (
                <div className="mt-2">
                  {lesson.evaluationStatus === "completed" ? (
                    <button
                      onClick={() => onOpenEvaluation(lesson)}
                      className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline"
                    >
                      <FileText size={13} /> 학습평가서 보기
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">평가서 작성 중</span>
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
            <p className="text-sm font-bold text-brand-950">Holiday / No Class</p>
            <span className="text-xs text-slate-500">— {selectedClosure.label}</span>
          </div>
        )}

        {selectedLessons.length === 0 && !selectedClosure && selectedUnavailable && (
          <p className="text-sm text-slate-500">강사 사정으로 휴강입니다.</p>
        )}

        {selectedLessons.length === 0 && !selectedClosure && !selectedUnavailable && (
          <p className="text-sm text-slate-400">
            {selectedDate ? "예정된 수업이 없습니다." : "날짜를 선택하면 상세정보를 볼 수 있습니다."}
          </p>
        )}
      </div>
    </div>
  );
}
